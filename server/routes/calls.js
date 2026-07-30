const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listCalls, createCall, getCall, updateCall, addParticipant } = require("../data/calls");
const { getChat } = require("../data/chats");
const { listUsers } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { addSignal, listSignalsFor } = require("../data/signals");
const { broadcastToUsers } = require("../ws");

const router = express.Router();
router.use(requireUserId);

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
