const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { getChat } = require("../data/chats");
const {
  listMessages,
  addMessage,
  getMessage,
  editMessage,
  deleteMessage,
  deleteMessageForMe,
  togglePin,
  toggleReaction,
  incrementCommentCount,
  votePoll,
  markChatRead,
} = require("../data/messages");
const { getBotByUserId } = require("../data/bots");
const { getUser } = require("../data/users");
const { getSettings } = require("../data/settings");
const { broadcastToUsers } = require("../ws");
const { sendPushToUser } = require("../push");

const router = express.Router({ mergeParams: true });

// Pushes a live update to every other chat member — the sender/actor already
// has the change applied locally (optimistic UI or its own post-action
// refetch), so broadcasting back to them would just be a redundant refetch.
function broadcastToOtherMembers(chat, uid, payload) {
  broadcastToUsers(chat.memberIds.filter((id) => id !== uid), payload);
}

// Mirrors chatListItem.js's ATTACHMENT_LABEL client-side — used here only as
// a text-free push notification body when there's no message text to show.
const ATTACHMENT_LABEL = {
  image: "📷 Фото",
  video: "📹 Видео",
  file: "📄 Файл",
  voice: "🎤 Голосовое сообщение",
  "video-note": "⏺ Видео-кружок",
  poll: "📊 Опрос",
  location: "📍 Геолокация",
  contact: "👤 Контакт",
};

function messagePreview(message) {
  if (message.text?.trim()) return message.text;
  return ATTACHMENT_LABEL[message.attachments?.[0]?.kind] ?? "Новое сообщение";
}

// Real Web Push, on top of the WS broadcast above — WS only reaches a tab
// that's already open; this is what reaches a closed tab/browser. Fire-and-
// forget: sendPushToUser never rejects (see server/push.js), and delivery
// latency to an external push service has no business blocking the response.
async function pushNewMessage(chat, sender, message) {
  if (chat.muted) return;
  const isGroupLike = chat.type === "group" || chat.type === "channel";
  const title = isGroupLike ? chat.title : sender?.name ?? "Новое сообщение";
  const preview = messagePreview(message);
  const recipients = chat.memberIds.filter((id) => id !== message.senderId);
  await Promise.all(
    recipients.map(async (uid) => {
      const settings = await getSettings(uid);
      const body = !settings.notifications.previewText
        ? "Новое сообщение"
        : isGroupLike
          ? `${sender?.name ?? "Кто-то"}: ${preview}`
          : preview;
      await sendPushToUser(uid, { title, body, url: `/chat/${chat.id}`, tag: `chat-${chat.id}` });
    })
  );
}

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) {
      return res.status(404).json({ error: "not found" });
    }
    const settings = await getSettings(req.uid);
    const messages = await listMessages(req.params.id, req.uid, settings.chatClears?.[req.params.id]);

    // Fetching the message list means the viewer just looked at the chat —
    // mark anything unread by them as read (Telegram/WhatsApp-style implicit
    // read receipt, not a separate explicit action).
    const changedIds = await markChatRead(req.params.id, req.uid);
    if (changedIds.length > 0) {
      broadcastToOtherMembers(chat, req.uid, {
        type: "message:read",
        chatId: req.params.id,
        readerId: req.uid,
        messageIds: changedIds,
      });
    }

    res.json({ messages });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) {
      return res.status(404).json({ error: "not found" });
    }

    const body = req.body ?? {};
    if (!body.text?.trim() && !body.attachments?.length) {
      return res.status(400).json({ error: "empty message" });
    }

    if (chat.type === "dm") {
      const otherId = chat.memberIds.find((m) => m !== req.uid);
      const other = otherId ? await getUser(otherId) : undefined;
      if (other?.blockedUserIds?.includes(req.uid)) {
        return res.status(403).json({ error: "Пользователь заблокировал вас" });
      }
    }

    const message = await addMessage({
      id: `m_${Date.now()}`,
      chatId: req.params.id,
      senderId: req.uid,
      type: "text",
      text: body.text ?? "",
      createdAt: new Date().toISOString(),
      pinned: false,
      reactions: [],
      replyToId: body.replyToId ?? null,
      attachments: body.attachments,
      forwardedFrom: body.forwardedFrom,
      readByIds: [req.uid],
    });
    broadcastToOtherMembers(chat, req.uid, { type: "message:new", chatId: req.params.id, message });

    // Bot chats auto-reply so the composer + inline-keyboard flow is testable end to end.
    const botMemberId = chat.memberIds.find((m) => m !== req.uid);
    const bot = botMemberId ? await getBotByUserId(botMemberId) : undefined;
    if (bot) {
      const city = (body.text ?? "").replace(/^\/weather\s*/i, "").trim() || "Москва";
      const botMessage = await addMessage({
        id: `m_${Date.now() + 1}`,
        chatId: req.params.id,
        senderId: bot.userId,
        type: "text",
        text: `${city}: +${18 + (city.length % 10)}°C, переменная облачность`,
        createdAt: new Date().toISOString(),
        pinned: false,
        reactions: [],
        readByIds: [],
        keyboard: [[{ text: "Обновить", action: `/weather ${city}` }, { text: "Другой город", action: "/weather" }]],
      });
      // Unlike a human sender's message, the composer's own post-send refetch
      // never sees this one — it was created after that response — so it
      // does need to reach req.uid too, not just other members.
      broadcastToUsers([req.uid], { type: "message:new", chatId: req.params.id, message: botMessage });
    }

    // A comment on a channel post is just a reply to that post's auto-forwarded
    // anchor copy in the linked discussion chat (see server/routes/posts.js) —
    // bump the post's visible comment count when one lands.
    if (message.replyToId) {
      const anchor = await getMessage(message.replyToId);
      if (anchor?.anchorForPostId) await incrementCommentCount(anchor.anchorForPostId);
    }

    res.json({ message });

    const sender = await getUser(req.uid);
    pushNewMessage(chat, sender, message).catch((err) => console.error("push notify failed:", err));
  })
);

router.patch(
  "/:messageId",
  asyncRoute(async (req, res) => {
    const existing = await getMessage(req.params.messageId);
    if (!existing || existing.senderId !== req.uid) {
      return res.status(403).json({ error: "forbidden" });
    }
    const { text } = req.body ?? {};
    const message = await editMessage(req.params.messageId, text);
    const chat = await getChat(req.params.id);
    if (chat) broadcastToOtherMembers(chat, req.uid, { type: "message:updated", chatId: req.params.id, message });
    res.json({ message });
  })
);

router.delete(
  "/:messageId",
  asyncRoute(async (req, res) => {
    const existing = await getMessage(req.params.messageId);
    if (!existing) return res.status(404).json({ error: "not found" });
    const forEveryone = !!(req.body ?? {}).forEveryone;

    if (forEveryone) {
      // Only the sender can erase a message for everyone.
      if (existing.senderId !== req.uid) return res.status(403).json({ error: "forbidden" });
      await deleteMessage(req.params.messageId);
      const chat = await getChat(req.params.id);
      if (chat) {
        broadcastToOtherMembers(chat, req.uid, {
          type: "message:deleted",
          chatId: req.params.id,
          id: req.params.messageId,
        });
      }
      return res.json({ ok: true, id: req.params.messageId, forEveryone: true });
    }

    // "Delete for me" — any chat member can hide any message from their own
    // view. History stays intact for everyone else, so there's nothing to
    // broadcast here (unlike the forEveryone branch above).
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    await deleteMessageForMe(req.params.messageId, req.uid);
    res.json({ ok: true, id: req.params.messageId, forEveryone: false });
  })
);

router.post(
  "/:messageId/pin",
  asyncRoute(async (req, res) => {
    const { pinned } = req.body ?? {};
    const message = await togglePin(req.params.messageId, pinned);
    const chat = await getChat(req.params.id);
    if (chat) broadcastToOtherMembers(chat, req.uid, { type: "message:updated", chatId: req.params.id, message });
    res.json({ message });
  })
);

router.post(
  "/:messageId/react",
  asyncRoute(async (req, res) => {
    const { emoji } = req.body ?? {};
    const message = await toggleReaction(req.params.messageId, emoji, req.uid);
    const chat = await getChat(req.params.id);
    if (chat) broadcastToOtherMembers(chat, req.uid, { type: "message:updated", chatId: req.params.id, message });
    res.json({ message });
  })
);

router.post(
  "/:messageId/vote",
  asyncRoute(async (req, res) => {
    const { optionIndex } = req.body ?? {};
    const message = await votePoll(req.params.messageId, optionIndex, req.uid);
    const chat = await getChat(req.params.id);
    if (chat) broadcastToOtherMembers(chat, req.uid, { type: "message:updated", chatId: req.params.id, message });
    res.json({ message });
  })
);

module.exports = router;
