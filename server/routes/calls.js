const crypto = require("crypto");
const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listCalls, createCall, getCall, updateCall, addParticipant, setJoinToken, findCallByJoinToken, removeParticipant } = require("../data/calls");
const { getChat } = require("../data/chats");
const { listUsersByIds, getUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { addSignal, listSignalsFor } = require("../data/signals");
const { allowsUser } = require("../lib/privacyRules");
const { broadcastToUsers } = require("../ws");
const { sendPushToUser, CALL_PUSH, CALL_CANCEL_PUSH } = require("../push");

const router = express.Router();
router.use(requireUserId);

// "Who can call me" (Settings → Конфиденциальность) — уровень «Все / Мои
// контакты / Никто» плюс поимённые исключения, всё в server/lib/privacyRules.js.
// Проверяется по контактам *того, кому звонят* (та же несимметричность, что у
// добавления в чаты в routes/chats.js и у просмотра профиля в routes/users.js),
// а не по контактам звонящего.
async function canCall(callerId, targetId) {
  return allowsUser(targetId, "calls", callerId);
}

// Real Web Push for the ring, same reasoning as pushNewMessage in
// server/routes/messages.js — the WS broadcast above only reaches an already-
// open tab. requireInteraction keeps it on screen instead of auto-dismissing
// like a normal notification, since a missed-call notice that vanishes in a
// few seconds defeats the point.
// Звонок кончился, а уведомление о нём висит на экране — оно с
// requireInteraction и само не гаснет. В итоге человек возвращается к телефону,
// видит «вам звонят» и жмёт «Ответить» на разговор, которого уже нет.
//
// Поэтому вдогонку уходит второе уведомление — с тем же тегом и пометкой
// «отменено»: public/sw.js по ней закрывает висящее и ничего нового не
// показывает.
async function pushCallCancelled(call, recipientIds) {
  await Promise.all(
    recipientIds
      .filter((id) => id !== call.callerId)
      .map((uid) =>
        sendPushToUser(
          uid,
          { title: "", kind: "call-cancelled", tag: `call-${call.id}`, callId: call.id },
          CALL_CANCEL_PUSH
        ).catch(() => {})
      )
  );
}

// Все состояния, в которые звонок может перейти по запросу клиента.
// «ongoing» — идёт; остальные означают, что он кончился, и различаются только
// тем, что покажет журнал звонков.
const ALLOWED_CALL_STATUSES = new Set(["ongoing", "ended", "missed", "completed", "declined"]);
const FINISHED_CALL_STATUSES = new Set(["ended", "missed", "completed", "declined"]);

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
          // По этим двум полям public/sw.js понимает, что показывать надо
          // звонок: с вибрацией и кнопками «Ответить» / «Отклонить», которые
          // работают, не открывая приложение.
          kind: "call",
          callId: call.id,
        }, CALL_PUSH)
      )
  );
}

// Кто звонит — вместе с самим звонком.
//
// Экран входящего показывает имя и аватар звонящего, а в записи звонка есть
// только его идентификатор: без этого на весь экран было написано «Звонок» и
// стояла заглушка вместо лица. Отдаём карточку прямо в событии, чтобы
// принимающему не пришлось делать ещё один запрос ровно в тот момент, когда
// на экране должно немедленно появиться, кто звонит.
async function withCaller(call) {
  const caller = await getUser(call.callerId);
  return { ...call, otherUser: caller ? publicUser(caller) : undefined };
}

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const calls = await listCalls(req.uid);
    // Только собеседники из этих звонков, а не вся таблица аккаунтов. Раньше
    // здесь читались все пользователи сервера вместе с аватарами — на 50
    // тысячах это секунда и полгигабайта памяти на один заход в «Звонки»
    // (замер, см. data/users.js: findUserIdsByUsernames).
    const otherIds = [...new Set(calls.flatMap((c) => c.participantIds).filter((id) => id !== req.uid))];
    const users = await listUsersByIds(otherIds);
    const byId = new Map(users.map((u) => [u.id, u]));
    const resolved = calls.map((call) => {
      const otherId = call.participantIds.find((id) => id !== req.uid);
      const other = otherId ? byId.get(otherId) : null;
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
      call: await withCaller(call),
    });
    res.json({ call });

    pushIncomingCall(call, req.uid, call.participantIds).catch((err) => console.error("push notify failed:", err));
  })
);

// Изменение звонка — только его участником и только в тех полях, которые
// звонку и принадлежат.
//
// Раньше тело запроса уходило в updateCall как есть и без единой проверки: имея
// чужой идентификатор звонка, посторонний мог завершить чужой разговор, а
// заодно переписать в записи любое поле. Проверку добавил здесь, а не в
// клиенте, потому что сброс звонка теперь умеет делать и уведомление
// (public/sw.js) — то есть запрос приходит вообще не из приложения.
router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const existing = await getCall(req.params.id);
    if (!existing || !existing.participantIds.includes(req.uid)) return res.status(404).json({ error: "not found" });

    const patch = {};
    // Список должен совпадать с тем, что шлёт клиент, иначе изменение молча
    // выбрасывается. Ровно это и происходило: «Сбросить» отправляет
    // «completed», отклонение входящего — «declined», а сюда пропускались
    // только три других значения. Статус оставался «ongoing», рассылка уходила
    // со старым значением, и у второй стороны звонок не завершался никогда —
    // экран висел до перезагрузки страницы.
    if (ALLOWED_CALL_STATUSES.has(req.body?.status)) patch.status = req.body.status;
    if (Number.isFinite(req.body?.durationSec)) patch.durationSec = Math.max(0, Math.floor(req.body.durationSec));
    if (!Object.keys(patch).length) return res.json({ call: existing });

    const call = await updateCall(req.params.id, patch);
    if (call) {
      broadcastToUsers(call.participantIds, { type: "call:updated", call });
      // Звонок закончился — снимаем висящее уведомление о нём.
      //
      // Без оговорок про прежний статус: звонок заводится сразу «ongoing» (см.
      // data/calls.js), поэтому условие «а раньше он не шёл» не выполнялось
      // никогда и отмена не уходила ни разу. Лишний раз послать её безвредно:
      // у того, кто уже ответил, уведомление закрыто нажатием, и воркер просто
      // не найдёт, что закрывать.
      if (FINISHED_CALL_STATUSES.has(patch.status)) {
        pushCallCancelled(call, call.participantIds).catch((err) => console.error("push cancel failed:", err));
      }
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
    // Only from inside the call: without this anyone who knew a call id could
    // pull a stranger into someone else's conversation.
    if (!call.participantIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    if (call.participantIds.includes(userId)) return res.json({ call });
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
    broadcastToUsers([userId], { type: "call:incoming", call: await withCaller(updated) });
    res.json({ call: updated });

    pushIncomingCall(updated, updated.callerId, [userId]).catch((err) => console.error("push notify failed:", err));
  })
);

// Removing someone from a call. The counterpart of /participants above, which
// could pull anyone in with no way to put them out — a call that someone joined
// by a leaked link could only be escaped by everyone else hanging up.
//
// Only the person who started the call, and only on someone else: leaving your
// own call is what PATCH /:id (status "ended") and simply hanging up already do.
router.delete(
  "/:id/participants/:userId",
  asyncRoute(async (req, res) => {
    const call = await getCall(req.params.id);
    if (!call || !call.participantIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    if (call.callerId !== req.uid) return res.status(403).json({ error: "Убрать участника может только тот, кто начал звонок" });
    if (req.params.userId === req.uid) return res.status(400).json({ error: "Чтобы выйти самому, завершите звонок" });
    if (!call.participantIds.includes(req.params.userId)) return res.json({ call });

    const updated = await removeParticipant(req.params.id, req.params.userId);
    // The one removed is told so their call screen closes, and everyone still in
    // it rebuilds their mesh without that peer.
    broadcastToUsers([req.params.userId], { type: "call:updated", call: { ...updated, status: "ended" } });
    broadcastToUsers(updated.participantIds, { type: "call:participants-updated", call: updated });
    res.json({ call: updated });
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
