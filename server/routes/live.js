const crypto = require("crypto");
const http = require("http");
const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getChat } = require("../data/chats");
const { getUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { isStaff } = require("../lib/chatPermissions");
const { broadcastToUsers } = require("../ws");
const live = require("../data/liveStreams");
const { hasAdminSection } = require("../lib/adminAccess");
const rtmp = require("../rtmp");

const router = express.Router();
router.use(requireUserId);

const MAX_MESSAGE_LEN = 500;

async function loadStream(req, res) {
  const stream = live.getStream(req.params.id);
  if (!stream) {
    res.status(404).json({ error: "Эфир не найден" });
    return null;
  }
  const chat = await getChat(stream.chatId);
  if (!chat || !chat.memberIds.includes(req.uid)) {
    res.status(403).json({ error: "Нет доступа к этому эфиру" });
    return null;
  }
  return { stream, chat };
}

function requireHost(stream, req, res) {
  if (stream.hostId !== req.uid) {
    res.status(403).json({ error: "Управлять эфиром может только ведущий" });
    return false;
  }
  return true;
}

function canStopStream(stream, chat, userId) {
  return stream.hostId === userId || isStaff(chat, userId);
}

function ingestFor(stream, req) {
  if (stream.source !== "rtmp" || stream.hostId !== req.uid) return null;
  return { url: rtmp.ingestUrlFor(req.headers.host), key: live.getStreamKey(stream.id) };
}

async function stateOf(stream) {
  const participants = live.listParticipants(stream.id);
  const users = await Promise.all(participants.map((p) => getUser(p.userId)));
  const messages = live.listMessages(stream.id);
  const authors = await Promise.all(messages.map((m) => getUser(m.userId)));
  return {
    stream,
    participants: participants.map((p, i) => ({ ...p, user: users[i] ? publicUser(users[i]) : { id: p.userId, name: "—" } })),
    messages: messages.map((m, i) => ({
      id: m.id,
      text: m.text,
      createdAt: m.createdAt,
      editedAt: m.editedAt ?? undefined,
      user: authors[i] ? publicUser(authors[i]) : { id: m.userId, name: "—" },
    })),
  };
}

function broadcastState(stream, extra = {}) {
  const ids = live.listParticipants(stream.id).map((p) => p.userId);
  broadcastToUsers(ids, { type: "live:state", streamId: stream.id, ...extra });
}

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.body?.chatId);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "Чат не найден" });
    if (chat.type === "dm") return res.status(400).json({ error: "Эфир бывает в канале или группе — для двоих есть звонок" });
    if (!isStaff(chat, req.uid)) return res.status(403).json({ error: "Начать эфир может только администратор" });

    const already = live.getLiveStreamForChat(chat.id);
    if (already) return res.json({ stream: already, already: true, ingest: ingestFor(already, req) });

    const source = req.body?.source === "rtmp" ? "rtmp" : "webrtc";
    const stream = live.createStream({
      chatId: chat.id,
      hostId: req.uid,
      title: String(req.body?.title ?? "").trim().slice(0, 80),
      withVideo: req.body?.withVideo !== false,
      source,
      streamKey: source === "rtmp" ? crypto.randomBytes(16).toString("hex") : null,
    });
    broadcastToUsers(chat.memberIds, { type: "live:started", chatId: chat.id, stream });
    res.json({ stream, ingest: ingestFor(stream, req) });
  })
);

router.get(
  "/chat/:chatId",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.chatId);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "Чат не найден" });
    const canHost = isStaff(chat, req.uid);
    const stream = live.getLiveStreamForChat(chat.id);
    if (!stream) return res.json({ stream: null, viewers: 0, canHost });
    res.json({
      stream,
      viewers: live.listParticipants(stream.id).length,
      canHost,
      canStop: canStopStream(stream, chat, req.uid),
    });
  })
);

router.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found) return;
    res.json({ ...(await stateOf(found.stream)), ingest: ingestFor(found.stream, req) });
  })
);

router.get(
  "/:id/feed.flv",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found) return;
    if (found.stream.source !== "rtmp") return res.status(404).json({ error: "Этот эфир идёт не через OBS" });

    const url = rtmp.internalFlvUrl(live.getStreamKey(found.stream.id));
    if (!url) return res.status(404).json({ error: "Поток не найден" });

    const upstream = http.get(url, (feed) => {
      if (feed.statusCode !== 200) {
        feed.resume();
        if (!res.headersSent) res.status(503).json({ error: "Вещание не идёт" });
        return;
      }
      res.setHeader("Content-Type", "video/x-flv");
      res.setHeader("Cache-Control", "no-store, no-transform");
      feed.pipe(res);
    });
    upstream.on("error", () => {
      if (!res.headersSent) res.status(503).json({ error: "Вещание не идёт" });
      else res.end();
    });
    res.on("close", () => upstream.destroy());
  })
);

router.post(
  "/:id/join",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found) return;
    if (found.stream.status !== "live") return res.status(410).json({ error: "Эфир уже завершён" });
    const role = found.stream.hostId === req.uid ? "host" : undefined;
    live.setParticipant(found.stream.id, req.uid, role ? { role } : {});
    broadcastState(found.stream);
    res.json({ ...(await stateOf(found.stream)), ingest: ingestFor(found.stream, req) });
  })
);

router.post(
  "/:id/leave",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found) return;
    live.removeParticipant(found.stream.id, req.uid);

    if (found.stream.hostId === req.uid && found.stream.status === "live") {
      const stream = live.endStream(found.stream.id);
      broadcastToUsers(found.chat.memberIds, { type: "live:ended", chatId: stream.chatId, streamId: stream.id });
      return res.json({ ok: true, ended: true });
    }

    broadcastToUsers([...live.listParticipants(found.stream.id).map((p) => p.userId), req.uid], {
      type: "live:state",
      streamId: found.stream.id,
    });
    res.json({ ok: true });
  })
);

router.post(
  "/:id/hand",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found) return;
    const me = live.getParticipant(found.stream.id, req.uid);
    if (!me) return res.status(404).json({ error: "Вы не в эфире" });
    live.setParticipant(found.stream.id, req.uid, { handRaised: req.body?.raised !== false });
    broadcastState(found.stream);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/participants/:userId/role",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found || !requireHost(found.stream, req, res)) return;
    const role = req.body?.role === "speaker" ? "speaker" : "viewer";
    const target = live.getParticipant(found.stream.id, req.params.userId);
    if (!target) return res.status(404).json({ error: "Этого человека нет в эфире" });
    if (target.role === "host") return res.status(400).json({ error: "Ведущего нельзя лишить слова" });

    live.setParticipant(found.stream.id, req.params.userId, { role, handRaised: false, mutedByHost: false });
    broadcastState(found.stream);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/participants/:userId/mute",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found || !requireHost(found.stream, req, res)) return;
    const target = live.getParticipant(found.stream.id, req.params.userId);
    if (!target) return res.status(404).json({ error: "Этого человека нет в эфире" });
    live.setParticipant(found.stream.id, req.params.userId, { mutedByHost: req.body?.muted !== false });
    broadcastState(found.stream);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/stop",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found) return;
    if (!canStopStream(found.stream, found.chat, req.uid)) {
      return res.status(403).json({ error: "Завершить эфир может ведущий или администратор чата" });
    }
    if (found.stream.status !== "live") return res.json({ stream: found.stream });
    if (found.stream.source === "rtmp") rtmp.stopPublisher(live.getStreamKey(found.stream.id));
    const stream = live.endStream(found.stream.id);
    broadcastToUsers(found.chat.memberIds, { type: "live:ended", chatId: stream.chatId, streamId: stream.id });
    res.json({ stream });
  })
);

router.post(
  "/:id/messages",
  asyncRoute(async (req, res) => {
    const found = await loadStream(req, res);
    if (!found) return;
    if (found.stream.status !== "live") return res.status(410).json({ error: "Эфир завершён" });
    const text = String(req.body?.text ?? "").trim().slice(0, MAX_MESSAGE_LEN);
    if (!text) return res.status(400).json({ error: "Пустое сообщение" });

    const saved = live.addMessage(found.stream.id, req.uid, text);
    const user = await getUser(req.uid);
    const message = { id: saved.id, text: saved.text, createdAt: saved.createdAt, user: publicUser(user) };
    broadcastToUsers(
      live.listParticipants(found.stream.id).map((p) => p.userId),
      { type: "live:message", streamId: found.stream.id, message }
    );
    res.json({ message });
  })
);

async function loadLiveMessage(req, res) {
  const found = await loadStream(req, res);
  if (!found) return null;
  const message = live.getMessage(req.params.messageId);
  if (!message || message.streamId !== found.stream.id) {
    res.status(404).json({ error: "Сообщение не найдено" });
    return null;
  }
  return { ...found, message };
}

function participantIds(stream) {
  return live.listParticipants(stream.id).map((p) => p.userId);
}

router.patch(
  "/:id/messages/:messageId",
  asyncRoute(async (req, res) => {
    const found = await loadLiveMessage(req, res);
    if (!found) return;
    if (found.message.userId !== req.uid) return res.status(403).json({ error: "Править можно только своё сообщение" });
    const text = String(req.body?.text ?? "").trim().slice(0, MAX_MESSAGE_LEN);
    if (!text) return res.status(400).json({ error: "Пустое сообщение" });

    const saved = live.editMessage(found.message.id, text);
    const message = { id: saved.id, text: saved.text, createdAt: saved.createdAt, editedAt: saved.editedAt, user: publicUser(await getUser(req.uid)) };
    broadcastToUsers(participantIds(found.stream), { type: "live:message-updated", streamId: found.stream.id, message });
    res.json({ message });
  })
);

router.delete(
  "/:id/messages/:messageId",
  asyncRoute(async (req, res) => {
    const found = await loadLiveMessage(req, res);
    if (!found) return;
    const allowed =
      found.message.userId === req.uid ||
      canStopStream(found.stream, found.chat, req.uid) ||
      hasAdminSection(await getUser(req.uid), "moderation");
    if (!allowed) return res.status(403).json({ error: "Удалить чужое сообщение может ведущий или администратор чата" });

    live.deleteMessage(found.message.id);
    broadcastToUsers(participantIds(found.stream), { type: "live:message-deleted", streamId: found.stream.id, messageId: found.message.id });
    res.json({ ok: true });
  })
);

module.exports = router;
