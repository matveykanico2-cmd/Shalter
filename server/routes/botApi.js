const express = require("express");
const { genId } = require("../lib/genId");
const { asyncRoute } = require("../middleware/errors");
const { requireBotToken } = require("../middleware/botAuth");
const { getUser, findUserByUsername, updateUser } = require("../data/users");
const { listChatsForUser, getChat, updateChat, findChatByUsername, createChat, findDmBetween } = require("../data/chats");
const { listAllMessages, listNewForBot, listMessages, getMessage, editMessage, deleteMessage, togglePin, addMessage, listMessagesPage, toggleReaction, setKeyboard } = require("../data/messages");
const { addScheduled, listScheduledFor, getScheduled, deleteScheduled } = require("../data/scheduledMessages");
const { sanitizePermissions } = require("../lib/chatPermissions");
const crypto = require("crypto");
const { publicUser, publicUsers } = require("../data/sanitize");
const { broadcastToUsers } = require("../ws");
const { markTyping, normalizeAction } = require("../data/typing");
const { updateBotApp, updateBotAppCode, updateBotCommands, updateBotDescription, getBotToken } = require("../data/bots");
const { sendBotMessage, normalizeKeyboard } = require("../lib/botMessaging");
const { findOrCreateDm } = require("../lib/systemChat");
const { allowsUser } = require("../lib/privacyRules");
const { validateAppUrl, verifyInitData } = require("../lib/miniApp");
const { checkUsername, normalizeUsername } = require("../lib/username");

const router = express.Router();
router.use(requireBotToken);

router.get(
  "/me",
  asyncRoute(async (req, res) => {
    const user = await getUser(req.bot.userId);
    res.json({ bot: publicUser(user), app: botApp(req, req.bot, user) });
  })
);

const LONG_POLL_MAX_SEC = 50;
const LONG_POLL_STEP_MS = 250;

router.get(
  "/updates",
  asyncRoute(async (req, res) => {
    const after = req.query.after || "1970-01-01T00:00:00.000Z";
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 200));
    const timeoutSec = Math.min(LONG_POLL_MAX_SEC, Math.max(0, Number(req.query.timeout) || 0));

    const read = () => listNewForBot(req.bot.userId, { after, limit });

    let messages = read();
    if (messages.length || !timeoutSec) return res.json({ messages });

    let alive = true;
    res.on("close", () => {
      alive = false;
    });

    const deadline = Date.now() + timeoutSec * 1000;
    while (alive && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, LONG_POLL_STEP_MS));
      if (!alive) return;
      messages = read();
      if (messages.length) return res.json({ messages });
    }
    if (alive) res.json({ messages: [] });
  })
);

router.post(
  "/sendMessage",
  asyncRoute(async (req, res) => {
    const { chatId, text, keyboard, replyToId } = req.body ?? {};
    try {
      const message = await sendBotMessage(req.bot.userId, chatId, text, { keyboard, replyToId });
      res.json({ message });
    } catch (err) {
      res.status(err.message === "text is required" ? 400 : 404).json({ error: err.message });
    }
  })
);

async function botOwns(botUserId, messageId) {
  const message = await getMessage(messageId);
  if (!message) return { status: 404, error: "Message not found" };
  const chat = await getChat(message.chatId);
  if (!chat || !chat.memberIds.includes(botUserId)) return { status: 404, error: "Bot is not a member of this chat" };
  if (message.senderId !== botUserId) return { status: 403, error: "Bot can only touch its own messages" };
  return { chat, message };
}

router.post(
  "/editMessageText",
  asyncRoute(async (req, res) => {
    const { messageId, text } = req.body ?? {};
    if (!text?.trim()) return res.status(400).json({ error: "text is required" });
    const found = await botOwns(req.bot.userId, messageId);
    if (found.error) return res.status(found.status).json({ error: found.error });

    const message = await editMessage(messageId, text);
    broadcastToUsers(found.chat.memberIds, { type: "message:updated", chatId: found.chat.id, message });
    res.json({ message });
  })
);

router.post(
  "/deleteMessage",
  asyncRoute(async (req, res) => {
    const found = await botOwns(req.bot.userId, req.body?.messageId);
    if (found.error) return res.status(found.status).json({ error: found.error });

    await deleteMessage(found.message.id);
    broadcastToUsers(found.chat.memberIds, { type: "message:deleted", chatId: found.chat.id, messageId: found.message.id });
    res.json({ ok: true });
  })
);

router.post(
  "/pinChatMessage",
  asyncRoute(async (req, res) => {
    const { messageId, pinned = true } = req.body ?? {};
    const message = await getMessage(messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });
    const chat = await getChat(message.chatId);
    if (!chat || !chat.memberIds.includes(req.bot.userId)) return res.status(404).json({ error: "Bot is not a member of this chat" });
    if (!(chat.adminIds ?? []).includes(req.bot.userId) && chat.type !== "dm") {
      return res.status(403).json({ error: "Bot must be an admin to pin messages" });
    }

    const updated = await togglePin(messageId, !!pinned);
    broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message: updated });
    res.json({ message: updated });
  })
);

router.post(
  "/sendChatAction",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.body?.chatId);
    if (!chat || !chat.memberIds.includes(req.bot.userId)) return res.status(404).json({ error: "Bot is not a member of this chat" });
    const action = normalizeAction(req.body?.action);
    markTyping(chat.id, req.bot.userId, action);
    broadcastToUsers(chat.memberIds, { type: "typing:update", chatId: chat.id, userId: req.bot.userId, action });
    res.json({ ok: true });
  })
);

router.post(
  "/sendPhoto",
  asyncRoute(async (req, res) => {
    const { chatId, url, caption = "", replyToId } = req.body ?? {};
    if (!url) return res.status(400).json({ error: "url is required" });
    try {
      const message = await sendBotMessage(req.bot.userId, chatId, caption || "🖼", {
        replyToId,
        attachments: [{ kind: "image", url, name: "photo" }],
      });
      res.json({ message });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  })
);

router.post(
  "/sendDocument",
  asyncRoute(async (req, res) => {
    const { chatId, url, name = "file", caption = "", replyToId } = req.body ?? {};
    if (!url) return res.status(400).json({ error: "url is required" });
    try {
      const message = await sendBotMessage(req.bot.userId, chatId, caption || `📎 ${name}`, {
        replyToId,
        attachments: [{ kind: "file", url, name }],
      });
      res.json({ message });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  })
);

router.get(
  "/getChats",
  asyncRoute(async (req, res) => {
    const chats = await listChatsForUser(req.bot.userId);
    res.json({
      chats: chats.map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        username: c.username ?? null,
        memberCount: c.memberIds.length,
        isAdmin: (c.adminIds ?? []).includes(req.bot.userId),
      })),
    });
  })
);

router.get(
  "/getChat",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.query.chatId);
    if (!chat || !chat.memberIds.includes(req.bot.userId)) return res.status(404).json({ error: "Bot is not a member of this chat" });
    const members = await Promise.all(chat.memberIds.map((id) => getUser(id)));
    res.json({
      chat: {
        id: chat.id,
        type: chat.type,
        title: chat.title,
        username: chat.username ?? null,
        description: chat.description ?? null,
        memberCount: chat.memberIds.length,
        isAdmin: (chat.adminIds ?? []).includes(req.bot.userId),
      },
      members: publicUsers(members.filter(Boolean)),
    });
  })
);

router.get(
  "/getUser",
  asyncRoute(async (req, res) => {
    const user = await getUser(req.query.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user: publicUser(user) });
  })
);

router.get(
  "/getMyCommands",
  asyncRoute(async (req, res) => {
    res.json({ commands: req.bot.commands ?? [] });
  })
);

router.post(
  "/setMyCommands",
  asyncRoute(async (req, res) => {
    const raw = Array.isArray(req.body?.commands) ? req.body.commands : [];
    const commands = raw
      .filter((c) => c && typeof c.command === "string" && c.command.trim())
      .slice(0, 50)
      .map((c) => ({
        command: c.command.trim().replace(/^\//, "").slice(0, 32),
        description: String(c.description ?? "").slice(0, 120),
      }));
    const bot = await updateBotCommands(req.bot.id, commands);
    res.json({ commands: bot?.commands ?? commands });
  })
);

router.get(
  "/resolveUsername",
  asyncRoute(async (req, res) => {
    const handle = String(req.query.username ?? "").trim().replace(/^@/, "");
    if (!handle) return res.status(400).json({ error: "username is required" });
    const user = await findUserByUsername(handle);
    if (user) return res.json({ kind: "user", user: publicUser(user) });
    const chat = await findChatByUsername(handle);
    if (chat) {
      return res.json({
        kind: chat.type,
        chat: { id: chat.id, type: chat.type, title: chat.title, username: chat.username, memberCount: chat.memberIds.length },
      });
    }
    res.status(404).json({ error: "Not found" });
  })
);

router.get(
  "/getMessages",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.query.chatId);
    if (!chat || !chat.memberIds.includes(req.bot.userId)) return res.status(404).json({ error: "Bot is not a member of this chat" });
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
    const page = listMessagesPage(chat.id, req.bot.userId, null, { limit, before: req.query.before || null });
    res.json({ messages: page.messages ?? page, hasMore: page.hasMore ?? false });
  })
);

router.post(
  "/sendSticker",
  asyncRoute(async (req, res) => {
    const { chatId, emoji, name, scene, replyToId } = req.body ?? {};
    if (!emoji) return res.status(400).json({ error: "emoji is required" });
    const chat = await getChat(chatId);
    if (!chat || !chat.memberIds.includes(req.bot.userId)) return res.status(404).json({ error: "Bot is not a member of this chat" });
    const message = await addMessage({
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      chatId: chat.id,
      senderId: req.bot.userId,
      type: "sticker",
      text: "",
      createdAt: new Date().toISOString(),
      replyToId: replyToId ?? null,
      sticker: { emoji: String(emoji).slice(0, 8), name: name ? String(name).slice(0, 60) : undefined, scene: scene ? String(scene).slice(0, 40) : undefined },
      readByIds: [],
    });
    broadcastToUsers(chat.memberIds, { type: "message:new", chatId: chat.id, message });
    res.json({ message });
  })
);

router.post(
  "/sendPoll",
  asyncRoute(async (req, res) => {
    const { chatId, question, options, replyToId } = req.body ?? {};
    const list = (Array.isArray(options) ? options : []).map((o) => String(o).slice(0, 120)).filter(Boolean).slice(0, 8);
    if (!question?.trim()) return res.status(400).json({ error: "question is required" });
    if (list.length < 2) return res.status(400).json({ error: "at least two options are required" });
    try {
      const message = await sendBotMessage(req.bot.userId, chatId, question, {
        replyToId,
        attachments: [{ kind: "poll", meta: { options: list, votes: list.map(() => 0), voterIds: list.map(() => []) } }],
      });
      res.json({ message });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  })
);

router.post(
  "/sendReaction",
  asyncRoute(async (req, res) => {
    const { messageId, emoji } = req.body ?? {};
    if (!emoji) return res.status(400).json({ error: "emoji is required" });
    const target = await getMessage(messageId);
    if (!target) return res.status(404).json({ error: "Message not found" });
    const chat = await getChat(target.chatId);
    if (!chat || !chat.memberIds.includes(req.bot.userId)) return res.status(404).json({ error: "Bot is not a member of this chat" });
    const message = await toggleReaction(messageId, String(emoji).slice(0, 8), req.bot.userId);
    broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message });
    res.json({ message });
  })
);

async function requireBotAdmin(req, res, chatId) {
  const chat = await getChat(chatId);
  if (!chat || !chat.memberIds.includes(req.bot.userId)) {
    res.status(404).json({ error: "Bot is not a member of this chat" });
    return null;
  }
  if (!(chat.adminIds ?? []).includes(req.bot.userId)) {
    res.status(403).json({ error: "Bot must be an admin of this chat" });
    return null;
  }
  return chat;
}

router.post(
  "/deleteAnyMessage",
  asyncRoute(async (req, res) => {
    const target = await getMessage(req.body?.messageId);
    if (!target) return res.status(404).json({ error: "Message not found" });
    const chat = await requireBotAdmin(req, res, target.chatId);
    if (!chat) return;
    await deleteMessage(target.id);
    broadcastToUsers(chat.memberIds, { type: "message:deleted", chatId: chat.id, messageId: target.id });
    res.json({ ok: true });
  })
);

router.post(
  "/banChatMember",
  asyncRoute(async (req, res) => {
    const { chatId, userId } = req.body ?? {};
    const chat = await requireBotAdmin(req, res, chatId);
    if (!chat) return;
    if (userId === chat.ownerId || (chat.adminIds ?? []).includes(userId)) {
      return res.status(400).json({ error: "Cannot remove the owner or an admin" });
    }
    if (!chat.memberIds.includes(userId)) return res.status(404).json({ error: "User is not a member" });
    const updated = await updateChat(chat.id, { memberIds: chat.memberIds.filter((id) => id !== userId) });
    broadcastToUsers([...chat.memberIds], { type: "chat:updated", chat: updated });
    res.json({ ok: true, memberCount: updated.memberIds.length });
  })
);

router.post(
  "/restrictChatMember",
  asyncRoute(async (req, res) => {
    const { chatId, userId, minutes = 60 } = req.body ?? {};
    const chat = await requireBotAdmin(req, res, chatId);
    if (!chat) return;
    if (userId === chat.ownerId || (chat.adminIds ?? []).includes(userId)) {
      return res.status(400).json({ error: "Cannot restrict the owner or an admin" });
    }
    const until = new Date(Date.now() + Math.max(1, Math.min(43200, Number(minutes) || 60)) * 60000).toISOString();
    const restrictions = { ...(chat.restrictions ?? {}), [userId]: until };
    const updated = await updateChat(chat.id, { restrictions });
    broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
    res.json({ ok: true, until });
  })
);

router.post(
  "/setChatTitle",
  asyncRoute(async (req, res) => {
    const { chatId, title } = req.body ?? {};
    const chat = await requireBotAdmin(req, res, chatId);
    if (!chat) return;
    if (!title?.trim()) return res.status(400).json({ error: "title is required" });
    const updated = await updateChat(chat.id, { title: String(title).trim().slice(0, 120) });
    broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
    res.json({ chat: { id: updated.id, title: updated.title } });
  })
);

router.post(
  "/setChatDescription",
  asyncRoute(async (req, res) => {
    const { chatId, description } = req.body ?? {};
    const chat = await requireBotAdmin(req, res, chatId);
    if (!chat) return;
    const updated = await updateChat(chat.id, { description: String(description ?? "").slice(0, 500) });
    broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
    res.json({ chat: { id: updated.id, description: updated.description } });
  })
);

router.post(
  "/leaveChat",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.body?.chatId);
    if (!chat || !chat.memberIds.includes(req.bot.userId)) return res.status(404).json({ error: "Bot is not a member of this chat" });
    const updated = await updateChat(chat.id, { memberIds: chat.memberIds.filter((id) => id !== req.bot.userId) });
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    res.json({ ok: true });
  })
);

router.post(
  "/setMyProfile",
  asyncRoute(async (req, res) => {
    const { name, description } = req.body ?? {};
    if (name !== undefined && String(name).trim()) await updateUser(req.bot.userId, { name: String(name).trim().slice(0, 80) });
    if (description !== undefined) await updateBotDescription(req.bot.id, String(description).slice(0, 500));
    const user = await getUser(req.bot.userId);
    res.json({ bot: publicUser(user) });
  })
);

function botApp(req, bot, botUser) {
  if (bot.appCode) {
    const handle = botUser?.username || "";
    return { url: `${req.protocol}://${req.get("host")}/app/${handle}`, name: bot.appName, hosted: true };
  }
  return bot.appUrl ? { url: bot.appUrl, name: bot.appName, hosted: false } : null;
}

router.post(
  "/setWebApp",
  asyncRoute(async (req, res) => {
    const checked = validateAppUrl(req.body?.url ?? "");
    if (checked.error) return res.status(400).json({ error: checked.error });
    const name = String(req.body?.name ?? "").trim().slice(0, 40);
    const bot = await updateBotApp(req.bot.id, { appUrl: checked.url, appName: name });
    res.json({ app: botApp(req, bot, await getUser(req.bot.userId)) });
  })
);

router.post(
  "/setWebAppCode",
  asyncRoute(async (req, res) => {
    const code = String(req.body?.code ?? "");
    if (code.length > 200_000) return res.status(400).json({ error: "Страница длиннее 200 000 символов" });
    const botUser = await getUser(req.bot.userId);
    if (code.trim() && !botUser?.username) {
      return res.status(409).json({ error: "У бота нет юзернейма — по нему строится адрес приложения" });
    }
    const name = String(req.body?.name ?? req.bot.appName ?? "").trim().slice(0, 40);
    const bot = await updateBotAppCode(req.bot.id, { appCode: code.trim() ? code : null, appName: name });
    res.json({ app: botApp(req, bot, botUser) });
  })
);

router.post(
  "/checkWebAppData",
  asyncRoute(async (req, res) => {
    const token = getBotToken(req.bot.id);
    const result = verifyInitData(token, req.body?.initData ?? "");
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    const user = await getUser(result.user?.id);
    res.json({
      ok: true,
      user: user ? publicUser(user) : result.user,
      chatId: result.chatId,
      authDate: result.authDate,
      ageSec: result.ageSec,
    });
  })
);

async function botChat(req, res, chatId) {
  const chat = await getChat(chatId);
  if (!chat || !chat.memberIds.includes(req.bot.userId)) {
    res.status(404).json({ error: "Bot is not a member of this chat" });
    return null;
  }
  return chat;
}

function mediaSender(kind, defaultText) {
  return asyncRoute(async (req, res) => {
    const { chatId, url, caption = "", name, replyToId } = req.body ?? {};
    if (!url) return res.status(400).json({ error: "url is required" });
    try {
      const message = await sendBotMessage(req.bot.userId, chatId, caption || defaultText, {
        replyToId,
        attachments: [{ kind, url, name: name ? String(name).slice(0, 200) : undefined }],
      });
      res.json({ message });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });
}

router.post("/sendVideo", mediaSender("video", "🎬 Видео"));
router.post("/sendVoice", mediaSender("voice", "🎤 Голосовое"));
router.post("/sendVideoNote", mediaSender("video-note", "⭕ Кружок"));

router.post(
  "/sendLocation",
  asyncRoute(async (req, res) => {
    const { chatId, lat, lng, caption = "", replyToId } = req.body ?? {};
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      return res.status(400).json({ error: "lat and lng are required" });
    }
    try {
      const message = await sendBotMessage(req.bot.userId, chatId, caption || "📍 Место", {
        replyToId,
        attachments: [{ kind: "location", meta: { lat: Number(lat), lng: Number(lng) } }],
      });
      res.json({ message });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  })
);

router.post(
  "/sendContact",
  asyncRoute(async (req, res) => {
    const { chatId, name, phone, userId, replyToId } = req.body ?? {};
    if (!name && !phone) return res.status(400).json({ error: "name or phone is required" });
    try {
      const message = await sendBotMessage(req.bot.userId, chatId, `👤 ${name ?? phone}`, {
        replyToId,
        attachments: [{ kind: "contact", meta: { name, phone, userId } }],
      });
      res.json({ message });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  })
);

router.post(
  "/forwardMessage",
  asyncRoute(async (req, res) => {
    const { messageId, toChatId } = req.body ?? {};
    const source = await getMessage(messageId);
    if (!source) return res.status(404).json({ error: "Message not found" });
    const from = await botChat(req, res, source.chatId);
    if (!from) return;
    const to = await botChat(req, res, toChatId);
    if (!to) return;
    const author = await getUser(source.senderId);
    const message = await addMessage({
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      chatId: to.id,
      senderId: req.bot.userId,
      type: source.type ?? "text",
      text: source.text ?? "",
      createdAt: new Date().toISOString(),
      attachments: source.attachments,
      forwardedFrom: { chatId: from.id, chatTitle: from.title, senderId: source.senderId, senderName: author?.name ?? "—" },
      readByIds: [],
    });
    broadcastToUsers(to.memberIds, { type: "message:new", chatId: to.id, message });
    res.json({ message });
  })
);

router.get(
  "/getMessage",
  asyncRoute(async (req, res) => {
    const message = await getMessage(req.query.messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });
    if (!(await botChat(req, res, message.chatId))) return;
    res.json({ message });
  })
);

router.get(
  "/searchMessages",
  asyncRoute(async (req, res) => {
    const chat = await botChat(req, res, req.query.chatId);
    if (!chat) return;
    const q = String(req.query.q ?? "").trim().toLowerCase();
    if (!q) return res.status(400).json({ error: "q is required" });
    const all = await listMessages(chat.id, req.bot.userId);
    const found = all.filter((m) => (m.text ?? "").toLowerCase().includes(q)).slice(-50);
    res.json({ messages: found });
  })
);

router.get(
  "/getPinnedMessages",
  asyncRoute(async (req, res) => {
    const chat = await botChat(req, res, req.query.chatId);
    if (!chat) return;
    const all = await listMessages(chat.id, req.bot.userId);
    res.json({ messages: all.filter((m) => m.pinned) });
  })
);

router.post(
  "/unpinChatMessage",
  asyncRoute(async (req, res) => {
    const message = await getMessage(req.body?.messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });
    const chat = await botChat(req, res, message.chatId);
    if (!chat) return;
    if (!(chat.adminIds ?? []).includes(req.bot.userId) && chat.type !== "dm") {
      return res.status(403).json({ error: "Bot must be an admin to unpin messages" });
    }
    const updated = await togglePin(message.id, false);
    broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message: updated });
    res.json({ message: updated });
  })
);

router.post(
  "/editMessageKeyboard",
  asyncRoute(async (req, res) => {
    const { messageId, keyboard } = req.body ?? {};
    const found = await botOwns(req.bot.userId, messageId);
    if (found.error) return res.status(found.status).json({ error: found.error });
    const message = await setKeyboard(messageId, normalizeKeyboard(keyboard) ?? []);
    broadcastToUsers(found.chat.memberIds, { type: "message:updated", chatId: found.chat.id, message });
    res.json({ message });
  })
);

router.post(
  "/scheduleMessage",
  asyncRoute(async (req, res) => {
    const { chatId, text, sendAt } = req.body ?? {};
    const chat = await botChat(req, res, chatId);
    if (!chat) return;
    if (!text?.trim()) return res.status(400).json({ error: "text is required" });
    const when = new Date(sendAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      return res.status(400).json({ error: "sendAt must be a future ISO date" });
    }
    const scheduled = await addScheduled({
      id: `sm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      chatId: chat.id,
      senderId: req.bot.userId,
      text: String(text).slice(0, 4000),
      attachments: undefined,
      replyToId: null,
      sendAt: when.toISOString(),
      createdAt: new Date().toISOString(),
    });
    res.json({ scheduled });
  })
);

router.get(
  "/getScheduled",
  asyncRoute(async (req, res) => {
    const chat = await botChat(req, res, req.query.chatId);
    if (!chat) return;
    res.json({ scheduled: await listScheduledFor(chat.id, req.bot.userId) });
  })
);

router.post(
  "/cancelScheduled",
  asyncRoute(async (req, res) => {
    const item = await getScheduled(req.body?.scheduledId);
    if (!item || item.senderId !== req.bot.userId) return res.status(404).json({ error: "Not found" });
    await deleteScheduled(item.id);
    res.json({ ok: true });
  })
);

router.post(
  "/createGroup",
  asyncRoute(async (req, res) => {
    const { title, memberIds } = req.body ?? {};
    if (!title?.trim()) return res.status(400).json({ error: "title is required" });
    const known = new Set();
    for (const c of await listChatsForUser(req.bot.userId)) for (const id of c.memberIds) known.add(id);
    const invited = (Array.isArray(memberIds) ? memberIds : []).filter((id) => known.has(id));
    const now = new Date().toISOString();
    const chat = await createChat({
      id: genId("c"),
      type: "group",
      title: String(title).trim().slice(0, 120),
      avatarColor: "#5b8def",
      memberIds: [req.bot.userId, ...invited],
      ownerId: req.bot.userId,
      adminIds: [req.bot.userId],
      pinned: false,
      muted: false,
      archived: false,
      createdAt: now,
    });
    broadcastToUsers(chat.memberIds, { type: "chat:created", chat });
    res.json({ chat: { id: chat.id, title: chat.title, memberCount: chat.memberIds.length } });
  })
);

router.post(
  "/addChatMember",
  asyncRoute(async (req, res) => {
    const { chatId, userId } = req.body ?? {};
    const chat = await requireBotAdmin(req, res, chatId);
    if (!chat) return;
    const user = await getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (chat.memberIds.includes(userId)) return res.json({ ok: true, alreadyMember: true });
    if (!(await allowsUser(userId, "invites", req.bot.userId))) {
      return res.status(403).json({ error: "User does not allow being added to chats" });
    }
    const updated = await updateChat(chat.id, { memberIds: [...chat.memberIds, userId] });
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    res.json({ ok: true, memberCount: updated.memberIds.length });
  })
);

router.post(
  "/promoteChatMember",
  asyncRoute(async (req, res) => {
    const { chatId, userId, admin = true } = req.body ?? {};
    const chat = await requireBotAdmin(req, res, chatId);
    if (!chat) return;
    if (userId === chat.ownerId) return res.status(400).json({ error: "Cannot change the owner" });
    if (!chat.memberIds.includes(userId)) return res.status(404).json({ error: "User is not a member" });
    const current = new Set(chat.adminIds ?? []);
    admin ? current.add(userId) : current.delete(userId);
    const updated = await updateChat(chat.id, { adminIds: [...current] });
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    res.json({ ok: true, adminIds: updated.adminIds });
  })
);

router.get(
  "/getChatAdmins",
  asyncRoute(async (req, res) => {
    const chat = await botChat(req, res, req.query.chatId);
    if (!chat) return;
    const admins = await Promise.all((chat.adminIds ?? []).map((id) => getUser(id)));
    res.json({ ownerId: chat.ownerId, admins: publicUsers(admins.filter(Boolean)) });
  })
);

router.get(
  "/getChatMemberCount",
  asyncRoute(async (req, res) => {
    const chat = await botChat(req, res, req.query.chatId);
    if (!chat) return;
    res.json({ count: chat.memberIds.length });
  })
);

router.get(
  "/getChatMember",
  asyncRoute(async (req, res) => {
    const chat = await botChat(req, res, req.query.chatId);
    if (!chat) return;
    const user = await getUser(req.query.userId);
    if (!user || !chat.memberIds.includes(user.id)) return res.status(404).json({ error: "User is not a member" });
    res.json({
      user: publicUser(user),
      isAdmin: (chat.adminIds ?? []).includes(user.id),
      isOwner: chat.ownerId === user.id,
      restrictedUntil: chat.restrictions?.[user.id] ?? null,
    });
  })
);

router.post(
  "/setChatPermissions",
  asyncRoute(async (req, res) => {
    const chat = await requireBotAdmin(req, res, req.body?.chatId);
    if (!chat) return;
    const clean = sanitizePermissions(req.body?.permissions);
    if (!clean) return res.status(400).json({ error: "permissions object is required" });
    const updated = await updateChat(chat.id, { permissions: { ...(chat.permissions ?? {}), ...clean } });
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    res.json({ permissions: updated.permissions });
  })
);

router.post(
  "/exportChatInviteLink",
  asyncRoute(async (req, res) => {
    const chat = await requireBotAdmin(req, res, req.body?.chatId);
    if (!chat) return;
    const code = chat.inviteCode && !req.body?.revoke ? chat.inviteCode : crypto.randomBytes(16).toString("base64url").slice(0, 22);
    const updated = chat.inviteCode === code ? chat : await updateChat(chat.id, { inviteCode: code });
    res.json({ code: updated.inviteCode, link: `/join/${updated.inviteCode}` });
  })
);

router.get(
  "/getUserStatus",
  asyncRoute(async (req, res) => {
    const user = await getUser(req.query.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ online: !!user.online, lastSeen: user.lastSeen ?? null });
  })
);

router.get(
  "/getCommonChats",
  asyncRoute(async (req, res) => {
    const user = await getUser(req.query.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const chats = (await listChatsForUser(req.bot.userId)).filter((c) => c.memberIds.includes(user.id));
    res.json({ chats: chats.map((c) => ({ id: c.id, type: c.type, title: c.title })) });
  })
);

router.post(
  "/publishPost",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.body?.chatId);
    if (!chat || chat.type !== "channel") return res.status(404).json({ error: "Channel not found" });
    if (!(chat.adminIds ?? []).includes(req.bot.userId)) {
      return res.status(403).json({ error: "Bot must be an admin of this channel" });
    }
    const { text = "", url } = req.body ?? {};
    if (!text.trim() && !url) return res.status(400).json({ error: "text or url is required" });
    const post = await addMessage({
      id: genId("m"),
      chatId: chat.id,
      senderId: req.bot.userId,
      type: "text",
      text: String(text).slice(0, 4000),
      createdAt: new Date().toISOString(),
      attachments: url ? [{ kind: "image", url }] : undefined,
      readByIds: [req.bot.userId],
      views: 0,
      commentCount: 0,
    });
    broadcastToUsers(chat.memberIds, { type: "message:new", chatId: chat.id, message: post });
    res.json({ message: post });
  })
);

router.get(
  "/getChannelStats",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.query.chatId);
    if (!chat || chat.type !== "channel") return res.status(404).json({ error: "Channel not found" });
    if (!(chat.adminIds ?? []).includes(req.bot.userId)) {
      return res.status(403).json({ error: "Bot must be an admin of this channel" });
    }
    const posts = (await listMessages(chat.id, req.bot.userId)).filter((m) => m.type !== "system");
    res.json({
      subscribers: chat.memberIds.length,
      posts: posts.length,
      views: posts.reduce((s, m) => s + (m.views ?? 0), 0),
      comments: posts.reduce((s, m) => s + (m.commentCount ?? 0), 0),
    });
  })
);

router.get(
  "/getMyStats",
  asyncRoute(async (req, res) => {
    const chats = await listChatsForUser(req.bot.userId);
    const all = await listAllMessages();
    const mine = all.filter((m) => m.senderId === req.bot.userId);
    res.json({
      chats: chats.length,
      messagesSent: mine.length,
      people: new Set(chats.flatMap((c) => c.memberIds).filter((id) => id !== req.bot.userId)).size,
    });
  })
);

const ATTACHMENT_KINDS = {
  sendVideo: { kind: "video", fallback: "🎬 Видео", name: "video" },
  sendVoice: { kind: "voice", fallback: "🎤 Голосовое сообщение", name: "voice" },
  sendVideoNote: { kind: "video-note", fallback: "🎥 Видеосообщение", name: "video-note" },
};

for (const [method, spec] of Object.entries(ATTACHMENT_KINDS)) {
  router.post(
    `/${method}`,
    asyncRoute(async (req, res) => {
      const { chatId, url, caption = "", replyToId, durationSec } = req.body ?? {};
      if (!url) return res.status(400).json({ error: "url is required" });
      try {
        const message = await sendBotMessage(req.bot.userId, chatId, caption || spec.fallback, {
          replyToId,
          attachments: [{ kind: spec.kind, url, name: spec.name, meta: Number.isFinite(durationSec) ? { durationSec } : undefined }],
        });
        res.json({ message });
      } catch (err) {
        res.status(404).json({ error: err.message });
      }
    })
  );
}

router.post(
  "/sendMediaGroup",
  asyncRoute(async (req, res) => {
    const { chatId, items, caption = "", replyToId } = req.body ?? {};
    const list = (Array.isArray(items) ? items : [])
      .filter((i) => i && typeof i.url === "string" && i.url)
      .slice(0, 10)
      .map((i) => ({
        kind: ["image", "video", "file", "voice", "video-note"].includes(i.kind) ? i.kind : "image",
        url: i.url,
        name: String(i.name ?? i.kind ?? "file").slice(0, 120),
      }));
    if (!list.length) return res.status(400).json({ error: "items is required" });
    try {
      const message = await sendBotMessage(req.bot.userId, chatId, caption || "🖼", { replyToId, attachments: list });
      res.json({ message });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  })
);

router.post(
  "/copyMessage",
  asyncRoute(async (req, res) => {
    const { chatId, messageId } = req.body ?? {};
    const source = await getMessage(messageId);
    if (!source) return res.status(404).json({ error: "Message not found" });
    const sourceChat = await getChat(source.chatId);
    if (!sourceChat || !sourceChat.memberIds.includes(req.bot.userId)) {
      return res.status(404).json({ error: "Bot is not a member of that chat" });
    }
    try {
      const message = await sendBotMessage(req.bot.userId, chatId, source.text || "📎", {
        attachments: source.attachments,
      });
      res.json({ message });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  })
);

router.post(
  "/setMyAvatar",
  asyncRoute(async (req, res) => {
    const image = req.body?.image;
    if (typeof image !== "string") return res.status(400).json({ error: "image is required (URL или data:-строка)" });
    await updateUser(req.bot.userId, { avatarImage: image || null });
    res.json({ bot: publicUser(await getUser(req.bot.userId)) });
  })
);

const NEW_DIALOGS_PER_HOUR = 20;
const newDialogLog = new Map();

function newDialogAllowed(botId) {
  const now = Date.now();
  const hourAgo = now - 3600_000;
  const fresh = (newDialogLog.get(botId) ?? []).filter((t) => t > hourAgo);
  if (fresh.length >= NEW_DIALOGS_PER_HOUR) {
    newDialogLog.set(botId, fresh);
    return false;
  }
  fresh.push(now);
  newDialogLog.set(botId, fresh);
  return true;
}

async function botMayWriteFirst(botUserId, targetId) {
  const target = await getUser(targetId);
  if (!target) return { ok: false, error: "Пользователь не найден" };
  if (target.isBot) return { ok: false, error: "Ботам боты не пишут" };
  if (target.blockedUserIds?.includes(botUserId)) return { ok: false, error: "Пользователь заблокировал этого бота" };

  if (!(await allowsUser(targetId, "botMessages", botUserId))) {
    return { ok: false, error: "Пользователь ограничил ботам возможность писать первыми" };
  }
  return { ok: true, target };
}

router.post(
  "/sendMessageToUser",
  asyncRoute(async (req, res) => {
    const { username, userId, text, keyboard } = req.body ?? {};
    if (!text?.trim()) return res.status(400).json({ error: "text is required" });

    const target = userId
      ? await getUser(String(userId))
      : await findUserByUsername(String(username ?? "").replace(/^@/, ""));
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });

    const allowed = await botMayWriteFirst(req.bot.userId, target.id);
    if (!allowed.ok) return res.status(403).json({ error: allowed.error });

    const existing = await findDmBetween(req.bot.userId, target.id);
    if (!existing && !newDialogAllowed(req.bot.id)) {
      return res.status(429).json({ error: `Не больше ${NEW_DIALOGS_PER_HOUR} новых разговоров в час` });
    }

    const chat = existing ?? (await findOrCreateDm(req.bot.userId, target.id));
    const message = await sendBotMessage(req.bot.userId, chat.id, text, { keyboard });
    res.json({ chatId: chat.id, message, user: publicUser(target) });
  })
);

async function botRunsChat(req, res, chatId, expectType) {
  const chat = await getChat(chatId);
  if (!chat || !chat.memberIds.includes(req.bot.userId)) {
    res.status(404).json({ error: "Чат не найден или бот не состоит в нём" });
    return null;
  }
  if (expectType && chat.type !== expectType) {
    res.status(400).json({ error: expectType === "channel" ? "Это не канал" : "Это не группа" });
    return null;
  }
  const staff = (chat.ownerIds ?? []).includes(req.bot.userId) || (chat.adminIds ?? []).includes(req.bot.userId) || chat.ownerId === req.bot.userId;
  if (!staff) {
    res.status(403).json({ error: "Бот не администратор этого чата" });
    return null;
  }
  return chat;
}

router.post(
  "/createChannel",
  asyncRoute(async (req, res) => {
    const { title, description, username, isPublic } = req.body ?? {};
    if (!title?.trim()) return res.status(400).json({ error: "title is required" });

    const now = new Date().toISOString();
    let handle = null;
    if (username) {
      handle = normalizeUsername(username);
      const problem = await checkUsername(handle);
      if (problem) return res.status(problem.status).json({ error: problem.error });
    }
    const chat = await createChat({
      id: genId("c"),
      type: "channel",
      title: String(title).trim().slice(0, 120),
      description: String(description ?? "").trim().slice(0, 300),
      username: handle,
      isPublic: !!isPublic && !!handle,
      avatarColor: "#5b8def",
      memberIds: [req.bot.userId, req.bot.ownerId].filter(Boolean),
      ownerId: req.bot.userId,
      adminIds: [req.bot.userId, req.bot.ownerId].filter(Boolean),
      pinned: false,
      muted: false,
      archived: false,
      createdAt: now,
    });
    broadcastToUsers(chat.memberIds, { type: "chat:created", chat });
    res.json({ chat: { id: chat.id, title: chat.title, username: chat.username, isPublic: !!chat.isPublic } });
  })
);

router.post(
  "/setChatDiscussion",
  asyncRoute(async (req, res) => {
    const channel = await botRunsChat(req, res, req.body?.channelId, "channel");
    if (!channel) return;
    const action = req.body?.action ?? "create";

    if (action === "unlink") {
      const updated = await updateChat(channel.id, { linkedDiscussionChatId: null });
      broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
      return res.json({ chat: updated, discussion: null });
    }

    if (action === "link") {
      const group = await botRunsChat(req, res, req.body?.groupId, "group");
      if (!group) return;
      const taken = (await listChatsForUser(req.bot.userId)).find(
        (c) => c.id !== channel.id && c.linkedDiscussionChatId === group.id
      );
      if (taken) return res.status(409).json({ error: `Эта группа уже обсуждение канала «${taken.title}»` });

      const updated = await updateChat(channel.id, { linkedDiscussionChatId: group.id });
      broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
      return res.json({ chat: updated, discussion: { id: group.id, title: group.title } });
    }

    if (action === "create") {
      const discussion = await createChat({
        id: `c_${Date.now()}_d`,
        type: "group",
        title: String(req.body?.title ?? `${channel.title} · Обсуждение`).trim().slice(0, 120),
        avatarColor: "#5C6473",
        memberIds: [req.bot.userId, req.bot.ownerId].filter(Boolean),
        ownerId: req.bot.userId,
        adminIds: [req.bot.userId, req.bot.ownerId].filter(Boolean),
        pinned: false,
        muted: false,
        archived: false,
        createdAt: new Date().toISOString(),
      });
      const updated = await updateChat(channel.id, { linkedDiscussionChatId: discussion.id });
      broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
      return res.json({ chat: updated, discussion: { id: discussion.id, title: discussion.title } });
    }

    res.status(400).json({ error: "action: create | link | unlink" });
  })
);

router.get(
  "/getChatDiscussion",
  asyncRoute(async (req, res) => {
    const channel = await botRunsChat(req, res, req.query.channelId, "channel");
    if (!channel) return;
    const linked = channel.linkedDiscussionChatId ? await getChat(channel.linkedDiscussionChatId) : null;
    res.json({
      channel: { id: channel.id, title: channel.title },
      discussion: linked ? { id: linked.id, title: linked.title, memberCount: linked.memberIds.length } : null,
    });
  })
);

module.exports = router;
