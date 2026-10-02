const crypto = require("crypto");
const { genId } = require("../lib/genId");
const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listCalls, createCall, getCall, updateCall, addParticipant, setJoinToken, findCallByJoinToken, removeParticipant, findActiveRoom } = require("../data/calls");
const { getChat } = require("../data/chats");
const { listUsersByIds, getUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { addSignal, listSignalsFor } = require("../data/signals");
const { allowsUser } = require("../lib/privacyRules");
const { sendMessageAndBroadcast } = require("../lib/systemChat");
const { listContactsFor } = require("../data/contacts");
const { transferStars, balanceOf } = require("../data/stars");
const { broadcastToUsers } = require("../ws");
const { sendPushToUser, userPushAvatar, CALL_PUSH, CALL_CANCEL_PUSH } = require("../push");
const { getIceServers } = require("../lib/turnCredentials");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/ice-servers",
  asyncRoute(async (req, res) => {
    res.json({ iceServers: getIceServers() });
  })
);

async function canCall(callerId, targetId) {
  return allowsUser(targetId, "calls", callerId);
}

async function chargeForColdCall(callerId, target) {
  const price = target?.messagePriceStars ?? 0;
  if (price <= 0) return { ok: true, charged: 0 };

  const theirContacts = await listContactsFor(target.id);
  if (theirContacts.some((c) => c.userId === callerId)) return { ok: true, charged: 0 };

  const caller = await getUser(callerId);
  if (caller?.isPremium) return { ok: true, charged: 0 };

  if (!transferStars(callerId, target.id, price)) {
    return {
      ok: false,
      price,
      balance: balanceOf(callerId),
    };
  }
  return { ok: true, charged: price };
}

async function pushCallCancelled(call, recipientIds, { missed = false, callerName = "" } = {}) {
  await Promise.all(
    recipientIds
      .filter((id) => id !== call.callerId)
      .map((uid) =>
        missed
          ?
            sendPushToUser(
              uid,
              {
                title: callerName || "Пропущенный звонок",
                body: callerName ? "Пропущенный звонок" : "Вам звонили",
                url: `/chat/${call.chatId}`,
                tag: `call-${call.id}`,
                kind: "call-missed",
              },
              CALL_CANCEL_PUSH
            ).catch(() => {})
          : sendPushToUser(
              uid,
              { title: "", kind: "call-cancelled", tag: `call-${call.id}`, callId: call.id },
              CALL_CANCEL_PUSH
            ).catch(() => {})
      )
  );
}

const MAX_RING_ALL = 12;
const ALLOWED_CALL_STATUSES = new Set(["ongoing", "ended", "missed", "completed", "declined"]);
const FINISHED_CALL_STATUSES = new Set(["ended", "missed", "completed", "declined"]);

async function pushIncomingCall(call, callerId, recipientIds) {
  const caller = await getUser(callerId);
  const title = caller?.name ?? "Входящий звонок";
  const body = call.kind === "video" ? "Видеозвонок…" : "Звонит…";
  await Promise.all(
    recipientIds
      .filter((id) => id !== callerId)
      .map(async (uid) =>
        sendPushToUser(uid, {
          title,
          body,
          ...(await userPushAvatar(caller, uid)),
          url: `/call/${call.id}`,
          tag: `call-${call.id}`,
          requireInteraction: true,
          kind: "call",
          callId: call.id,
        }, CALL_PUSH)
      )
  );
}

async function withCaller(call) {
  const caller = await getUser(call.callerId);
  return { ...call, otherUser: caller ? publicUser(caller) : undefined };
}

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const calls = await listCalls(req.uid);
    const otherIds = [...new Set(calls.flatMap((c) => c.participantIds).filter((id) => id !== req.uid))];
    const users = await listUsersByIds(otherIds);
    const byId = new Map(users.map((u) => [u.id, u]));
    const groupTitles = new Map();
    for (const chatId of new Set(calls.map((c) => c.chatId))) {
      const chat = await getChat(chatId).catch(() => null);
      if (chat && chat.type !== "dm") groupTitles.set(chatId, { title: chat.title, avatarColor: chat.avatarColor, avatarImage: chat.avatarImage });
    }
    const resolved = calls.map((call) => {
      const otherId = call.participantIds.find((id) => id !== req.uid);
      const other = otherId ? byId.get(otherId) : null;
      return {
        ...call,
        direction: call.callerId === req.uid ? "outgoing" : "incoming",
        otherUser: other ? publicUser(other) : null,
        group: groupTitles.get(call.chatId) ?? null,
      };
    });
    res.json({ calls: resolved });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { chatId, kind, ringAll } = req.body ?? {};
    const chat = await getChat(chatId);
    if (!chat || !chat.memberIds.includes(req.uid)) {
      return res.status(404).json({ error: "not found" });
    }
    let ringIds = null;
    if (chat.type === "group" && ringAll) {
      if (chat.memberIds.length > MAX_RING_ALL) {
        return res.status(400).json({
          error: `В группе больше ${MAX_RING_ALL} участников — позвонить всем сразу нельзя. Начните голосовой чат`,
        });
      }
      const others = chat.memberIds.filter((id) => id !== req.uid);
      const allowed = await Promise.all(others.map((id) => canCall(req.uid, id)));
      ringIds = [req.uid, ...others.filter((_, i) => allowed[i])];
    }
    if (chat.type !== "group") {
      const otherId = chat.memberIds.find((id) => id !== req.uid);
      if (otherId && !(await canCall(req.uid, otherId))) {
        return res.status(403).json({ error: "Пользователь ограничил звонки" });
      }
      if (otherId) {
        const target = await getUser(otherId);
        const charge = await chargeForColdCall(req.uid, target);
        if (!charge.ok) {
          return res.status(402).json({
            error: `Этот пользователь берёт ${charge.price} ⭐ за звонок от незнакомых. Не хватает звёзд. С Premium звонить можно бесплатно`,
            needStars: charge.price,
            balance: charge.balance,
            premiumHelps: true,
          });
        }
      }
    }
    const call = await createCall({
      id: genId("cl"),
      chatId,
      kind,
      direction: "outgoing",
      callerId: req.uid,
      participantIds: ringIds ?? (chat.type === "group" ? [req.uid] : chat.memberIds),
      status: "ongoing",
      startedAt: new Date().toISOString(),
      durationSec: 0,
    });
    broadcastToUsers(call.participantIds.filter((id) => id !== req.uid), {
      type: "call:incoming",
      call: await withCaller(call),
    });
    res.json({ call });

    pushIncomingCall(call, req.uid, call.participantIds).catch((err) => console.error("push notify failed:", err));
  })
);

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const existing = await getCall(req.params.id);
    if (!existing || !existing.participantIds.includes(req.uid)) return res.status(404).json({ error: "not found" });

    if (
      FINISHED_CALL_STATUSES.has(req.body?.status) &&
      existing.status === "ongoing" &&
      existing.kind !== "voice-room" &&
      existing.callerId !== req.uid &&
      existing.participantIds.length > 2
    ) {
      const updated = await leaveCall(existing, req.uid);
      return res.json({ call: updated });
    }

    const patch = {};
    if (ALLOWED_CALL_STATUSES.has(req.body?.status)) patch.status = req.body.status;
    if (Number.isFinite(req.body?.durationSec)) patch.durationSec = Math.max(0, Math.floor(req.body.durationSec));
    if (!Object.keys(patch).length) return res.json({ call: existing });

    const call = await updateCall(req.params.id, patch);
    if (call) {
      broadcastToUsers(call.participantIds, { type: "call:updated", call });
      if (FINISHED_CALL_STATUSES.has(patch.status) && existing.status === "ongoing") {
        const answered = patch.status === "completed" && (patch.durationSec ?? 0) > 0;
        const mins = Math.floor((patch.durationSec ?? 0) / 60);
        const secs = (patch.durationSec ?? 0) % 60;
        const label = answered
          ? `📞 ${call.kind === "video" ? "Видеозвонок" : "Звонок"} · ${mins}:${String(secs).padStart(2, "0")}`
          : patch.status === "declined"
            ? "📞 Звонок отклонён"
            : "📞 Пропущенный звонок";
        const chat = await getChat(call.chatId).catch(() => null);
        if (chat) {
          await sendMessageAndBroadcast(chat, call.callerId, label, { type: "call" }).catch(() => {});
        }
      }
      if (FINISHED_CALL_STATUSES.has(patch.status)) {
        const missed = patch.status === "missed";
        const caller = missed ? await getUser(call.callerId).catch(() => null) : null;
        pushCallCancelled(call, call.participantIds, { missed, callerName: caller?.name ?? "" }).catch((err) =>
          console.error("push cancel failed:", err)
        );
      }
    }
    res.json({ call });
  })
);

router.post(
  "/:id/answer",
  asyncRoute(async (req, res) => {
    const call = await getCall(req.params.id);
    if (!call || !call.participantIds.includes(req.uid)) return res.json({ ok: true });
    broadcastToUsers([req.uid], { type: "call:answered", callId: call.id });
    res.json({ ok: true });
  })
);

router.post(
  "/:id/participants",
  asyncRoute(async (req, res) => {
    const { userId } = req.body ?? {};
    const call = await getCall(req.params.id);
    if (!call) return res.status(404).json({ error: "not found" });
    if (!call.participantIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    if (call.participantIds.includes(userId)) return res.json({ call });
    if (!(await canCall(req.uid, userId))) {
      return res.status(403).json({ error: "Пользователь ограничил звонки" });
    }
    const updated = await addParticipant(req.params.id, userId);
    broadcastToUsers(
      updated.participantIds.filter((id) => id !== userId),
      { type: "call:participants-updated", call: updated }
    );
    broadcastToUsers([userId], { type: "call:incoming", call: await withCaller(updated) });
    res.json({ call: updated });

    pushIncomingCall(updated, updated.callerId, [userId]).catch((err) => console.error("push notify failed:", err));
  })
);

async function leaveCall(call, uid) {
  let updated = await removeParticipant(call.id, uid);
  if (updated.participantIds.length < 2 && updated.status === "ongoing") {
    const durationSec = Math.max(0, Math.floor((Date.now() - new Date(call.startedAt).getTime()) / 1000));
    updated = await updateCall(call.id, { status: "completed", durationSec });
    broadcastToUsers(updated.participantIds, { type: "call:updated", call: updated });
  } else {
    broadcastToUsers(updated.participantIds, { type: "call:participants-updated", call: updated });
  }
  return updated;
}

router.post(
  "/:id/leave",
  asyncRoute(async (req, res) => {
    const call = await getCall(req.params.id);
    if (!call || !call.participantIds.includes(req.uid)) return res.json({ ok: true });
    await leaveCall(call, req.uid);
    res.json({ ok: true });
  })
);

router.delete(
  "/:id/participants/:userId",
  asyncRoute(async (req, res) => {
    const call = await getCall(req.params.id);
    if (!call || !call.participantIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    if (call.callerId !== req.uid) return res.status(403).json({ error: "Убрать участника может только тот, кто начал звонок" });
    if (req.params.userId === req.uid) return res.status(400).json({ error: "Чтобы выйти самому, завершите звонок" });
    if (!call.participantIds.includes(req.params.userId)) return res.json({ call });

    const updated = await removeParticipant(req.params.id, req.params.userId);
    broadcastToUsers([req.params.userId], { type: "call:updated", call: { ...updated, status: "ended" } });
    broadcastToUsers(updated.participantIds, { type: "call:participants-updated", call: updated });
    res.json({ call: updated });
  })
);

router.get(
  "/room/:chatId",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.chatId);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    const room = await findActiveRoom(req.params.chatId);
    res.json({ call: room ?? null });
  })
);

router.post(
  "/room/:chatId/join",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.chatId);
    if (!chat || !chat.memberIds.includes(req.uid) || chat.type !== "group") {
      return res.status(404).json({ error: "not found" });
    }

    let room = await findActiveRoom(req.params.chatId);
    if (!room) {
      room = await createCall({
        id: genId("cl"),
        chatId: chat.id,
        kind: "voice-room",
        direction: "outgoing",
        callerId: req.uid,
        participantIds: [req.uid],
        status: "ongoing",
        startedAt: new Date().toISOString(),
        durationSec: 0,
      });
    } else if (!room.participantIds.includes(req.uid)) {
      room = await addParticipant(room.id, req.uid);
    }

    broadcastToUsers(room.participantIds.filter((id) => id !== req.uid), { type: "call:participants-updated", call: room });
    broadcastToUsers(chat.memberIds, { type: "voicechat:updated", chatId: chat.id, call: room });

    res.json({ call: room });
  })
);

router.post(
  "/room/:chatId/leave",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.chatId);
    if (!chat) return res.status(404).json({ error: "not found" });
    const room = await findActiveRoom(req.params.chatId);
    if (!room || !room.participantIds.includes(req.uid)) return res.json({ ok: true });

    let updated = await removeParticipant(room.id, req.uid);
    if (!updated.participantIds.length) updated = await updateCall(room.id, { status: "ended" });

    broadcastToUsers(updated.participantIds, { type: "call:participants-updated", call: updated });
    broadcastToUsers(chat.memberIds, {
      type: "voicechat:updated",
      chatId: chat.id,
      call: updated.status === "ongoing" ? updated : null,
    });
    res.json({ ok: true });
  })
);

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
