const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireBotToken } = require("../middleware/botAuth");
const { getUser } = require("../data/users");
const { listChatsForUser, getChat } = require("../data/chats");
const { listAllMessages, getMessage, editMessage, deleteMessage, togglePin } = require("../data/messages");
const { publicUser, publicUsers } = require("../data/sanitize");
const { broadcastToUsers } = require("../ws");
const { markTyping } = require("../data/typing");
const { updateBotCommands } = require("../data/bots");
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

module.exports = router;
