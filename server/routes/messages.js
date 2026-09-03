const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { getChat } = require("../data/chats");
const { sanitizeAttachments } = require("../lib/sanitizeAttachments");
const { sanitizeSticker } = require("../lib/sanitizeSticker");
const { searchInChats, listMessages, listMessagesPage, listThreadReplies, addMessage, getMessage, editMessage, deleteMessage, deleteMessageForMe, togglePin, toggleReaction, incrementCommentCount, votePoll, markChatRead, setLinkPreview, listMessageDays, firstMessageOfDay } = require("../data/messages");
const { getUser, findUserIdsByUsernames } = require("../data/users");
const { transferStars, balanceOf } = require("../data/stars");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { ADMIN_PHONE, isAdminPhone } = require("../config");
const { getSettings, isQuietNow } = require("../data/settings");
const { listContactsFor } = require("../data/contacts");
const { listScheduledFor, addScheduled, editScheduled, deleteScheduled, getScheduled } = require("../data/scheduledMessages");
const { getBotByUserId } = require("../data/bots");
const { runBotCode } = require("../lib/botSandbox");
const { dispatchHugo } = require("../lib/hugoBot");
const { can, DENIED, isStaff } = require("../lib/chatPermissions");
const { broadcastToUsers } = require("../ws");
const { sendPushToUser, MESSAGE_PUSH } = require("../push");
const { registerAttachments } = require("../lib/uploadAccess");
const { fetchLinkPreview } = require("../lib/linkPreview");
const { deleteUploadedFiles } = require("../lib/serveUpload");
const { UPLOAD_DIR } = require("./uploads");

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
  const handles = [...new Set([...text.matchAll(/@(\w+)/g)].map((m) => m[1].toLowerCase()))];
  if (!handles.length) return [];
  // Запрос ровно по написанным именам, а не чтение всей таблицы с перебором в
  // JavaScript: это выполняется на каждое сообщение с «@», и на 50 тысячах
  // аккаунтов прежний вариант стоил 1.2 секунды и полгигабайта памяти
  // (см. findUserIdsByUsernames в data/users.js).
  const members = new Set(memberIds);
  return findUserIdsByUsernames(handles)
    .filter((u) => u.id !== senderId && members.has(u.id))
    .map((u) => u.id);
}

// Real Web Push, on top of the WS broadcast above — WS only reaches a tab
// that's already open; this is what reaches a closed tab/browser. Fire-and-
// forget: sendPushToUser never rejects (see server/push.js), and delivery
// latency to an external push service has no business blocking the response.
async function pushNewMessage(chat, sender, message) {
  const isGroupLike = chat.type === "group" || chat.type === "channel";
  const title = isGroupLike ? chat.title : sender?.name ?? "Новое сообщение";
  const preview = messagePreview(message);
  const recipients = chat.memberIds.filter((id) => id !== message.senderId);
  await Promise.all(
    recipients.map(async (uid) => {
      const settings = await getSettings(uid);
      // Тишину проверяем у каждого получателя отдельно. Раньше здесь стояло
      // `if (chat.muted) return` на весь чат сразу: один человек, отключивший
      // уведомления в группе, отключал их всем остальным.
      if (isQuietNow(settings, chat.id)) return;
      const mentioned = message.mentionedUserIds?.includes(uid);
      const body = !settings.notifications.previewText
        ? mentioned
          ? "Вас упомянули"
          : "Новое сообщение"
        : mentioned
          ? `${sender?.name ?? "Кто-то"} упомянул(а) вас: ${preview}`
          : isGroupLike
            ? `${sender?.name ?? "Кто-то"}: ${preview}`
            : preview;
      // Срок жизни сутки: телефон был вне сети — покажем, когда вернётся; через
      // сутки сообщение уже прочитано в самом приложении, и уведомление о нём
      // только мешает. Срочность обычная: в отличие от звонка, сообщение может
      // подождать, пока телефон проснётся сам (см. server/push.js).
      await sendPushToUser(uid, { title, body, url: `/chat/${chat.id}`, // Отдельное уведомление на каждое сообщение.
      //
      // Раньше здесь стоял общий признак на весь чат, и система показывала
      // только последнее: десять сообщений подряд схлопывались в одно, у
      // которого молча менялся текст. Прочитать пропущенное было нельзя —
      // предыдущие исчезали, не успев попасться на глаза.
      tag: `msg-${message.id}` }, MESSAGE_PUSH);
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

    // Paged: the newest `limit` messages, with `before` walking further back as
    // the user scrolls up. Loading a whole chat at once meant a multi-megabyte
    // response and a five-thousand-row DOM rebuild on every poll.
    const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 200);
    const before = typeof req.query.before === "string" && req.query.before ? req.query.before : null;
    const { messages, hasMore } = listMessagesPage(req.params.id, req.uid, settings.chatClears?.[req.params.id], { limit, before });

    // The first message this viewer hadn't read — computed *before* marking the
    // chat read below, which is the only moment it still exists. The client
    // draws its "непрочитанные" divider above it; without this the answer is
    // always "none", because listing the messages is itself what marks them.
    const firstUnreadId =
      messages.find((m) => m.senderId !== req.uid && !(m.readByIds ?? []).includes(req.uid))?.id ?? null;

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

    res.json({ messages, hasMore, firstUnreadId });
  })
);

// Searching inside one chat. The global search (routes/search.js) spans every
// chat and caps at 20 hits, which is the wrong tool for "find that link Ivan
// sent in this conversation".
router.get(
  "/search",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    const q = String(req.query.q ?? "").trim().toLowerCase();
    if (!q) return res.json({ messages: [] });
    const settings = await getSettings(req.uid);
    const clearedBefore = settings.chatClears?.[req.params.id];
    // Тем же полнотекстовым указателем, что и общий поиск: читать весь чат ради
    // одного слова незачем.
    const found = searchInChats([req.params.id], q, { limit: 50 })
      .filter((m) => !m.deleted && (!clearedBefore || m.createdAt > clearedBefore))
      // Newest first: looking for something you remember means looking backwards.
      .reverse();
    res.json({ messages: found });
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
// paidStars — сколько звёзд списалось за это сообщение. Не для отчётности
// (списание уже прошло), а для получателя: письмо, за которое незнакомый
// человек заплатил, показывается иначе — печатается на экране (см.
// components/messageBubble.js).
async function deliverMessage(chat, senderId, body, { paidStars = 0 } = {}) {
  let forwardedFrom = body.forwardedFrom;
  if (forwardedFrom?.senderId) {
    if (forwardedFrom.senderId === senderId) {
      forwardedFrom = { ...forwardedFrom, linkAllowed: true };
    } else {
      const linkAllowed = await allowsUser(forwardedFrom.senderId, "forwards", senderId);
      forwardedFrom = { ...forwardedFrom, linkAllowed };
    }
  }

  const mentionedUserIds = await resolveMentions(body.text, chat.memberIds, senderId);

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
    sticker: sanitizeSticker(body.sticker),
    readByIds: [senderId],
    paidStars,
  });

  // Кто вправе скачать приложенные файлы: те, кто в этом чате. Записывается
  // здесь, на доставке, — в момент, когда вложение впервые появляется в
  // переписке (см. lib/uploadAccess.js).
  registerAttachments(chat.id, message.attachments);

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

    // Если корень ветки — якорь поста канала (routes/posts.js), то счётчик
    // нужен и на самом посте: подпись «N комментариев» читают в канале, а не в
    // группе обсуждения, и без этого она осталась бы нулём навсегда.
    if (updatedRoot?.anchorForPostId) {
      const updatedPost = await incrementCommentCount(updatedRoot.anchorForPostId);
      const channel = updatedPost ? await getChat(updatedPost.chatId) : null;
      if (channel) broadcastToUsers(channel.memberIds, { type: "message:updated", chatId: channel.id, message: updatedPost });
    }
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

  // Hugo is built in rather than user-programmed, so it has no code row for the
  // loop above to find — its replies come from the server (lib/hugoBot.js).
  // Same fire-and-forget shape: proofreading calls an external service, and the
  // person who pressed send must not wait for it.
  dispatchHugo(chat.id, message);

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
  if (message.type === "text" && message.text) {
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

    // Group permissions (lib/chatPermissions.js). Checked per kind of content,
    // not once for the message as a whole: "may write" and "may post photos"
    // are separate settings, and a group that allows text but not media has to
    // actually behave that way.
    const kinds = new Set((body.attachments ?? []).map((a) => a.kind));
    const needs = [
      "sendMessages",
      ...(kinds.has("poll") ? ["sendPolls"] : []),
      ...([...kinds].some((k) => k !== "poll") ? ["sendMedia"] : []),
      ...(body.sticker ? ["sendStickers"] : []),
    ];
    for (const need of needs) {
      if (!can(chat, req.uid, need)) return res.status(403).json({ error: DENIED[need] });
    }

    // Slow mode: the minimum gap between one member's messages. Staff are
    // exempt — it exists to calm a busy group, not to slow down the people
    // moderating it.
    if (chat.type === "group" && chat.slowModeSeconds > 0 && !isStaff(chat, req.uid)) {
      const mine = (await listMessages(req.params.id, req.uid)).filter((m) => m.senderId === req.uid);
      const last = mine[mine.length - 1];
      if (last) {
        const waited = (Date.now() - new Date(last.createdAt).getTime()) / 1000;
        if (waited < chat.slowModeSeconds) {
          const left = Math.ceil(chat.slowModeSeconds - waited);
          return res.status(429).json({ error: `Медленный режим: следующее сообщение можно отправить через ${left} с`, retryAfter: left });
        }
      }
    }

    let charged = 0;
    if (chat.type === "dm") {
      const otherId = chat.memberIds.find((m) => m !== req.uid);
      const other = otherId ? await getUser(otherId) : undefined;
      if (other?.blockedUserIds?.includes(req.uid)) {
        return res.status(403).json({ error: "Пользователь заблокировал вас" });
      }

      // The Shalter service bot only ever talks *to* you: login codes, security
      // alerts, delivered gifts. There is nothing at the other end to read a
      // reply, so the chat is one-way rather than silently swallowing messages.
      if (otherId === SYSTEM_BOT_ID) {
        return res.status(403).json({ error: "Shalter — служебный чат, отвечать в нём нельзя" });
      }
      // Hugo (data/hugoBot.js) is deliberately not covered by that rule, nor by
      // the admin-DM one below: it exists to be written to, and it answers. It
      // has no phone number, so the ADMIN_PHONE check can't catch it either.
      // Same for the administration's own DM: purchase requests are posted there
      // by the server itself (see routes/premium.js and friends), and those go
      // through lib/systemChat.js rather than this route.
      // Администратору можно написать напрямую, как любому другому человеку.
      //
      // Здесь стоял отказ «в чат администрации нельзя писать напрямую». Он
      // оберегал автоматические заявки на покупку от перемешивания с обычной
      // перепиской, но заодно делал администратора единственным человеком в
      // мессенджере, которому нельзя задать вопрос или пожаловаться.
      //
      // Заявки это не ломает: их по-прежнему создаёт сервер сам, отдельным
      // путём (routes/premium.js и соседние шлют их через lib/systemChat.js),
      // а не этим маршрутом.

      // Платные личные сообщения: человек может брать звёзды с незнакомых.
      // Плата за каждое сообщение, а не разовая, — именно это делает холодную
      // рассылку дорогой, и так же устроены платные сообщения в Telegram.
      //
      // Четыре способа писать бесплатно, и все означают «это уже не холодное
      // письмо»:
      //   1) вы у получателя в контактах — он сам вас добавил;
      //   2) он вам хоть раз ответил — дальше переписка бесплатна в обе стороны;
      //   3) у вас Premium — подписка и покупается в том числе ради этого;
      //   4) вы пишете сами себе (заметки).
      const price = other?.messagePriceStars ?? 0;
      if (price > 0) {
        const theirContacts = await listContactsFor(other.id);
        const isContact = theirContacts.some((c) => c.userId === req.uid);
        const everReplied = (await listMessages(chat.id, other.id)).some((m) => m.senderId === other.id);
        // Premium проверяем у отправителя и по сроку, а не по флагу из запроса:
        // isPremium вычисляется из premiumUntil в data/users.js.
        const me = await getUser(req.uid);
        const senderHasPremium = !!me?.isPremium;
        if (!isContact && !everReplied && !senderHasPremium) {
          if (!transferStars(req.uid, other.id, price)) {
            return res.status(402).json({
              error: `Этот пользователь берёт ${price} ⭐ за сообщение от незнакомых. Не хватает звёзд. С Premium писать можно бесплатно`,
              needStars: price,
              balance: balanceOf(req.uid),
              premiumHelps: true,
            });
          }
          charged = price;
        }
      }
    }

    const message = await deliverMessage(chat, req.uid, body, { paidStars: charged });
    res.json({ message, ...(charged ? { chargedStars: charged, balance: balanceOf(req.uid) } : {}) });
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
      // Your own message, always. Someone else's only if you run the chat:
      // moderating a group means being able to remove what was posted in it, and
      // until now an admin could delete a message only from their own view — the
      // spam stayed up for everyone else.
      const chatForDelete = await getChat(req.params.id);
      const mine = existing.senderId === req.uid;
      const staff = chatForDelete && chatForDelete.type !== "dm" && isStaff(chatForDelete, req.uid);
      // В личной переписке — любое сообщение, включая чужое: разговор двоих
      // принадлежит обоим, и убрать из него сказанное вправе каждый из двоих.
      // В группе и канале это по-прежнему право того, кто ими управляет: иначе
      // один участник в состоянии стереть всю историю общего чата.
      const inDm = chatForDelete?.type === "dm";
      if (!mine && !staff && !inDm) {
        return res.status(403).json({ error: "Удалить чужое сообщение у всех могут владельцы, админы и модераторы" });
      }
      await deleteMessage(req.params.messageId);
      // A channel post also lives as an anchor message in the discussion group,
      // which is what its comments hang off (routes/posts.js). Publishing
      // created both; deleting removed only one, leaving a thread of comments
      // under a post that no longer exists.
      if (existing.discussionAnchorId) {
        const anchor = await getMessage(existing.discussionAnchorId);
        if (anchor) {
          await deleteMessage(anchor.id);
          const discussionChat = await getChat(anchor.chatId);
          if (discussionChat) {
            broadcastToUsers(discussionChat.memberIds, {
              type: "message:deleted",
              chatId: discussionChat.id,
              id: anchor.id,
            });
          }
        }
      }
      // The row is gone, so nothing points at its files any more — free the disk
      // rather than leaving a 2GB video orphaned there forever. Only for
      // "delete for everyone": a delete-for-me leaves the message (and its
      // files) live for everyone else.
      await deleteUploadedFiles(UPLOAD_DIR, existing.attachments);
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

// Who may pin or unpin. In a one-to-one chat, either side — it's their
// conversation. In a group or channel it's the people who run it: unpinning was
// previously open to anyone in the chat, so any subscriber could take down the
// owner's pinned post, and nothing recorded that they had.
function canPin(chat, userId) {
  if (!chat || !chat.memberIds.includes(userId)) return false;
  if (chat.type === "dm") return true;
  // A group may hand pinning to everyone (lib/chatPermissions.js) — the staff
  // check below is then just the floor, not the ceiling.
  if (chat.type === "group" && can(chat, userId, "pinMessages")) return true;
  return (
    chat.ownerId === userId ||
    (chat.ownerIds ?? []).includes(userId) ||
    (chat.adminIds ?? []).includes(userId) ||
    (chat.moderatorIds ?? []).includes(userId)
  );
}

router.post(
  "/:messageId/pin",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    if (!canPin(chat, req.uid)) {
      return res.status(403).json({ error: "Закреплять сообщения могут владельцы, админы и модераторы" });
    }
    const { pinned } = req.body ?? {};
    const message = await togglePin(req.params.messageId, pinned);
    broadcastToOtherMembers(chat, req.uid, { type: "message:updated", chatId: req.params.id, message });
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
// Календарь переписки: какие дни этого месяца в чате не пустые.
//
// Нужен разделителю даты в чате — по нажатию на «30 августа» открывается
// месяц, где дни с сообщениями кликабельны, а пустые видно сразу.
router.get(
  "/days",
  asyncRoute(async (req, res) => {
    // Та же проверка, что и у остальных маршрутов этого файла: чат существует
    // и человек в нём состоит.
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    const month = String(req.query.month ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "Нужен месяц в виде ГГГГ-ММ" });
    const tz = Number(req.query.tz);
    res.json({ days: listMessageDays(chat.id, { month, tzOffsetMinutes: Number.isFinite(tz) ? tz : 0 }) });
  })
);

// К какому сообщению прыгать при выборе дня.
router.get(
  "/at",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    const day = String(req.query.day ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ error: "Нужна дата в виде ГГГГ-ММ-ДД" });
    const tz = Number(req.query.tz);
    res.json({ message: firstMessageOfDay(chat.id, { day, tzOffsetMinutes: Number.isFinite(tz) ? tz : 0 }) });
  })
);

module.exports = router;
module.exports.deliverMessage = deliverMessage;
