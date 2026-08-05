const crypto = require("crypto");
const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listCalls, createCall, getCall, updateCall, addParticipant, setJoinToken, findCallByJoinToken } = require("../data/calls");
const { getChat } = require("../data/chats");
const { listUsers, getUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { addSignal, listSignalsFor } = require("../data/signals");
const { getSettings } = require("../data/settings");
const { listContactsFor } = require("../data/contacts");
const { broadcastToUsers } = require("../ws");
const { sendPushToUser } = require("../push");

const router = express.Router();
router.use(requireUserId);

// "Who can call me" (Settings → Конфиденциальность) — same everyone/
// contacts/nobody shape, checked against the *target's* own contact list
// (same asymmetric sense as the invites check in routes/chats.js and the
// profile-view privacy check in routes/users.js), not the caller's.
async function canCall(callerId, targetId) {
  if (callerId === targetId) return true;
  const { privacy } = await getSettings(targetId);
  const setting = privacy?.calls ?? "everyone";
  if (setting === "everyone") return true;
  if (setting === "nobody") return false;
  const targetsContacts = await listContactsFor(targetId);
  return targetsContacts.some((c) => c.userId === callerId);
}

// Real Web Push for the ring, same reasoning as pushNewMessage in
// server/routes/messages.js — the WS broadcast above only reaches an already-
// open tab. requireInteraction keeps it on screen instead of auto-dismissing
// like a normal notification, since a missed-call notice that vanishes in a
// few seconds defeats the point.
async function pushIncomingCall(call, callerId, recipientIds) {
  const caller = await getUser(callerId);
  const title = caller?.name ?? "Входящий звонок";
  const body = call.kind === "video" ? "Видеозвонок…" : "Звонит…";
  await Promise.all(
    recipientIds
      .filter((id) => id !== callerId)
      .map((uid) =>
        sendPushToUser(uid, {
          title,
          body,
          url: `/call/${call.id}`,
          tag: `call-${call.id}`,
          requireInteraction: true,
        })
      )
  );
}

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const [calls, users] = await Promise.all([listCalls(req.uid), listUsers()]);
    const resolved = calls.map((call) => {
      const other = users.find((u) => call.participantIds.includes(u.id) && u.id !== req.uid);
      return { ...call, otherUser: other ? publicUser(other) : null };
    });
    res.json({ calls: resolved });
  })
);

// Places a call: creates the Call record; actual media transport is real
// WebRTC set up client-side (see public/js/lib/webrtc.js), signaled over WS.
router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { chatId, kind } = req.body ?? {};
    const chat = await getChat(chatId);
    if (!chat || !chat.memberIds.includes(req.uid)) {
      return res.status(404).json({ error: "not found" });
    }
    if (chat.type !== "group") {
      const otherId = chat.memberIds.find((id) => id !== req.uid);
      if (otherId && !(await canCall(req.uid, otherId))) {
        return res.status(403).json({ error: "Пользователь ограничил звонки" });
      }
    }
    // DM calls ring both members immediately. Group calls start with just the
    // caller — other group members are pulled in one at a time via
    // POST /:id/participants, so "add participant" has anyone left to add.
    const call = await createCall({
      id: `cl_${Date.now()}`,
      chatId,
      kind,
      direction: "outgoing",
      callerId: req.uid,
      participantIds: chat.type === "group" ? [req.uid] : chat.memberIds,
      status: "ongoing",
      startedAt: new Date().toISOString(),
      durationSec: 0,
    });
    broadcastToUsers(call.participantIds.filter((id) => id !== req.uid), {
      type: "call:incoming",
      call,
    });
    res.json({ call });

    pushIncomingCall(call, req.uid, call.participantIds).catch((err) => console.error("push notify failed:", err));
  })
);

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const call = await updateCall(req.params.id, req.body ?? {});
    if (call) {
      broadcastToUsers(call.participantIds, { type: "call:updated", call });
    }
    res.json({ call });
  })
);

// Adds a participant to an ongoing call — each existing peer grows its mesh
// by opening a new RTCPeerConnection to the newcomer (public/js/lib/webrtc.js).
router.post(
  "/:id/participants",
  asyncRoute(async (req, res) => {
    const { userId } = req.body ?? {};
    const call = await getCall(req.params.id);
    if (!call) return res.status(404).json({ error: "not found" });
    if (!(await canCall(req.uid, userId))) {
      return res.status(403).json({ error: "Пользователь ограничил звонки" });
    }
    const updated = await addParticipant(req.params.id, userId);
    // Existing peers grow their mesh to include the newcomer...
    broadcastToUsers(
      updated.participantIds.filter((id) => id !== userId),
      { type: "call:participants-updated", call: updated }
    );
    // ...and the newcomer gets the same incoming-call prompt as a fresh call,
    // since they haven't joined a call controller yet.
    broadcastToUsers([userId], { type: "call:incoming", call: updated });
    res.json({ call: updated });

    pushIncomingCall(updated, updated.callerId, [userId]).catch((err) => console.error("push notify failed:", err));
  })
);

// Premium's "invite by link" — generates (or returns the existing) join
// token for an ongoing call, so it can be shared outside the chat itself
// (any messenger, not just Shalter). Anyone with the link can join the
// call's mesh via POST /join/:token below, without needing to already be a
// member of the underlying chat — see joinCallById's fallback in
// public/js/lib/callController.js for how the client copes with that.
router.post(
  "/:id/invite-link",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (!me.isPremium) return res.status(403).json({ error: "Ссылки на звонок доступны только с Shalter Premium" });

    const call = await getCall(req.params.id);
    if (!call || !call.participantIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    if (call.status !== "ongoing") return res.status(400).json({ error: "Звонок уже завершён" });

    const token = call.joinToken ?? crypto.randomBytes(16).toString("hex");
    if (!call.joinToken) await setJoinToken(call.id, token);

    const origin = `${req.protocol}://${req.get("host")}`;
    res.json({ url: `${origin}/call-join/${token}` });
  })
);

router.post(
  "/join/:token",
  asyncRoute(async (req, res) => {
    const call = await findCallByJoinToken(req.params.token);
    if (!call || call.status !== "ongoing") {
      return res.status(404).json({ error: "Ссылка недействительна или звонок уже завершён" });
    }
    const updated = await addParticipant(call.id, req.uid);
    broadcastToUsers(
      updated.participantIds.filter((id) => id !== req.uid),
      { type: "call:participants-updated", call: updated }
    );
    res.json({ call: updated });
  })
);

// HTTP fallback/catch-up for signaling (primary transport is WebSocket, see
// server/ws.js) — used on reconnect after a dropped WS connection or page reload.
router.get(
  "/:id/signal",
  asyncRoute(async (req, res) => {
    const call = await getCall(req.params.id);
    if (!call || !call.participantIds.includes(req.uid)) {
      return res.status(404).json({ error: "not found" });
    }
    const after = Number(req.query.after ?? "0");
    const signals = await listSignalsFor(req.params.id, req.uid, Number.isFinite(after) ? after : 0);
    res.json({ signals });
  })
);

router.post(
  "/:id/signal",
  asyncRoute(async (req, res) => {
    const call = await getCall(req.params.id);
    if (!call || !call.participantIds.includes(req.uid)) {
      return res.status(404).json({ error: "not found" });
    }
    const { toUserId, kind, data } = req.body ?? {};
    if (!call.participantIds.includes(toUserId)) {
      return res.status(400).json({ error: "invalid recipient" });
    }
    const signal = await addSignal({ callId: req.params.id, fromUserId: req.uid, toUserId, kind, data });
    broadcastToUsers([toUserId], { type: "call:signal", signal });
    res.json({ signal });
  })
);

module.exports = router;
