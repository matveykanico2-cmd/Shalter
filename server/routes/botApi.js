const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireBotToken } = require("../middleware/botAuth");
const { getUser, findUserByUsername, updateUser } = require("../data/users");
const { listChatsForUser, getChat, updateChat, findChatByUsername } = require("../data/chats");
const { listAllMessages, getMessage, editMessage, deleteMessage, togglePin, addMessage, listMessagesPage, toggleReaction } = require("../data/messages");
const { publicUser, publicUsers } = require("../data/sanitize");
const { broadcastToUsers } = require("../ws");
const { markTyping } = require("../data/typing");
const { updateBotCommands, updateBotDescription } = require("../data/bots");
const { sendBotMessage } = require("../lib/botMessaging");

// The actual "program it however you want" surface — documented on /bots
// (public/bots.html). A bot's
// owner runs their own script anywhere (no public URL/webhook needed) that
// polls GET /updates and replies with POST /sendMessage, authenticated by
// the bot's token rather than a browser session.
const router = express.Router();
router.use(requireBotToken);

router.get(
  "/me",
  asyncRoute(async (req, res) => {
    const user = await getUser(req.bot.userId);
    res.json({ bot: publicUser(user) });
  })
);

// Polling, not a webhook push — deliberately, so a bot can run from behind
// NAT/a laptop/anywhere with outbound internet, exactly like a normal
// script. `after` is an ISO timestamp; the response's messages are already
// sorted ascending by createdAt, so `messages.at(-1).createdAt` is the next
// `after` to pass. Capped at 200 per call so one poll can't return the
// entire history for a very chatty bot.
router.get(
  "/updates",
  asyncRoute(async (req, res) => {
    const after = req.query.after || "1970-01-01T00:00:00.000Z";
    const myChats = await listChatsForUser(req.bot.userId);
    const myChatIds = new Set(myChats.map((c) => c.id));

    const messages = (await listAllMessages())
      .filter((m) => myChatIds.has(m.chatId) && m.senderId !== req.bot.userId && m.createdAt > after)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, 200);

    res.json({ messages });
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

// ── Дальше — то, без чего бот упирается в потолок на второй день ────────────
//
// Раньше здесь было три метода: «кто я», «что нового» и «отправить текст».
// Этого хватает на эхо-бота и заканчивается ровно там, где начинается
// настоящий: отредактировать своё сообщение вместо новой копии, убрать
// устаревшее, закрепить важное, показать «печатает…», ответить картинкой,
// узнать, кто перед ним.
//
// Каждый метод ниже — тонкая обёртка над тем, что уже умеет приложение, а не
// вторая реализация того же самого: правит одна и та же editMessage, шлёт одна
// и та же sendBotMessage. Поэтому бот и человек делают ровно одно и то же, а
// не «почти одно и то же».

// Общая проверка: бот вправе трогать только свои сообщения и только в чатах,
// где он состоит. Возвращает { error, status } либо { chat, message }.
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

// Закреплять можно и чужое сообщение — но только там, где бот администратор:
// закреп виден всем в чате, это действие модератора, а не отправителя.
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

// «Печатает…» — то, что отличает бота, который думает над ответом, от бота,
// который завис. Живёт пять секунд, как и у людей: повторяйте перед каждым
// длинным шагом, а не один раз в начале.
router.post(
  "/sendChatAction",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.body?.chatId);
    if (!chat || !chat.memberIds.includes(req.bot.userId)) return res.status(404).json({ error: "Bot is not a member of this chat" });
    markTyping(chat.id, req.bot.userId);
    broadcastToUsers(chat.memberIds, { type: "typing:update", chatId: chat.id, userId: req.bot.userId });
    res.json({ ok: true });
  })
);

// Картинка, файл, голосовое — всё это вложения, они уже есть у обычных
// сообщений. Бот присылает готовый URL (или data:), а не загружает файл на
// сервер: у него уже есть где хранить свои картинки, а нам не нужен второй
// путь загрузки со своими лимитами и чисткой.
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

// Куда бот вообще может писать. Без этого метода единственный способ узнать
// свой чат — дождаться, пока в него кто-нибудь напишет.
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

// Кто написал. Бот получает senderId в каждом сообщении, а имя и юзернейм —
// отсюда: подставить «Спасибо, Аня» вместо «Спасибо, u_1786…».
router.get(
  "/getUser",
  asyncRoute(async (req, res) => {
    const user = await getUser(req.query.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user: publicUser(user) });
  })
);

// Список команд для кнопки «/» в чате. Тот же, что задаётся в приложении, —
// просто теперь его можно менять из программы, вместе с выкладкой новой версии.
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
    // Формат BotFather: { command, description }. Мусор молча отбрасывается,
    // а не роняет запрос — иначе одна опечатка стирает весь список.
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

// ── Найти человека, прочитать историю, навести порядок ──────────────────────
//
// До этого бот умел отвечать тому, кто ему написал, и не умел ничего сверх.
// Здесь появляется остальное, ради чего боты и заводятся: найти человека по
// @юзернейму, прочитать историю чата, отреагировать, а в группе, где бот
// администратор, — убрать чужое сообщение, ограничить нарушителя или выгнать
// его.
//
// Чего здесь намеренно нет: поиска по номеру телефона. Бот с таким методом —
// это готовая телефонная книга: перебором номеров он выдал бы, у кого есть
// аккаунт и как его зовут. @юзернейм — другое дело: он публичен по своей сути,
// человек сам решил его завести и показывать.

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

// История чата — постранично, свежие в конце. Бот читает только те чаты, где
// состоит: это то же правило, что и у всего остального здесь.
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

// ── Действия администратора ─────────────────────────────────────────────────
// Всё ниже требует, чтобы бот был администратором чата. Это ровно та же
// проверка, что и для человека: права даёт владелец чата, а не токен.
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

// Удалить чужое сообщение — то, ради чего заводят бота-модератора. Своё
// сообщение бот удаляет методом deleteMessage выше и без прав администратора.
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
    // Владельца и других администраторов бот не трогает — иначе одним
    // утёкшим токеном можно обезглавить чат.
    if (userId === chat.ownerId || (chat.adminIds ?? []).includes(userId)) {
      return res.status(400).json({ error: "Cannot remove the owner or an admin" });
    }
    if (!chat.memberIds.includes(userId)) return res.status(404).json({ error: "User is not a member" });
    const updated = await updateChat(chat.id, { memberIds: chat.memberIds.filter((id) => id !== userId) });
    broadcastToUsers([...chat.memberIds], { type: "chat:updated", chat: updated });
    res.json({ ok: true, memberCount: updated.memberIds.length });
  })
);

// Ограничение — временное молчание, а не изгнание: человек остаётся в чате и
// видит переписку. Срок в минутах, потому что «до какого числа» бот считать не
// обязан.
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

// Уйти из чата. Единственное административное действие, которое боту не нужно
// согласовывать: остаться там, откуда его хотят убрать, он и не должен.
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

// Имя и описание самого бота — чтобы выкладка новой версии могла заодно
// поправить, как бот представляется.
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

module.exports = router;
