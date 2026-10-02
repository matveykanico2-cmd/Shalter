const fs = require("fs");
const { genId } = require("../lib/genId");
const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { getChat, findChannelByDiscussionChatId } = require("../data/chats");
const { sanitizeAttachments, isSafeUrl } = require("../lib/sanitizeAttachments");
const { sanitizeSticker } = require("../lib/sanitizeSticker");
const { sanitizeScene } = require("../lib/sanitizeScene");

const MAX_MESSAGE_EMOJI = 24;
function sanitizeMessageEmoji(input) {
  if (!Array.isArray(input) || input.length === 0) return undefined;
  const cleaned = input.slice(0, MAX_MESSAGE_EMOJI).map((scene) => sanitizeScene(scene, { requireLayers: true }) ?? null);
  return cleaned.some(Boolean) ? cleaned : undefined;
}
const { searchInChats, listMessages, listMessagesPage, listThreadReplies, addMessage, getMessage, editMessage, deleteMessage, deleteMessageForMe, togglePin, toggleReaction, incrementCommentCount, votePoll, retractPollVote, closePoll, markChatRead, setLinkPreview, updateLiveLocation, setAttachmentPreview, listMessageDays, firstMessageOfDay } = require("../data/messages");
const { getUser, findUserIdsByUsernames } = require("../data/users");
const { transferStars, balanceOf } = require("../data/stars");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { ADMIN_PHONE, isAdminPhone } = require("../config");
const { getSettings, isQuietNow } = require("../data/settings");
const { listContactsFor } = require("../data/contacts");
const { allowsUser } = require("../lib/privacyRules");
const { messageCost } = require("../lib/messagePrice");
const { listScheduledFor, addScheduled, editScheduled, deleteScheduled, getScheduled } = require("../data/scheduledMessages");
const { getBotByUserId } = require("../data/bots");
const { runBotCode } = require("../lib/botSandbox");
const { dispatchHugo } = require("../lib/hugoBot");
const { dispatchHelperBot } = require("../lib/helperBot");
const { dispatchBusinessAutoReply } = require("../lib/businessAutoReply");
const { can, DENIED, isStaff } = require("../lib/chatPermissions");
const { broadcastToUsers } = require("../ws");
const { sendPushToUser, pushAvatar, userPushAvatar, MESSAGE_PUSH } = require("../push");
const { registerAttachments } = require("../lib/uploadAccess");
const { fetchLinkPreview } = require("../lib/linkPreview");
const { deleteUploadedFiles, FILENAME_RE } = require("../lib/serveUpload");
const { generateVideoPreview, generateImagePreview } = require("../lib/mediaPreview");
const { fetchUploadToTemp, storeGeneratedFile } = require("../lib/uploadTransfer");
const { hasAdminSection } = require("../lib/adminAccess");
const { transcribeFile, needsTranscript } = require("../lib/voiceTranscribe");

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

async function pushNewMessage(chat, sender, message) {
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
      const body = !settings.notifications.previewText
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
        { title, body, ...avatar, url: `/chat/${chat.id}`, kind: "message", tag: `chat-${chat.id}` },
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
    const { messages, hasMore } = listMessagesPage(req.params.id, req.uid, settings.chatClears?.[req.params.id], { limit, before, beforeId });

    const firstUnreadId =
      messages.find((m) => m.senderId !== req.uid && !(m.readByIds ?? []).includes(req.uid))?.id ?? null;

    const changedIds = await markChatRead(req.params.id, req.uid);
    if (changedIds.length > 0) {
      broadcastToOtherMembers(chat, req.uid, {
        type: "message:read",
        chatId: req.params.id,
        readerId: req.uid,
        messageIds: changedIds,
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
      .filter((m) => !m.deleted && (!clearedBefore || m.createdAt > clearedBefore))
      .reverse();
    res.json({ messages: found });
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

const PREVIEWABLE_KINDS = new Set(["image", "video"]);

function uploadFilename(url) {
  if (typeof url !== "string" || !url.startsWith("/uploads/")) return null;
  const filename = url.slice("/uploads/".length);
  return FILENAME_RE.test(filename) ? filename : null;
}

function needsPreview(attachment) {
  if (!PREVIEWABLE_KINDS.has(attachment?.kind) || !uploadFilename(attachment.url)) return false;
  return attachment.kind === "video" ? !attachment.previewUrl : !attachment.thumbUrl;
}

function markPendingPreviews(attachments) {
  return attachments?.map((a) =>
    needsPreview(a) ? { ...a, previewPending: true } : needsTranscript(a) && uploadFilename(a.url) ? { ...a, transcriptPending: true } : a
  );
}

async function attachTranscripts(chat, message) {
  for (const [index, attachment] of (message.attachments ?? []).entries()) {
    if (!attachment.transcriptPending) continue;
    let transcript = "";
    try {
      const sourcePath = await fetchUploadToTemp(uploadFilename(attachment.url));
      try {
        transcript = await transcribeFile(sourcePath);
      } finally {
        await fs.promises.unlink(sourcePath).catch(() => {});
      }
    } catch (err) {
      console.error(`transcription failed for ${message.id}#${index}:`, err.message);
    }
    const updated = await setAttachmentPreview(message.id, index, { transcriptPending: false, transcript: transcript || undefined });
    if (updated) broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message: updated });
  }
}

async function buildPreview(attachment, filename) {
  const sourcePath = await fetchUploadToTemp(filename);
  try {
    if (attachment.kind === "image") {
      const previewPath = await generateImagePreview(sourcePath);
      try {
        const previewUrl = await storeGeneratedFile(previewPath);
        return { previewUrl, thumbUrl: previewUrl };
      } finally {
        await fs.promises.unlink(previewPath).catch(() => {});
      }
    }
    const { previewPath, posterPath, width, height, durationSec } = await generateVideoPreview(sourcePath);
    try {
      const previewUrl = await storeGeneratedFile(previewPath);
      const posterUrl = await storeGeneratedFile(posterPath);
      return { previewUrl, posterUrl, width, height, durationSec };
    } finally {
      await fs.promises.unlink(previewPath).catch(() => {});
      await fs.promises.unlink(posterPath).catch(() => {});
    }
  } finally {
    await fs.promises.unlink(sourcePath).catch(() => {});
  }
}

async function attachPreviews(chat, message) {
  for (const [index, attachment] of (message.attachments ?? []).entries()) {
    const filename = needsPreview(attachment) ? uploadFilename(attachment.url) : null;
    if (!filename) continue;
    let preview = null;
    try {
      preview = await buildPreview(attachment, filename);
    } catch (err) {
      console.error(`preview generation failed for ${message.id}#${index}:`, err.message);
    }
    if (preview) registerAttachments(chat.id, [{ url: preview.previewUrl, thumbUrl: preview.posterUrl }]);
    const updated = await setAttachmentPreview(message.id, index, preview ?? {});
    if (updated) broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message: updated });
  }
}

function sanitizeStoryReply(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const url = typeof raw.url === "string" && isSafeUrl(raw.url) ? raw.url : undefined;
  const kind = raw.kind === "video" ? "video" : "image";
  const authorName = typeof raw.authorName === "string" ? raw.authorName.slice(0, 100) : undefined;
  if (!url && !authorName) return undefined;
  return { url, kind, authorName };
}

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
    id: genId("m"),
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
    storyReply: sanitizeStoryReply(body.storyReply),
    attachments: markPendingPreviews(sanitizeAttachments(body.attachments)),
    forwardedFrom,
    sticker: sanitizeSticker(body.sticker),
    customEmoji: sanitizeMessageEmoji(body.customEmoji),
    readByIds: [senderId],
    paidStars,
    anonymous: !!(body.anonymous && chat.type === "group" && chat.anonymousAdmins && isStaff(chat, senderId)),
  });

  registerAttachments(chat.id, message.attachments);
  if (message.sticker?.kind === "image") registerAttachments(chat.id, [{ url: message.sticker.url }]);

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
    broadcastToOtherMembers(chat, senderId, { type: "message:new", chatId: chat.id, message });
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

  dispatchHelperBot(chat, message);

  dispatchBusinessAutoReply(chat, message);

  if (message.replyToId) {
    const anchor = await getMessage(message.replyToId);
    if (anchor?.anchorForPostId) await incrementCommentCount(anchor.anchorForPostId);
  }

  const sender = await getUser(senderId);
  pushNewMessage(chat, sender, message).catch((err) => console.error("push notify failed:", err));

  attachPreviews(chat, message).catch((err) => console.error("attachment preview failed:", err));
  attachTranscripts(chat, message).catch((err) => console.error("voice transcription failed:", err));

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

    const restrictedUntil = chat.restrictions?.[req.uid];
    if (restrictedUntil && (restrictedUntil === "forever" || restrictedUntil > new Date().toISOString())) {
      return res.status(403).json({ error: "Вам запрещено писать в этом чате" });
    }

    const body = req.body ?? {};
    if (!body.text?.trim() && !body.attachments?.length && !body.sticker) {
      return res.status(400).json({ error: "empty message" });
    }

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
    let other = undefined;
    if (chat.type === "dm") {
      const otherId = chat.memberIds.find((m) => m !== req.uid);
      other = otherId ? await getUser(otherId) : undefined;
      if (other?.blockedUserIds?.includes(req.uid)) {
        return res.status(403).json({ error: "Пользователь заблокировал вас" });
      }

      if (otherId === SYSTEM_BOT_ID) {
        return res.status(403).json({ error: "Shalter — служебный чат, отвечать в нём нельзя" });
      }

      if (other) {
        const writeAllowed = await allowsUser(other.id, "messages", req.uid);
        if (!writeAllowed) {
          const { privacy: theirPrivacy } = await getSettings(other.id);
          const level = theirPrivacy?.messages ?? "everyone";
          const deniedByName = (theirPrivacy?.exceptions?.messages?.deny ?? []).includes(req.uid);
          let bypass = false;
          if (level === "contacts" && !deniedByName) {
            const sender = await getUser(req.uid);
            bypass =
              !!sender?.isPremium || (await listMessages(chat.id, other.id)).some((m) => m.senderId === other.id);
          }
          if (!bypass) {
            return res.status(403).json({
              error:
                level === "nobody"
                  ? "Этот пользователь никому не разрешает писать первым"
                  : "Этот пользователь принимает сообщения только от своих контактов. С Premium писать можно",
              privacyBlocked: true,
            });
          }
        }

        const { price, mustPay } = await messageCost(req.uid, other, chat.id);
        if (mustPay) {
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
    } else if (chat.type === "group") {
      const channel = await findChannelByDiscussionChatId(chat.id);
      const price = channel?.commentPriceStars ?? 0;
      if (price > 0 && channel.ownerId !== req.uid && !isStaff(channel, req.uid)) {
        const sender = await getUser(req.uid);
        if (!sender?.isPremium) {
          if (!transferStars(req.uid, channel.ownerId, price)) {
            return res.status(402).json({
              error: `Комментарии в этом канале стоят ${price} ⭐. Не хватает звёзд. С Premium — бесплатно`,
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

router.post(
  "/:messageId/location",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });

    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: "invalid coordinates" });

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
    if (!body.text?.trim() && !body.attachments?.length) {
      return res.status(400).json({ error: "empty message" });
    }
    if (!body.sendAt || body.sendAt <= new Date().toISOString()) {
      return res.status(400).json({ error: "Время отправки должно быть в будущем" });
    }

    const scheduled = await addScheduled({
      id: genId("sch"),
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
    const found = await loadMessageInChat(req, res);
    if (!found) return;
    const existing = found.message;
    if (existing.senderId !== req.uid) {
      return res.status(403).json({ error: "forbidden" });
    }
    const legacyCallLog = existing.createdAt < "2026-10-03" && /^📞 (Звонок|Видеозвонок|Пропущенный звонок|Звонок отклонён)/.test(existing.text ?? "");
    if (existing.type === "call" || legacyCallLog) {
      return res.status(400).json({ error: "Это сообщение нельзя изменить" });
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
    const forEveryone = !!(req.body ?? {}).forEveryone;
    const found = await loadMessageInChat(req, res, { allowModerator: forEveryone });
    if (!found) return;
    const existing = found.message;

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
      await deleteUploadedFiles(existing.attachments);
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
    const message = await togglePin(req.params.messageId, pinned);
    broadcastToOtherMembers(chat, req.uid, { type: "message:updated", chatId: req.params.id, message });
    res.json({ message });
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
