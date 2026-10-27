const { genId } = require("../lib/genId");
const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { getChat, findChannelByDiscussionChatId } = require("../data/chats");
const { sanitizeAttachments, isSafeUrl, MAX_CHECKLIST_ITEMS } = require("../lib/sanitizeAttachments");
const { sanitizeSticker } = require("../lib/sanitizeSticker");
const { sanitizeScene } = require("../lib/sanitizeScene");

const MAX_MESSAGE_EMOJI = 24;
function sanitizeMessageEmoji(input) {
  if (!Array.isArray(input) || input.length === 0) return undefined;
  const cleaned = input.slice(0, MAX_MESSAGE_EMOJI).map((scene) => sanitizeScene(scene, { requireLayers: true }) ?? null);
  return cleaned.some(Boolean) ? cleaned : undefined;
}
const { searchInChats, listMessages, listMessagesPage, listThreadReplies, addMessage, getMessage, editMessage, deleteMessage, deleteMessageForMe, togglePin, toggleReaction, incrementCommentCount, votePoll, retractPollVote, closePoll, toggleChecklistItem, addChecklistItems, markChatRead, readersOf, setLinkPreview, updateLiveLocation, listMessageDays, firstMessageOfDay } = require("../data/messages");
const { getUser, findUserIdsByUsernames, listUsersByIds } = require("../data/users");
const { transferStars, balanceOf } = require("../data/stars");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { ADMIN_PHONE, isAdminPhone } = require("../config");
const { getSettings, isQuietNow, clearUnreadMark, setDraft } = require("../data/settings");
const { listContactsFor } = require("../data/contacts");
const { allowsUser, recordsReadTime, publicUserFor } = require("../lib/privacyRules");
const { messageCost } = require("../lib/messagePrice");
const { listScheduledFor, addScheduled, editScheduled, deleteScheduled, getScheduled, WHEN_ONLINE } = require("../data/scheduledMessages");
const { getBotByUserId } = require("../data/bots");
const { runBotCode } = require("../lib/botSandbox");
const { dispatchHugo, dispatchGuestHugo } = require("../lib/hugoBot");
const { dispatchShalterAi } = require("../lib/shalterAi");
const { dispatchHelperBot } = require("../lib/helperBot");
const { dispatchBusinessAutoReply } = require("../lib/businessAutoReply");
const { can, DENIED, isStaff } = require("../lib/chatPermissions");
const { broadcastToUsers } = require("../ws");
const { sendPushToUser, pushAvatar, userPushAvatar, MESSAGE_PUSH } = require("../push");
const { registerAttachments, canAccessUpload } = require("../lib/uploadAccess");
const paidMedia = require("../data/paidMedia");
const { fetchLinkPreview } = require("../lib/linkPreview");
const { markPendingPreviews, messageNeedsMedia } = require("../lib/mediaJobs");
const { queueJob } = require("../lib/backgroundJobs");
const { hasAdminSection } = require("../lib/adminAccess");
const { getTopic } = require("../data/topics");
const { serviceLine } = require("../lib/systemChat");

const { sendOnce } = require("../lib/sendOnce");
const router = express.Router({ mergeParams: true });

async function isServerModerator(uid) {
  return hasAdminSection(await getUser(uid), "moderation");
}

async function loadMessageInChat(req, res, { allowModerator = false } = {}) {
  const [chat, message] = await Promise.all([getChat(req.params.id), getMessage(req.params.messageId)]);
  const member = !!chat && chat.memberIds.includes(req.uid);
  const moderator = allowModerator && !member && !!chat && (await isServerModerator(req.uid));
  if (!chat || !message || message.chatId !== chat.id || (!member && !moderator)) {
    res.status(404).json({ error: "not found" });
    return null;
  }
  return { chat, message, moderator };
}

function broadcastToOtherMembers(chat, uid, payload) {
  broadcastToUsers(chat.memberIds.filter((id) => id !== uid), payload);
}

const ATTACHMENT_LABEL = {
  image: "📷 Фото",
  video: "📹 Видео",
  file: "📄 Файл",
  voice: "🎤 Голосовое сообщение",
  "video-note": "⏺ Видео-кружок",
  poll: "📊 Опрос",
  checklist: "☑️ Чек-лист",
  dice: "🎲 Кубик",
  paid: "⭐ Платный пост",
  game: "🎮 Игра",
  location: "📍 Геолокация",
  contact: "👤 Контакт",
};

function messagePreview(message) {
  if (message.text?.trim()) return message.text;
  return ATTACHMENT_LABEL[message.attachments?.[0]?.kind] ?? "Новое сообщение";
}

async function resolveMentions(text, memberIds, senderId) {
  if (!text) return [];
  const handles = [...new Set([...text.matchAll(/@(\w+)/g)].map((m) => m[1].toLowerCase()))];
  if (!handles.length) return [];
  const members = new Set(memberIds);
  return findUserIdsByUsernames(handles)
    .filter((u) => u.id !== senderId && members.has(u.id))
    .map((u) => u.id);
}

// Как в Telegram: 4096 символов текста (подпись к медиа — тоже).
const MAX_MESSAGE_TEXT = 4096;
// Статья (Premium): markdown, первая строка — «# Заголовок»; обложка — вложение-картинка.
const MAX_ARTICLE_TEXT = 20000;
const textLimit = (isArticle) => (isArticle ? MAX_ARTICLE_TEXT : MAX_MESSAGE_TEXT);
const MESSAGE_EFFECTS = ["🔥", "👍", "👎", "❤️", "🎉", "💩"];

async function pushNewMessage(chat, sender, message, { silent = false } = {}) {
  const isGroupLike = chat.type === "group" || chat.type === "channel";
  const title = isGroupLike ? chat.title : sender?.name ?? "Новое сообщение";
  const preview = messagePreview(message);
  const recipients = chat.memberIds.filter((id) => id !== message.senderId);
  const chatAvatar = isGroupLike ? pushAvatar(chat) : null;
  await Promise.all(
    recipients.map(async (uid) => {
      const settings = await getSettings(uid);
      if (isQuietNow(settings, chat.id)) return;
      const mentioned = message.mentionedUserIds?.includes(uid);
      // Секретный чат: ни текста, ни имени в уведомлении — как в Telegram.
      const body = chat.secret
        ? "🔒 Новое сообщение в секретном чате"
        : !settings.notifications.previewText
        ? mentioned
          ? "Вас упомянули"
          : "Новое сообщение"
        : mentioned
          ? `${sender?.name ?? "Кто-то"} упомянул(а) вас: ${preview}`
          : isGroupLike
            ? `${sender?.name ?? "Кто-то"}: ${preview}`
            : preview;
      const avatar = chatAvatar ?? (await userPushAvatar(sender, uid));
      await sendPushToUser(
        uid,
        {
          title: chat.secret ? "Shalter" : title,
          body,
          ...(chat.secret ? {} : avatar),
          url: `/chat/${chat.id}`,
          kind: "message",
          tag: `chat-${chat.id}`,
          // для кнопок в уведомлении: «Ответить», «Прочитано», «Удалить»
          chatId: chat.id,
          messageId: message.id,
          ...(silent ? { silent: true } : {}),
        },
        MESSAGE_PUSH
      );
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

    const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 200);
    const before = typeof req.query.before === "string" && req.query.before ? req.query.before : null;
    const beforeId = typeof req.query.beforeId === "string" && req.query.beforeId ? req.query.beforeId : null;
    // ?topic=general — тема «Общее», ?topic=<id> — одна тема; без параметра — весь чат.
    const rawTopic = typeof req.query.topic === "string" && req.query.topic ? req.query.topic : null;
    const topic = !chat.topicsEnabled || !rawTopic ? undefined : rawTopic === "general" ? null : rawTopic;
    const page = listMessagesPage(req.params.id, req.uid, settings.chatClears?.[req.params.id], { limit, before, beforeId, topic });
    // Скрытый ответ бота виден только адресату (и тем, кто вступил позже, тоже не виден).
    const messages = page.messages.filter((m) => !m.visibleToId || m.visibleToId === req.uid || m.senderId === req.uid);
    const { hasMore } = page;

    const firstUnreadId =
      messages.find((m) => m.senderId !== req.uid && !(m.readByIds ?? []).includes(req.uid))?.id ?? null;

    const recordTime = await recordsReadTime(chat, req.uid);
    const changedIds = await markChatRead(req.params.id, req.uid, { recordTime });
    if (!before && !beforeId) await clearUnreadMark(req.uid, req.params.id);
    if (changedIds.length > 0) {
      broadcastToOtherMembers(chat, req.uid, {
        type: "message:read",
        chatId: req.params.id,
        readerId: req.uid,
        messageIds: changedIds,
        readAt: recordTime ? new Date().toISOString() : undefined,
      });
    }

    res.json({ messages, hasMore, firstUnreadId, replyTargets: await replyTargetsFor(messages, req.params.id, req.uid) });
  })
);

async function replyTargetsFor(messages, chatId, viewerId) {
  const loaded = new Set(messages.map((m) => m.id));
  const wanted = [...new Set(messages.map((m) => m.replyToId).filter((id) => id && !loaded.has(id)))];
  const out = {};
  for (const id of wanted) {
    const t = await getMessage(id);
    if (!t || t.chatId !== chatId || t.deletedForIds?.includes(viewerId)) {
      out[id] = { id, deleted: true };
      continue;
    }
    out[id] = {
      id,
      senderId: t.senderId,
      anonymous: !!t.anonymous,
      type: t.type,
      text: (t.text ?? "").slice(0, 200),
      attachments: (t.attachments ?? []).slice(0, 1).map((a) => ({ kind: a.kind, name: a.name })),
      sticker: t.sticker ? { emoji: t.sticker.emoji } : undefined,
      gift: t.gift ? { name: t.gift.name } : undefined,
    };
  }
  return out;
}

router.get(
  "/search",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    const q = String(req.query.q ?? "").trim().toLowerCase();
    if (!q) return res.json({ messages: [] });
    const settings = await getSettings(req.uid);
    const clearedBefore = settings.chatClears?.[req.params.id];
    const found = searchInChats([req.params.id], q, { limit: 50 })
      .filter((m) => !m.deleted && !m.deletedForIds?.includes(req.uid) && (!clearedBefore || m.createdAt > clearedBefore))
      .reverse();
    res.json({ messages: found });
  })
);

// «Кратко»: ИИ-сводка длинного сообщения или поста. Кэшируем по сообщению
// и времени правки, чтобы модель не дёргалась на каждый клик.
const SUMMARY_MIN_CHARS = 400;
const summaryCache = new Map();
const summaryHits = new Map();
router.get(
  "/:messageId/summary",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    // Переписку секретного чата во внешнюю модель не отправляем.
    if (chat.secret) return res.status(403).json({ error: "В секретном чате сводки недоступны" });
    const message = await getMessage(req.params.messageId);
    if (!message || message.chatId !== chat.id || message.deletedForIds?.includes(req.uid)) return res.status(404).json({ error: "not found" });
    if ((message.text ?? "").length < SUMMARY_MIN_CHARS) return res.status(400).json({ error: "Сообщение слишком короткое для сводки" });

    const key = `${message.id}:${message.editedAt ?? ""}`;
    if (summaryCache.has(key)) return res.json({ summary: summaryCache.get(key) });

    const { isAiAvailable, summarize } = require("../lib/hugoAi");
    if (!isAiAvailable()) return res.status(503).json({ error: "ИИ сейчас недоступен" });
    const now = Date.now();
    const hits = (summaryHits.get(req.uid) ?? []).filter((t) => now - t < 60_000);
    if (hits.length >= 10) return res.status(429).json({ error: "Слишком много сводок, подождите минуту" });
    summaryHits.set(req.uid, [...hits, now]);

    const summary = await summarize(message.text);
    if (!summary) return res.status(502).json({ error: "Не удалось сделать сводку, попробуйте позже" });
    if (summaryCache.size > 2000) summaryCache.delete(summaryCache.keys().next().value);
    summaryCache.set(key, summary);
    res.json({ summary });
  })
);

// Кто и во сколько прочитал — только автору сообщения. Время показываем, если
// читатель не скрывает от автора «время захода» (как «Прочитано в …» в личке).
router.get(
  "/:messageId/readers",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    const message = await getMessage(req.params.messageId);
    if (!message || message.chatId !== chat.id || message.senderId !== req.uid) return res.status(404).json({ error: "not found" });
    const readers = readersOf(message.id).filter((r) => r.userId !== req.uid && chat.memberIds.includes(r.userId));
    const users = new Map((await listUsersByIds(readers.map((r) => r.userId))).map((u) => [u.id, u]));
    const result = [];
    for (const r of readers) {
      const user = users.get(r.userId);
      if (!user) continue;
      const showTime = r.readAt && (await allowsUser(r.userId, "lastSeen", req.uid));
      result.push({ user: await publicUserFor(user, req.uid), readAt: showTime ? r.readAt : null });
    }
    result.sort((a, b) => String(b.readAt ?? "").localeCompare(String(a.readAt ?? "")));
    res.json({ readers: result });
  })
);

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

function sanitizeStoryReply(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const url = typeof raw.url === "string" && isSafeUrl(raw.url) ? raw.url : undefined;
  const kind = raw.kind === "video" ? "video" : "image";
  const authorName = typeof raw.authorName === "string" ? raw.authorName.slice(0, 100) : undefined;
  if (!url && !authorName) return undefined;
  return { url, kind, authorName };
}

// Платный пост канала: звёзды 1…10000, только фото/видео, только админы канала.
const MAX_PAID_STARS = 10000;
const BLUR_RE = /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/;
function preparePaidMedia(chat, senderId, body) {
  const stars = Math.floor(Number(body.paidMedia?.stars));
  if (!body.paidMedia) return null;
  if (chat.secret) return { error: "В секретном чате платный контент недоступен" };
  if (chat.type === "channel" && !isStaff(chat, senderId)) return { error: "Платный контент в канале публикуют админы" };
  if (!Number.isSafeInteger(stars) || stars < 1 || stars > MAX_PAID_STARS) return { error: `Цена — от 1 до ${MAX_PAID_STARS} ⭐` };
  const real = (sanitizeAttachments(body.attachments) ?? []).filter((a) => (a.kind === "image" || a.kind === "video") && a.url);
  if (!real.length) return { error: "Платным можно сделать только фото или видео" };
  // Иначе, зная адрес чужого файла, можно было бы «продать» его себе и скачать как автор.
  if (real.some((a) => [a.url, a.thumbUrl].some((u) => u && /^\/uploads\//.test(u) && !canAccessUpload(senderId, u.slice("/uploads/".length))))) {
    return { error: "Файл не найден — загрузите его заново" };
  }
  const blur = typeof body.paidMedia.blur === "string" && body.paidMedia.blur.length <= 8000 && BLUR_RE.test(body.paidMedia.blur) ? body.paidMedia.blur : null;
  const w = Number(body.paidMedia.width);
  const h = Number(body.paidMedia.height);
  const placeholder = {
    kind: "paid",
    meta: {
      stars,
      count: real.length,
      photos: real.filter((a) => a.kind === "image").length,
      videos: real.filter((a) => a.kind === "video").length,
      blur,
      ...(w > 0 && h > 0 && w < 20000 && h < 20000 ? { width: Math.round(w), height: Math.round(h) } : {}),
    },
  };
  return { stars, real, placeholder };
}

async function deliverMessage(chat, senderId, body, { paidStars = 0, paid = null } = {}) {
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

  // Ответ и ветка — только на сообщение из этого же чата: иначе счётчик
  // комментариев и рассылка уходили бы в чужой чат.
  const inThisChat = async (id) => (typeof id === "string" && id ? (await getMessage(id))?.chatId === chat.id : false);
  const replyToId = (await inThisChat(body.replyToId)) ? body.replyToId : null;
  const threadRootId = (await inThisChat(body.threadRootId)) ? body.threadRootId : null;

  const message = await addMessage({
    id: genId("m"),
    chatId: chat.id,
    senderId,
    type: body.sticker ? "sticker" : body.article === true ? "article" : "text",
    text: body.text ?? "",
    createdAt: new Date().toISOString(),
    pinned: false,
    mentionedUserIds,
    reactions: [],
    replyToId,
    threadRootId,
    topicId: threadRootId ? null : body.topicId ?? null,
    storyReply: sanitizeStoryReply(body.storyReply),
    attachments: paid ? [paid.placeholder] : markPendingPreviews(sanitizeAttachments(body.attachments)),
    forwardedFrom,
    sticker: sanitizeSticker(body.sticker),
    customEmoji: sanitizeMessageEmoji(body.customEmoji),
    readByIds: [senderId],
    paidStars,
    anonymous: !!(body.anonymous && chat.type === "group" && chat.anonymousAdmins && isStaff(chat, senderId)),
    // Эффекты — только в личных чатах, как в Telegram.
    effect: chat.type === "dm" && MESSAGE_EFFECTS.includes(body.effect) ? body.effect : null,
  });

  registerAttachments(chat.id, message.attachments, { by: senderId });
  // Настоящие файлы платного поста к чату не привязываются: их отдают только автору,
  // админам канала и купившим (lib/uploadAccess.js).
  if (paid) paidMedia.savePaidMedia(message.id, chat.id, paid.stars, paid.real);
  if (message.sticker?.kind === "image") registerAttachments(chat.id, [{ url: message.sticker.url }], { by: senderId });

  if (message.threadRootId) {
    const updatedRoot = await incrementCommentCount(message.threadRootId);
    broadcastToUsers(chat.memberIds, { type: "thread:message", chatId: chat.id, rootId: message.threadRootId, message });
    if (updatedRoot) broadcastToOtherMembers(chat, senderId, { type: "message:updated", chatId: chat.id, message: updatedRoot });

    if (updatedRoot?.anchorForPostId) {
      const updatedPost = await incrementCommentCount(updatedRoot.anchorForPostId);
      const channel = updatedPost ? await getChat(updatedPost.chatId) : null;
      if (channel) broadcastToUsers(channel.memberIds, { type: "message:updated", chatId: channel.id, message: updatedPost });
    }
  } else {
    broadcastToOtherMembers(chat, senderId, { type: "message:new", chatId: chat.id, message, ...(body.silent === true ? { silent: true } : {}) });
  }

  for (const memberId of chat.memberIds) {
    if (memberId === senderId) continue;
    getBotByUserId(memberId)
      .then((bot) => {
        if (!bot?.code?.trim()) return;
        return runBotCode(bot, bot.code, { id: message.id, chatId: chat.id, senderId, text: message.text, createdAt: message.createdAt });
      })
      .catch((err) => console.error(`bot sandbox dispatch failed for ${memberId}:`, err));
  }

  dispatchHugo(chat.id, message);
  dispatchGuestHugo(chat, message);
  dispatchShalterAi(chat.id, message);

  dispatchHelperBot(chat, message);

  dispatchBusinessAutoReply(chat, message);

  if (message.replyToId) {
    const anchor = await getMessage(message.replyToId);
    if (anchor?.anchorForPostId) await incrementCommentCount(anchor.anchorForPostId);
  }

  const sender = await getUser(senderId);
  // «Отправить без звука»: уведомление придёт, но тихое.
  pushNewMessage(chat, sender, message, { silent: body.silent === true }).catch((err) => console.error("push notify failed:", err));

  // Превью и длительность вложений — в фоновом процессе; готовое придёт событием message:updated.
  if (messageNeedsMedia(message)) queueJob("message-media", { messageId: message.id });

  // В секретном чате превью ссылок не запрашиваем: сервер не ходит по ссылкам из переписки.
  if (message.type === "text" && message.text && !chat.secret) {
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

async function forwardOrigin(source, message, uid) {
  // Анонимные админы и посты каналов подписываются названием чата.
  if (source.type === "channel" || message.anonymous) {
    return { chatId: source.id, chatTitle: source.title, senderName: source.title };
  }
  const author = await getUser(message.senderId);
  let chatTitle = source.title;
  if (source.type === "dm") {
    const otherId = source.memberIds.find((id) => id !== uid) ?? uid;
    chatTitle = (await getUser(otherId))?.name ?? source.title;
  }
  return { chatId: source.id, chatTitle, senderId: message.senderId, senderName: author?.name ?? "Аноним" };
}

// Все проверки «можно ли этому человеку сюда писать». Общие для обычной
// отправки и отложенной: иначе через расписание можно было постить в чужой
// канал, писать при запрете или тому, кто заблокировал. charge — списывать ли
// звёзды за платные сообщения (при планировании нет, при отправке да).
async function sendGate(chat, uid, body, { charge = true, skipSlowMode = false } = {}) {
  const fail = (status, payload) => ({ status, payload });
  if (body.text != null && typeof body.text !== "string") return fail(400, { error: "Некорректный текст" });
  body.article = body.article === true;
  if (body.article && !body.forwardedFrom) {
    if (!(await getUser(uid))?.isPremium) return fail(403, { error: "Создание статей доступно только с Shalter Premium" });
    if (!/^# \S/.test(body.text ?? "")) return fail(400, { error: "У статьи должен быть заголовок" });
  }
  const limit = textLimit(body.article);
  if ((body.text ?? "").length > limit) return fail(400, { error: `Сообщение длиннее ${limit} символов` });
  if (chat.type === "channel" && !isStaff(chat, uid)) {
    return fail(403, { error: "Публиковать в канале могут только администраторы" });
  }

  const restrictedUntil = chat.restrictions?.[uid];
  if (restrictedUntil && (restrictedUntil === "forever" || restrictedUntil > new Date().toISOString())) {
    return fail(403, { error: "Вам запрещено писать в этом чате" });
  }

  // Тема: только существующая тема этого чата; в закрытую пишут только админы.
  // Нормализованный id кладётся обратно в body.topicId для deliverMessage.
  // Пересылка: подпись «Переслано от …» и содержимое берём из исходного
  // сообщения в базе, а не из тела запроса — иначе её можно подделать.
  if (body.forwardedFrom && chat.secret) return fail(403, { error: "В секретный чат нельзя пересылать" });
  if (body.forwardedFrom) {
    const sourceMsg = typeof body.forwardedFrom.messageId === "string" ? await getMessage(body.forwardedFrom.messageId) : null;
    const source = sourceMsg ? await getChat(sourceMsg.chatId) : null;
    if (!sourceMsg || !source?.memberIds.includes(uid) || sourceMsg.deletedForIds?.includes(uid)) {
      return fail(404, { error: "Исходное сообщение не найдено" });
    }
    if (source.protectedBy?.length || source.secret) return fail(403, { error: "В этом чате запрещена пересылка" });
    // «Скрыть имя отправителя»: копия уходит как своё сообщение, без подписи.
    body.forwardedFrom = body.forwardedFrom.hideAuthor === true ? undefined : sourceMsg.forwardedFrom ?? (await forwardOrigin(source, sourceMsg, uid));
    body.text = sourceMsg.text ?? "";
    body.article = sourceMsg.type === "article";
    body.attachments = (sourceMsg.attachments ?? []).map((a) =>
      a.kind === "poll" ? { ...a, meta: { ...a.meta, voterIds: [], votes: [] } } : a
    );
    body.sticker = sourceMsg.sticker;
    body.customEmoji = sourceMsg.customEmoji;
  }

  if (!chat.topicsEnabled) body.topicId = null;
  if (body.topicId != null) {
    const topic = typeof body.topicId === "string" ? getTopic(body.topicId) : null;
    if (!topic || topic.chatId !== chat.id) return fail(404, { error: "Тема не найдена" });
    if (topic.closed && !isStaff(chat, uid)) return fail(403, { error: "Тема закрыта — писать в неё могут только администраторы" });
    body.topicId = topic.id;
  }

  const kinds = new Set((body.attachments ?? []).map((a) => a.kind));
  const needs = [
    "sendMessages",
    ...(kinds.has("poll") || kinds.has("checklist") ? ["sendPolls"] : []),
    ...([...kinds].some((k) => k !== "poll" && k !== "checklist" && k !== "dice" && k !== "game") ? ["sendMedia"] : []),
    ...(body.sticker || kinds.has("dice") || kinds.has("game") ? ["sendStickers"] : []),
  ];
  for (const need of needs) {
    if (!can(chat, uid, need)) return fail(403, { error: DENIED[need] });
  }

  if (!skipSlowMode && chat.type === "group" && chat.slowModeSeconds > 0 && !isStaff(chat, uid)) {
    const mine = (await listMessages(chat.id, uid)).filter((m) => m.senderId === uid);
    const last = mine[mine.length - 1];
    if (last) {
      const waited = (Date.now() - new Date(last.createdAt).getTime()) / 1000;
      if (waited < chat.slowModeSeconds) {
        const left = Math.ceil(chat.slowModeSeconds - waited);
        return fail(429, { error: `Медленный режим: следующее сообщение можно отправить через ${left} с`, retryAfter: left });
      }
    }
  }

  let charged = 0;
  let other = undefined;
  if (chat.type === "dm") {
    const otherId = chat.memberIds.find((m) => m !== uid);
    other = otherId ? await getUser(otherId) : undefined;
    if (other?.blockedUserIds?.includes(uid)) {
      return fail(403, { error: "Пользователь заблокировал вас" });
    }

    if (otherId === SYSTEM_BOT_ID) {
      return fail(403, { error: "Shalter — служебный чат, отвечать в нём нельзя" });
    }

    if (other) {
      const writeAllowed = await allowsUser(other.id, "messages", uid);
      if (!writeAllowed) {
        const { privacy: theirPrivacy } = await getSettings(other.id);
        const level = theirPrivacy?.messages ?? "everyone";
        const deniedByName = (theirPrivacy?.exceptions?.messages?.deny ?? []).includes(uid);
        let bypass = false;
        if (level === "contacts" && !deniedByName) {
          const sender = await getUser(uid);
          bypass =
            !!sender?.isPremium || (await listMessages(chat.id, other.id)).some((m) => m.senderId === other.id);
        }
        if (!bypass) {
          return fail(403, {
            error:
              level === "nobody"
                ? "Этот пользователь никому не разрешает писать первым"
                : "Этот пользователь принимает сообщения только от своих контактов. С Premium писать можно",
            privacyBlocked: true,
          });
        }
      }

      const { price, mustPay } = charge ? await messageCost(uid, other, chat.id) : { mustPay: false };
      if (mustPay) {
        if (!transferStars(uid, other.id, price)) {
          return fail(402, {
            error: `Этот пользователь берёт ${price} ⭐ за сообщение от незнакомых. Не хватает звёзд. С Premium писать можно бесплатно`,
            needStars: price,
            balance: balanceOf(uid),
            premiumHelps: true,
          });
        }
        charged = price;
      }
    }
  } else if (chat.type === "group") {
    const channel = await findChannelByDiscussionChatId(chat.id);
    const price = channel?.commentPriceStars ?? 0;
    if (charge && price > 0 && channel.ownerId !== uid && !isStaff(channel, uid)) {
      const sender = await getUser(uid);
      if (!sender?.isPremium) {
        if (!transferStars(uid, channel.ownerId, price)) {
          return fail(402, {
            error: `Комментарии в этом канале стоят ${price} ⭐. Не хватает звёзд. С Premium — бесплатно`,
            needStars: price,
            balance: balanceOf(uid),
            premiumHelps: true,
          });
        }
        charged = price;
      }
    }
  }

  return { charged };
}

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) {
      return res.status(404).json({ error: "not found" });
    }

    const body = req.body ?? {};
    if (body.text != null && typeof body.text !== "string") return res.status(400).json({ error: "Некорректный текст" });
    // Вложения считаем после очистки: иначе { attachments: [{ kind: "bogus" }] }
    // проходило проверку и уходило пустым сообщением. У пересылки текст и
    // вложения берутся из исходного сообщения (sendGate), свои не нужны.
    if (!body.text?.trim() && !sanitizeAttachments(body.attachments)?.length && !body.sticker && !body.forwardedFrom) {
      return res.status(400).json({ error: "empty message" });
    }
    const { clientId, ...fields } = body;
    const result = await sendOnce(req.uid, chat.id, clientId, async () => {
      const gate = await sendGate(chat, req.uid, fields);
      if (gate.status) return { status: gate.status, payload: gate.payload };
      const charged = gate.charged;
      const paid = preparePaidMedia(chat, req.uid, fields);
      if (paid?.error) return { status: 400, payload: { error: paid.error } };
      const message = await deliverMessage(chat, req.uid, fields, { paidStars: charged, paid });
      // Отправили — черновик этого чата больше не нужен (иначе «Черновик: …» мог
      // вернуться в списке чатов, если очистка с клиента разошлась с сохранением).
      if ((await getSettings(req.uid)).drafts?.[chat.id]) await setDraft(req.uid, chat.id, "");
      return { payload: { message, ...(charged ? { chargedStars: charged, balance: balanceOf(req.uid) } : {}) } };
    }, { isFailure: (r) => r.status >= 400 });
    res.status(result.status ?? 200).json(result.payload);
  })
);

// Платный пост: настоящие вложения — автору, админам канала и тем, кто купил.
async function paidAccess(req, res) {
  const chat = await getChat(req.params.id);
  if (!chat || !chat.memberIds.includes(req.uid)) {
    res.status(404).json({ error: "not found" });
    return null;
  }
  const paid = paidMedia.getPaidMedia(req.params.messageId);
  if (!paid || paid.chatId !== chat.id) {
    res.status(404).json({ error: "not found" });
    return null;
  }
  const message = await getMessage(req.params.messageId);
  const free =
    message?.senderId === req.uid || (chat.type === "channel" && isStaff(chat, req.uid)) || paidMedia.hasBought(paid.messageId, req.uid);
  return { chat, paid, message, free };
}

router.get(
  "/:messageId/paid",
  asyncRoute(async (req, res) => {
    const access = await paidAccess(req, res);
    if (!access) return;
    const { paid, free, chat } = access;
    if (!free) return res.status(402).json({ error: "Пост открывается за звёзды", stars: paid.stars });
    const canSeeBuyers = access.message?.senderId === req.uid || (chat.type === "channel" && isStaff(chat, req.uid));
    res.json({ attachments: paid.attachments, ...(canSeeBuyers ? { buyers: paidMedia.buyersCount(paid.messageId) } : {}) });
  })
);

router.post(
  "/:messageId/unlock",
  asyncRoute(async (req, res) => {
    const access = await paidAccess(req, res);
    if (!access) return;
    const { chat, paid, free, message } = access;
    if (!free) {
      // Звёзды получает владелец канала (как плата за комментарии), в личке и группе — отправитель.
      const payee = chat.type === "channel" ? chat.ownerId : message?.senderId;
      if (!payee || !transferStars(req.uid, payee, paid.stars)) {
        return res.status(402).json({ error: `Не хватает звёзд: нужно ${paid.stars} ⭐`, needStars: paid.stars, balance: balanceOf(req.uid) });
      }
      paidMedia.recordPurchase(paid.messageId, req.uid);
    }
    res.json({ attachments: paid.attachments, balance: balanceOf(req.uid) });
  })
);

router.post(
  "/:messageId/location",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });

    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: "invalid coordinates" });

    const target = await getMessage(req.params.messageId);
    if (!target || target.chatId !== chat.id) return res.status(404).json({ error: "not found" });
    const message = await updateLiveLocation(req.params.messageId, req.uid, lat, lng);
    if (!message) return res.status(404).json({ error: "not found" });
    broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message });
    res.json({ message });
  })
);

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
    if (body.text != null && typeof body.text !== "string") return res.status(400).json({ error: "Некорректный текст" });
    if (!body.text?.trim() && !sanitizeAttachments(body.attachments)?.length) {
      return res.status(400).json({ error: "empty message" });
    }
    if (body.whenOnline === true) {
      if (chat.type !== "dm") return res.status(400).json({ error: "«Когда будет в сети» — только в личных чатах" });
      body.sendAt = WHEN_ONLINE;
      body.repeat = null;
    } else if (typeof body.sendAt !== "string" || !Number.isFinite(Date.parse(body.sendAt)) || body.sendAt <= new Date().toISOString()) {
      return res.status(400).json({ error: "Время отправки должно быть в будущем" });
    }
    if (body.article === true) return res.status(400).json({ error: "Статью нельзя отложить — опубликуйте её сразу" });
    const gate = await sendGate(chat, req.uid, body, { charge: false, skipSlowMode: true });
    if (gate.status) return res.status(gate.status).json(gate.payload);

    const scheduled = await addScheduled({
      id: genId("sch"),
      chatId: req.params.id,
      senderId: req.uid,
      text: body.text ?? "",
      attachments: sanitizeAttachments(body.attachments),
      replyToId: body.replyToId ?? null,
      topicId: body.topicId ?? null,
      repeat: body.repeat ?? null,
      sendAt: body.sendAt,
      createdAt: new Date().toISOString(),
    });
    res.json({ scheduled });
    if (body.whenOnline === true) require("../lib/scheduledMessagesSweep").sendWhenOnline().catch((err) => console.error("when-online send failed:", err));
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
    // «Отправить сейчас»: срок — текущий момент, и сразу запускаем отправку.
    if (body.sendNow === true) {
      await editScheduled(req.params.scheduledId, { sendAt: new Date().toISOString() });
      await require("../lib/scheduledMessagesSweep").sweepOnce();
      return res.json({ ok: true });
    }
    if (body.sendAt !== undefined && (typeof body.sendAt !== "string" || !Number.isFinite(Date.parse(body.sendAt)) || body.sendAt <= new Date().toISOString())) {
      return res.status(400).json({ error: "Время отправки должно быть в будущем" });
    }
    if (body.text !== undefined && typeof body.text !== "string") return res.status(400).json({ error: "Некорректный текст" });
    // Те же правила, что при создании и при правке отправленного сообщения.
    if (typeof body.text === "string") {
      if (body.text.length > MAX_MESSAGE_TEXT) return res.status(400).json({ error: `Сообщение длиннее ${MAX_MESSAGE_TEXT} символов` });
      if (!body.text.trim() && !existing.attachments?.length) return res.status(400).json({ error: "Сообщение не может быть пустым" });
    }
    const scheduled = await editScheduled(req.params.scheduledId, { text: body.text, sendAt: body.sendAt, repeat: body.repeat });
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
    const found = await loadMessageInChat(req, res);
    if (!found) return;
    const existing = found.message;
    if (existing.senderId !== req.uid) {
      return res.status(403).json({ error: "forbidden" });
    }
    const legacyCallLog = existing.createdAt < "2026-10-03" && /^📞 (Звонок|Видеозвонок|Пропущенный звонок|Звонок отклонён)/.test(existing.text ?? "");
    // Пересланное нельзя править: иначе подпись «Переслано от …» стояла бы под чужим текстом.
    // Подарок — тоже: его текст и сумма заданы при отправке, а не пишутся вручную.
    if (existing.type === "call" || legacyCallLog || existing.forwardedFrom || existing.type === "gift") {
      return res.status(400).json({ error: "Это сообщение нельзя изменить" });
    }
    const { text } = req.body ?? {};
    if (typeof text !== "string") return res.status(400).json({ error: "Некорректный текст" });
    const limit = textLimit(existing.type === "article");
    if (text.length > limit) return res.status(400).json({ error: `Сообщение длиннее ${limit} символов` });
    if (existing.type === "article" && !/^# \S/.test(text)) return res.status(400).json({ error: "У статьи должен быть заголовок" });
    if (!text.trim() && !existing.attachments?.length) return res.status(400).json({ error: "Сообщение не может быть пустым" });
    const message = await editMessage(req.params.messageId, text);
    const chat = await getChat(req.params.id);
    // Всем участникам, включая автора: его другие устройства и список чатов тоже должны обновиться.
    if (chat) broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: req.params.id, message });
    res.json({ message });
  })
);

router.delete(
  "/:messageId",
  asyncRoute(async (req, res) => {
    const forEveryone = !!(req.body ?? {}).forEveryone;
    const found = await loadMessageInChat(req, res, { allowModerator: forEveryone });
    if (!found) return;
    const existing = found.message;

    // Подарок удалить нельзя: запись о нём — часть истории чата, и по ней видно,
    // кто и что подарил. Ограничение общее для всех, включая модераторов.
    if (existing.type === "gift") {
      return res.status(400).json({ error: "Сообщение с подарком удалить нельзя" });
    }

    if (forEveryone) {
      const chatForDelete = found.chat;
      const mine = existing.senderId === req.uid;
      const staff = chatForDelete && chatForDelete.type !== "dm" && isStaff(chatForDelete, req.uid);
      const inDm = chatForDelete?.type === "dm";
      const channelOfDiscussion = !mine && !staff && !inDm ? await findChannelByDiscussionChatId(chatForDelete.id) : null;
      const channelStaff = !!channelOfDiscussion && isStaff(channelOfDiscussion, req.uid);
      const moderator = found.moderator || (!mine && !staff && !inDm && !channelStaff && (await isServerModerator(req.uid)));
      if (!mine && !staff && !inDm && !channelStaff && !moderator) {
        return res.status(403).json({ error: "Удалить чужое сообщение у всех могут владельцы, админы и модераторы" });
      }
      await deleteMessage(req.params.messageId);
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
      // Сам файл не трогаем: одинаковые файлы хранятся один раз (sha_…) и его
      // может держать пересланная копия, стикер-пак и т. п. Без ссылок его
      // уберёт orphanSweep. Доступ участников к файлам снимает deleteMessage
      // (lib/uploadAccess.js revokeAttachments).
      broadcastToOtherMembers(found.chat, req.uid, {
        type: "message:deleted",
        chatId: req.params.id,
        id: req.params.messageId,
      });
      return res.json({ ok: true, id: req.params.messageId, forEveryone: true });
    }

    await deleteMessageForMe(req.params.messageId, req.uid);
    res.json({ ok: true, id: req.params.messageId, forEveryone: false });
  })
);

function canPin(chat, userId) {
  if (!chat || !chat.memberIds.includes(userId)) return false;
  if (chat.type === "dm") return true;
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
    const found = await loadMessageInChat(req, res);
    if (!found) return;
    const { chat } = found;
    if (!canPin(chat, req.uid)) {
      return res.status(403).json({ error: "Закреплять сообщения могут владельцы, админы и модераторы" });
    }
    const { pinned } = req.body ?? {};
    const wasPinned = !!found.message.pinned;
    const message = await togglePin(req.params.messageId, pinned);
    broadcastToOtherMembers(chat, req.uid, { type: "message:updated", chatId: req.params.id, message });
    res.json({ message });
    // «Иван закрепил(а) „…“» — как в Telegram; только в группах и только при закреплении.
    if (chat.type === "group" && message?.pinned && !wasPinned) {
      const snippet = (message.text ?? "").replace(/\s+/g, " ").trim();
      const what = snippet ? `«${snippet.length > 40 ? `${snippet.slice(0, 40)}…` : snippet}»` : "сообщение";
      serviceLine(chat, req.uid, (name) => `${name} закрепил(а) ${what}`);
    }
  })
);

router.post(
  "/:messageId/react",
  asyncRoute(async (req, res) => {
    const found = await loadMessageInChat(req, res);
    if (!found) return;
    const { emoji } = req.body ?? {};
    if (Array.isArray(found.chat.allowedReactions) && !found.chat.allowedReactions.includes(emoji)) {
      const already = found.message.reactions.some((r) => r.emoji === emoji && r.userIds.includes(req.uid));
      if (!already) return res.status(400).json({ error: "Эта реакция недоступна в этом канале" });
    }
    const me = await getUser(req.uid);
    const maxReactionsPerUser = me?.isPremium ? 3 : 1;
    const message = await toggleReaction(req.params.messageId, emoji, req.uid, { maxReactionsPerUser });
    broadcastToOtherMembers(found.chat, req.uid, { type: "message:updated", chatId: req.params.id, message });
    res.json({ message });
  })
);

router.post(
  "/:messageId/vote",
  asyncRoute(async (req, res) => {
    const found = await loadMessageInChat(req, res);
    if (!found) return;
    const { optionIndex } = req.body ?? {};
    const message = await votePoll(req.params.messageId, optionIndex, req.uid);
    broadcastToOtherMembers(found.chat, req.uid, { type: "message:updated", chatId: req.params.id, message });
    res.json({ message });
  })
);

router.delete(
  "/:messageId/vote",
  asyncRoute(async (req, res) => {
    const found = await loadMessageInChat(req, res);
    if (!found) return;
    const message = await retractPollVote(req.params.messageId, req.uid);
    broadcastToOtherMembers(found.chat, req.uid, { type: "message:updated", chatId: req.params.id, message });
    res.json({ message });
  })
);

// Чек-лист: отметить/снять пункт, дописать пункты. Автор может всё; остальные —
// если он разрешил (othersCanMark / othersCanAdd).
router.post(
  "/:messageId/checklist",
  asyncRoute(async (req, res) => {
    const found = await loadMessageInChat(req, res);
    if (!found) return;
    const list = found.message.attachments?.find((a) => a.kind === "checklist");
    if (!list) return res.status(400).json({ error: "Это не чек-лист" });
    const author = found.message.senderId === req.uid;
    if (found.chat.type === "channel" && !isStaff(found.chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });

    let message;
    if (Array.isArray(req.body?.add)) {
      if (!author && !list.meta?.othersCanAdd) return res.status(403).json({ error: "Добавлять пункты может только автор" });
      const texts = req.body.add.map((t) => String(t ?? "").trim().slice(0, 200)).filter(Boolean).slice(0, MAX_CHECKLIST_ITEMS);
      if (!texts.length) return res.status(400).json({ error: "Введите текст пункта" });
      if ((list.meta?.items?.length ?? 0) >= MAX_CHECKLIST_ITEMS) return res.status(400).json({ error: `Не больше ${MAX_CHECKLIST_ITEMS} пунктов` });
      message = await addChecklistItems(found.message.id, texts, MAX_CHECKLIST_ITEMS);
    } else {
      if (!author && list.meta?.othersCanMark === false) return res.status(403).json({ error: "Отмечать пункты может только автор" });
      const itemId = Number(req.body?.itemId);
      if (!list.meta?.items?.some((it) => it.id === itemId)) return res.status(404).json({ error: "Пункт не найден" });
      message = await toggleChecklistItem(found.message.id, itemId, req.uid);
    }
    broadcastToOtherMembers(found.chat, req.uid, { type: "message:updated", chatId: req.params.id, message });
    res.json({ message });
  })
);

router.post(
  "/:messageId/poll/close",
  asyncRoute(async (req, res) => {
    const found = await loadMessageInChat(req, res);
    if (!found) return;
    if (found.message.senderId !== req.uid && !isStaff(found.chat, req.uid)) {
      return res.status(403).json({ error: "Остановить опрос может только его автор или администратор" });
    }
    if (!found.message.attachments?.some((a) => a.kind === "poll")) return res.status(400).json({ error: "Это не опрос" });
    const message = await closePoll(req.params.messageId);
    broadcastToOtherMembers(found.chat, req.uid, { type: "message:updated", chatId: req.params.id, message });
    res.json({ message });
  })
);

router.get(
  "/days",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    const month = String(req.query.month ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "Нужен месяц в виде ГГГГ-ММ" });
    const tz = Number(req.query.tz);
    res.json({ days: listMessageDays(chat.id, { month, tzOffsetMinutes: Number.isFinite(tz) ? tz : 0 }) });
  })
);

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
module.exports.sendGate = sendGate;
module.exports.forwardOrigin = forwardOrigin;
module.exports.pushNewMessage = pushNewMessage;
module.exports.preparePaidMedia = preparePaidMedia;
