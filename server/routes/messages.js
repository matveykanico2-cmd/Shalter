const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { getChat } = require("../data/chats");
const { sanitizeAttachments } = require("../lib/sanitizeAttachments");
const {
  listMessages,
  listThreadReplies,
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
  setLinkPreview,
} = require("../data/messages");
const { getUser, listUsers } = require("../data/users");
const { getSettings } = require("../data/settings");
const { listContactsFor } = require("../data/contacts");
const { listScheduledFor, addScheduled, editScheduled, deleteScheduled, getScheduled } = require("../data/scheduledMessages");
const { getBotByUserId } = require("../data/bots");
const { runBotCode } = require("../lib/botSandbox");
const { broadcastToUsers } = require("../ws");
const { sendPushToUser } = require("../push");
const { fetchLinkPreview } = require("../lib/linkPreview");

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

// Resolves "@handle" tokens in the just-sent text against this chat's
// actual members (not every user in the system — mentioning someone who
// isn't in the chat shouldn't notify a stranger), computed once at send
// time rather than re-parsed by every reader (see db.js's mentionedUserIds
// column). Drives pushNewMessage's wording below and the chat list's
// unread-mention badge (chat-summary.js).
async function resolveMentions(text, memberIds, senderId) {
  if (!text) return [];
  const handles = new Set([...text.matchAll(/@(\w+)/g)].map((m) => m[1].toLowerCase()));
  if (!handles.size) return [];
  const users = await listUsers();
  return users
    .filter((u) => memberIds.includes(u.id) && u.id !== senderId && u.username && handles.has(u.username.toLowerCase()))
    .map((u) => u.id);
}

// Real Web Push, on top of the WS broadcast above — WS only reaches a tab
// that's already open; this is what reaches a closed tab/browser. Fire-and-
// forget: sendPushToUser never rejects (see server/push.js), and delivery
// latency to an external push service has no business blocking the response.
async function pushNewMessage(chat, sender, message) {
  if (chat.muted) return;
  const isGroupLike = chat.type === "group" || chat.type === "channel";
  // A secret chat's message.text is ciphertext (see e2e.js) — the server
  // can't read it any more than an eavesdropper could, so the notification
  // can't show a preview or even the sender's name in the body, same as
  // Telegram's own secret-chat push notifications.
  const isSecret = chat.type === "secret";
  const title = isSecret ? "Shalter" : isGroupLike ? chat.title : sender?.name ?? "Новое сообщение";
  const preview = messagePreview(message);
  const recipients = chat.memberIds.filter((id) => id !== message.senderId);
  await Promise.all(
    recipients.map(async (uid) => {
      const settings = await getSettings(uid);
      const mentioned = message.mentionedUserIds?.includes(uid);
      const body = isSecret
        ? "Новое сообщение"
        : !settings.notifications.previewText
          ? mentioned
            ? "Вас упомянули"
            : "Новое сообщение"
          : mentioned
            ? `${sender?.name ?? "Кто-то"} упомянул(а) вас: ${preview}`
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

// Real threads (threadPanel.js) — everything replying into one root
// message, kept out of the main list on purpose (see listMessages()'s own
// comment) so this is the only place they're readable at all.
router.get(
  "/:messageId/thread",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    const root = await getMessage(req.params.messageId);
    if (!root || root.chatId !== req.params.id) return res.status(404).json({ error: "not found" });
    const replies = await listThreadReplies(req.params.messageId);
    res.json({ root, replies });
  })
);

// The actual "create + fan out" work for a message, shared by the live send
// route below and server/lib/scheduledMessagesSweep.js's sweep (a fired
// scheduled message goes through the exact same delivery — mentions, bot
// dispatch, push, link preview — as one typed and sent live). Assumes the
// caller already did request-shaped validation (empty-message check,
// restrictions, block status) — this just delivers.
async function deliverMessage(chat, senderId, body) {
  // A secret chat's text is ciphertext (public/js/lib/e2e.js encrypts
  // client-side before it ever reaches this request) — the server has no
  // way to read @mentions or URLs out of it, so don't even try. Attachments
  // in secret chats are *not* currently encrypted (v1 limitation, see
  // e2e.js's header comment), so those still flow through normally.
  const isSecret = chat.type === "secret";

  let forwardedFrom = body.forwardedFrom;
  if (forwardedFrom?.senderId) {
    if (forwardedFrom.senderId === senderId) {
      forwardedFrom = { ...forwardedFrom, linkAllowed: true };
    } else {
      const { privacy } = await getSettings(forwardedFrom.senderId);
      let linkAllowed = privacy.forwards === "everyone";
      if (privacy.forwards === "contacts") {
        const contacts = await listContactsFor(forwardedFrom.senderId);
        linkAllowed = contacts.some((c) => c.userId === senderId);
      }
      forwardedFrom = { ...forwardedFrom, linkAllowed };
    }
  }

  const mentionedUserIds = isSecret ? [] : await resolveMentions(body.text, chat.memberIds, senderId);

  const message = await addMessage({
    id: `m_${Date.now()}`,
    chatId: chat.id,
    senderId,
    type: body.sticker ? "sticker" : "text",
    text: body.text ?? "",
    createdAt: new Date().toISOString(),
    pinned: false,
    mentionedUserIds,
    reactions: [],
    replyToId: body.replyToId ?? null,
    threadRootId: body.threadRootId ?? null,
    attachments: sanitizeAttachments(body.attachments),
    forwardedFrom,
    sticker: body.sticker,
    readByIds: [senderId],
  });

  if (message.threadRootId) {
    // A thread reply never shows in the main timeline (listMessages()
    // excludes threadRootId rows — see its comment), so there's no point
    // broadcasting the normal message:new there'd trigger a pointless
    // refetch for. Instead: bump the root's visible reply count, and tell
    // whoever has this thread's panel open right now (threadPanel.js) so it
    // updates live instead of only on next open.
    const updatedRoot = await incrementCommentCount(message.threadRootId);
    broadcastToUsers(chat.memberIds, { type: "thread:message", chatId: chat.id, rootId: message.threadRootId, message });
    if (updatedRoot) broadcastToOtherMembers(chat, senderId, { type: "message:updated", chatId: chat.id, message: updatedRoot });
  } else {
    broadcastToOtherMembers(chat, senderId, { type: "message:new", chatId: chat.id, message });
  }

  // A chat with a bot only gets a reply if the bot's own program sends
  // one back — either an external script polling GET /api/bot-api/updates
  // and calling /sendMessage, or (for bots with code saved in the in-app
  // editor) the sandboxed handleMessage below. Fire-and-forget: a slow or
  // buggy bot script must never delay *this* response to the human sender.
  for (const memberId of chat.memberIds) {
    if (memberId === senderId) continue;
    getBotByUserId(memberId)
      .then((bot) => {
        if (!bot?.code?.trim()) return;
        return runBotCode(bot, bot.code, { id: message.id, chatId: chat.id, senderId, text: message.text, createdAt: message.createdAt });
      })
      .catch((err) => console.error(`bot sandbox dispatch failed for ${memberId}:`, err));
  }

  // A comment on a channel post is just a reply to that post's auto-forwarded
  // anchor copy in the linked discussion chat (see server/routes/posts.js) —
  // bump the post's visible comment count when one lands.
  if (message.replyToId) {
    const anchor = await getMessage(message.replyToId);
    if (anchor?.anchorForPostId) await incrementCommentCount(anchor.anchorForPostId);
  }

  const sender = await getUser(senderId);
  pushNewMessage(chat, sender, message).catch((err) => console.error("push notify failed:", err));

  // Fire-and-forget, same as the bot dispatch above — fetching a link's
  // metadata from a slow or unreachable site must never delay the actual
  // send. Broadcasts an update once the preview lands so open chat views
  // pick it up live instead of needing a refresh.
  if (!isSecret && message.type === "text" && message.text) {
    fetchLinkPreview(message.text)
      .then(async (linkPreview) => {
        if (!linkPreview) return;
        const updated = await setLinkPreview(message.id, linkPreview);
        broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message: updated });
      })
      .catch((err) => console.error("link preview fetch failed:", err));
  }

  return message;
}

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) {
      return res.status(404).json({ error: "not found" });
    }

    // Owner/admin restrictions (server/routes/chats.js's /:id/restrict) —
    // "forever" or a still-future ISO timestamp both block sending; an
    // expired timestamp is treated as no restriction at all rather than
    // needing a separate cleanup step.
    const restrictedUntil = chat.restrictions?.[req.uid];
    if (restrictedUntil && (restrictedUntil === "forever" || restrictedUntil > new Date().toISOString())) {
      return res.status(403).json({ error: "Вам запрещено писать в этом чате" });
    }

    const body = req.body ?? {};
    if (!body.text?.trim() && !body.attachments?.length && !body.sticker) {
      return res.status(400).json({ error: "empty message" });
    }

    if (chat.type === "dm") {
      const otherId = chat.memberIds.find((m) => m !== req.uid);
      const other = otherId ? await getUser(otherId) : undefined;
      if (other?.blockedUserIds?.includes(req.uid)) {
        return res.status(403).json({ error: "Пользователь заблокировал вас" });
      }
    }

    const message = await deliverMessage(chat, req.uid, body);
    res.json({ message });
  })
);

// Scheduled messages (composer.js's clock icon → time picker) — private to
// the sender until they fire (server/lib/scheduledMessagesSweep.js's sweep turns
// each into a real message via deliverMessage above, at which point every
// other member sees it same as always). Nothing else in the chat can see
// these list/create/edit/delete routes' results but the sender themself.
router.get(
  "/scheduled",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    const scheduled = await listScheduledFor(req.params.id, req.uid);
    res.json({ scheduled });
  })
);

router.post(
  "/scheduled",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });

    const body = req.body ?? {};
    if (!body.text?.trim() && !body.attachments?.length) {
      return res.status(400).json({ error: "empty message" });
    }
    if (!body.sendAt || body.sendAt <= new Date().toISOString()) {
      return res.status(400).json({ error: "Время отправки должно быть в будущем" });
    }

    const scheduled = await addScheduled({
      id: `sch_${Date.now()}`,
      chatId: req.params.id,
      senderId: req.uid,
      text: body.text ?? "",
      attachments: sanitizeAttachments(body.attachments),
      replyToId: body.replyToId ?? null,
      sendAt: body.sendAt,
      createdAt: new Date().toISOString(),
    });
    res.json({ scheduled });
  })
);

router.patch(
  "/scheduled/:scheduledId",
  asyncRoute(async (req, res) => {
    const existing = await getScheduled(req.params.scheduledId);
    if (!existing || existing.senderId !== req.uid || existing.chatId !== req.params.id) {
      return res.status(404).json({ error: "not found" });
    }
    const body = req.body ?? {};
    if (body.sendAt && body.sendAt <= new Date().toISOString()) {
      return res.status(400).json({ error: "Время отправки должно быть в будущем" });
    }
    const scheduled = await editScheduled(req.params.scheduledId, body);
    res.json({ scheduled });
  })
);

router.delete(
  "/scheduled/:scheduledId",
  asyncRoute(async (req, res) => {
    const existing = await getScheduled(req.params.scheduledId);
    if (!existing || existing.senderId !== req.uid || existing.chatId !== req.params.id) {
      return res.status(404).json({ error: "not found" });
    }
    await deleteScheduled(req.params.scheduledId);
    res.json({ ok: true });
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

// Attached onto the router export (not a separate module) so
// server/lib/scheduledMessagesSweep.js's sweep can deliver a fired scheduled
// message through the exact same path a live send uses — mentions, bot
// dispatch, push, link preview — without a second copy of that logic.
module.exports = router;
module.exports.deliverMessage = deliverMessage;
