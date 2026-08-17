const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireBotToken } = require("../middleware/botAuth");
const { getUser, findUserByUsername, updateUser } = require("../data/users");
const { listChatsForUser, getChat, updateChat, findChatByUsername, createChat } = require("../data/chats");
const { listAllMessages, listNewForChats, listMessages, getMessage, editMessage, deleteMessage, togglePin, addMessage, listMessagesPage, toggleReaction, setKeyboard } = require("../data/messages");
const { addScheduled, listScheduledFor, getScheduled, deleteScheduled } = require("../data/scheduledMessages");
const { sanitizePermissions } = require("../lib/chatPermissions");
const crypto = require("crypto");
const { publicUser, publicUsers } = require("../data/sanitize");
const { broadcastToUsers } = require("../ws");
const { markTyping } = require("../data/typing");
const { updateBotApp, updateBotCommands, updateBotDescription, getBotToken } = require("../data/bots");
const { sendBotMessage } = require("../lib/botMessaging");
const { validateAppUrl, verifyInitData } = require("../lib/miniApp");

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
    // app — назначенное мини-приложение (setWebApp ниже), чтобы выкладка новой
    // версии могла проверить, на какой адрес бот сейчас показывает.
    res.json({ bot: publicUser(user), app: req.bot.appUrl ? { url: req.bot.appUrl, name: req.bot.appName } : null });
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

    const messages = listNewForChats([...myChatIds], {
      after,
      excludeSenderId: req.bot.userId,
      limit: 200,
    });

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

// ── Мини-приложение ─────────────────────────────────────────────────────────
// Веб-страница бота, которая открывается внутри Shalter. Здесь два метода:
// назначить её адрес и проверить подпись того, кто её открыл. Всё остальное
// происходит в браузере пользователя — см. lib/miniApp.js и /bots#apps.

router.post(
  "/setWebApp",
  asyncRoute(async (req, res) => {
    const checked = validateAppUrl(req.body?.url ?? "");
    if (checked.error) return res.status(400).json({ error: checked.error });
    const name = String(req.body?.name ?? "").trim().slice(0, 40);
    const bot = await updateBotApp(req.bot.id, { appUrl: checked.url, appName: name });
    res.json({ app: bot.appUrl ? { url: bot.appUrl, name: bot.appName } : null });
  })
);

// Проверка initData на стороне сервера — для тех, кто не хочет писать HMAC
// сам. Считается ровно то же самое, что бот посчитал бы у себя (алгоритм
// описан на /bots#apps): метод удобство, а не единственный способ, и работать
// без него можно полностью.
router.post(
  "/checkWebAppData",
  asyncRoute(async (req, res) => {
    const token = getBotToken(req.bot.id);
    const result = verifyInitData(token, req.body?.initData ?? "");
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    // Данные в подписи — снимок на момент открытия. Имя могли сменить минуту
    // спустя, поэтому актуальную карточку отдаём из базы, а не из initData.
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

// ── Третья партия: медиа, чаты, участники, расписание ───────────────────────
//
// Всё ниже — обёртки над тем, что приложение уже умеет. Ни одного метода,
// который делает вид: если возможности нет в приложении, её нет и в API.

// Общая проверка «бот в этом чате» — повторялась в каждом методе.
async function botChat(req, res, chatId) {
  const chat = await getChat(chatId);
  if (!chat || !chat.memberIds.includes(req.bot.userId)) {
    res.status(404).json({ error: "Bot is not a member of this chat" });
    return null;
  }
  return chat;
}

// Отправка вложения одного вида — тело у всех методов одинаковое, отличается
// только `kind`, поэтому делается одной функцией, а не пятью копиями.
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
    const message = await setKeyboard(messageId, Array.isArray(keyboard) ? keyboard : []);
    broadcastToUsers(found.chat.memberIds, { type: "message:updated", chatId: found.chat.id, message });
    res.json({ message });
  })
);

// ── Отложенная отправка ─────────────────────────────────────────────────────
// Приложение умеет ставить сообщения в очередь; боту это нужно ровно затем же —
// разослать объявление в назначенный час, а не будить программу ночью.
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

// ── Чаты и участники ────────────────────────────────────────────────────────
router.post(
  "/createGroup",
  asyncRoute(async (req, res) => {
    const { title, memberIds } = req.body ?? {};
    if (!title?.trim()) return res.status(400).json({ error: "title is required" });
    // Приглашать бот может только тех, с кем уже состоит в общем чате: иначе
    // токен превращается в право затащить любого человека в любую группу.
    const known = new Set();
    for (const c of await listChatsForUser(req.bot.userId)) for (const id of c.memberIds) known.add(id);
    const invited = (Array.isArray(memberIds) ? memberIds : []).filter((id) => known.has(id));
    const now = new Date().toISOString();
    const chat = await createChat({
      id: `c_${Date.now()}`,
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
    // Владельца не разжаловать — он не «просто ещё один администратор».
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

// ── Люди ────────────────────────────────────────────────────────────────────
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

// ── Каналы ──────────────────────────────────────────────────────────────────
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
      id: `m_${Date.now()}`,
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

// ── О себе ──────────────────────────────────────────────────────────────────
router.get(
  "/getMyStats",
  asyncRoute(async (req, res) => {
    const chats = await listChatsForUser(req.bot.userId);
    const all = await listAllMessages();
    const mine = all.filter((m) => m.senderId === req.bot.userId);
    res.json({
      chats: chats.length,
      messagesSent: mine.length,
      // С кем бот вообще общался — уникальные собеседники во всех его чатах.
      people: new Set(chats.flatMap((c) => c.memberIds).filter((id) => id !== req.bot.userId)).size,
    });
  })
);

module.exports = router;
