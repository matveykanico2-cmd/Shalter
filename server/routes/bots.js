const express = require("express");
const { genId } = require("../lib/genId");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { countBotAudience, listBotDmChatIds, getBotByUserId, getBotToken, listBotsByOwner, getBot, createBot, regenerateToken, deleteBot, updateBotApp, updateBotAppCode, updateBotCode, updateBotCommands, updateBotDescription } = require("../data/bots");
const { createUser, getUser, updateUser, deleteUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { checkUsername, normalizeUsername, generateBotUsername } = require("../lib/username");
const { runBotCode } = require("../lib/botSandbox");
const botLogs = require("../data/botLogs");
const { listChats, createChat, getChat, findDmBetween } = require("../data/chats");
const { buildInitData, buildAppUrl, validateAppUrl, sameApp } = require("../lib/miniApp");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { sendBotMessage } = require("../lib/botMessaging");
const { sendPushToUser, pushAvatar, MESSAGE_PUSH } = require("../push");
const { getSettings, isQuietNow } = require("../data/settings");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const bots = await listBotsByOwner(req.uid);
    const withUsers = await Promise.all(
      bots.map(async (b) => ({ ...b, user: publicUser(await getUser(b.userId)) }))
    );
    res.json({ bots: withUsers });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { name, avatarImage, description } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: "Введите имя бота" });

    const botUsername = await generateBotUsername(name);
    if (!botUsername) return res.status(409).json({ error: "Не удалось подобрать свободный юзернейм для бота — измените имя" });

    const userId = genId("bot");
    await createUser({
      id: userId,
      name: name.trim(),
      username: botUsername,
      avatarColor: "#6E56C6",
      avatarImage: avatarImage || undefined,
      bio: (description ?? "").trim(),
      isBot: true,
      online: true,
      lastSeen: new Date().toISOString(),
    });
    const { bot, token } = await createBot({ userId, ownerId: req.uid, description: (description ?? "").trim() });
    res.json({ bot: { ...bot, user: publicUser(await getUser(userId)) }, token });
  })
);

async function requireOwnedBot(req, res) {
  const bot = await getBot(req.params.id);
  if (!bot || bot.ownerId !== req.uid) {
    res.status(404).json({ error: "not found" });
    return null;
  }
  return bot;
}

router.get(
  "/:id/token",
  asyncRoute(async (req, res) => {
    const bot = await requireOwnedBot(req, res);
    if (!bot) return;
    const token = getBotToken(bot.id);
    if (!token) return res.status(404).json({ error: "Токен не найден" });
    res.json({ token });
  })
);

router.post(
  "/:id/regenerate-token",
  asyncRoute(async (req, res) => {
    const bot = await requireOwnedBot(req, res);
    if (!bot) return;
    const token = await regenerateToken(bot.id);
    res.json({ token });
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const bot = await requireOwnedBot(req, res);
    if (!bot) return;
    await deleteBot(bot.id);
    // Аккаунт бота тоже убираем — как при удалении аккаунта владельца (lib/deleteAccount.js).
    await deleteUser(bot.userId);
    res.json({ ok: true });
  })
);

const BROADCAST_MAX_TEXT = 4096;
const BROADCAST_COOLDOWN_MS = 60 * 1000;
const lastBroadcastAt = new Map();

// Рассылка: the owner sends one message to every user who has started the bot.
router.post(
  "/:id/broadcast",
  asyncRoute(async (req, res) => {
    const bot = await requireOwnedBot(req, res);
    if (!bot) return;
    const text = String(req.body?.text ?? "").trim();
    if (!text) return res.status(400).json({ error: "Введите текст рассылки" });
    if (text.length > BROADCAST_MAX_TEXT) return res.status(400).json({ error: `Не длиннее ${BROADCAST_MAX_TEXT} символов` });
    const since = Date.now() - (lastBroadcastAt.get(bot.id) ?? 0);
    if (since < BROADCAST_COOLDOWN_MS) {
      return res.status(429).json({ error: `Следующую рассылку можно отправить через ${Math.ceil((BROADCAST_COOLDOWN_MS - since) / 1000)} с` });
    }
    // Expired entries are useless, so prune them here to keep the map from growing forever.
    for (const [id, at] of lastBroadcastAt) if (Date.now() - at >= BROADCAST_COOLDOWN_MS) lastBroadcastAt.delete(id);
    lastBroadcastAt.set(bot.id, Date.now());

    const botUser = await getUser(bot.userId);
    let sent = 0;
    for (const chatId of listBotDmChatIds(bot.userId)) {
      try {
        const chat = await getChat(chatId);
        const recipientId = chat?.memberIds.find((id) => id !== bot.userId);
        const recipient = recipientId ? await getUser(recipientId) : null;
        if (!recipient || recipient.isBot || recipient.blockedUserIds?.includes(bot.userId)) continue;
        await sendBotMessage(bot.userId, chatId, text);
        sent += 1;
        const settings = await getSettings(recipientId);
        if (isQuietNow(settings, chatId)) continue;
        const body = settings.notifications?.previewText === false ? "Новое сообщение" : text.slice(0, 200);
        sendPushToUser(
          recipientId,
          { title: botUser?.name || "Бот", body, ...pushAvatar(botUser), url: `/chat/${chatId}`, kind: "message", tag: `chat-${chatId}` },
          MESSAGE_PUSH
        ).catch(() => {});
      } catch (err) {
        console.error("bot broadcast failed for", chatId, err.message);
      }
    }
    // Nothing went out — don't make the owner wait a minute to retry.
    if (!sent) lastBroadcastAt.delete(bot.id);
    res.json({ ok: true, sent });
  })
);

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const bot = await requireOwnedBot(req, res);
    if (!bot) return;

    const patch = {};
    if (typeof req.body?.name === "string" && req.body.name.trim()) patch.name = req.body.name.trim().slice(0, 60);
    if (typeof req.body?.avatarImage === "string") patch.avatarImage = req.body.avatarImage || null;

    if (typeof req.body?.username === "string" && req.body.username.trim()) {
      const username = normalizeUsername(req.body.username);
      if (!/_bot$/i.test(username)) return res.status(400).json({ error: "Юзернейм бота должен заканчиваться на _bot" });
      const problem = await checkUsername(username, { forUserId: bot.userId });
      if (problem) return res.status(problem.status).json({ error: problem.error });
      patch.username = username;
    }

    if (Object.keys(patch).length) await updateUser(bot.userId, patch);

    const appName = String(req.body?.appName ?? "").trim().slice(0, 40);
    if (typeof req.body?.appCode === "string" && req.body.appCode.trim()) {
      if (req.body.appCode.length > 200_000) return res.status(400).json({ error: "Страница длиннее 200 000 символов" });
      const botUser = await getUser(bot.userId);
      if (!botUser?.username) return res.status(409).json({ error: "У бота нет юзернейма — по нему строится адрес приложения" });
      await updateBotAppCode(bot.id, { appCode: req.body.appCode, appName });
    } else if (typeof req.body?.appUrl === "string") {
      const checked = validateAppUrl(req.body.appUrl);
      if (checked.error) return res.status(400).json({ error: checked.error });
      await updateBotApp(bot.id, { appUrl: checked.url, appName });
    }

    const description = typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 300) : null;
    const updated = description === null ? await getBot(bot.id) : await updateBotDescription(bot.id, description);
    res.json({ bot: { ...updated, user: publicUser(await getUser(bot.userId)) } });
  })
);

const APP_DATA_LIMIT = 4096;

async function requireBotWithApp(req, res) {
  const bot = await getBot(req.params.id);
  if (!bot) {
    res.status(404).json({ error: "Бот не найден" });
    return null;
  }
  if (!bot.appUrl && !bot.appCode) {
    res.status(404).json({ error: "У этого бота нет приложения" });
    return null;
  }
  return bot;
}

router.post(
  "/:id/app/open",
  asyncRoute(async (req, res) => {
    const bot = await requireBotWithApp(req, res);
    if (!bot) return;

    const botUser = await getUser(bot.userId);
    const baseUrl = bot.appCode ? `${req.protocol}://${req.get("host")}/app/${botUser?.username ?? ""}` : bot.appUrl;

    const requested = typeof req.body?.url === "string" && req.body.url.trim() ? req.body.url.trim() : null;
    if (requested && !sameApp(baseUrl, requested)) {
      return res.status(403).json({ error: "Кнопка ведёт за пределы приложения бота" });
    }

    const token = getBotToken(bot.id);
    if (!token) return res.status(409).json({ error: "У бота нет токена — приложение нечем подписать" });

    const chat = req.body?.chatId ? await getChat(req.body.chatId) : null;
    const sharedChat = chat && chat.memberIds.includes(req.uid) && chat.memberIds.includes(bot.userId) ? chat : null;

    const user = await getUser(req.uid);
    const initData = buildInitData({ token, user, chat: sharedChat, botUserId: bot.userId });
    const theme = req.body?.theme === "dark" ? "dark" : "light";

    res.json({
      url: buildAppUrl(requested || baseUrl, initData, { theme }),
      name: bot.appName || botUser?.name || "Приложение",
      botId: bot.userId,
    });
  })
);

router.post(
  "/:id/app/data",
  asyncRoute(async (req, res) => {
    const bot = await requireBotWithApp(req, res);
    if (!bot) return;

    const data = String(req.body?.data ?? "").trim();
    if (!data) return res.status(400).json({ error: "Пустые данные" });
    if (data.length > APP_DATA_LIMIT) return res.status(400).json({ error: `Не длиннее ${APP_DATA_LIMIT} символов` });

    const chat = await findOrCreateDm(req.uid, bot.userId);
    const message = await sendMessageAndBroadcast(chat, req.uid, data, { readByIds: [] });

    if (bot.code?.trim()) {
      runBotCode(bot, bot.code, { id: message.id, chatId: chat.id, senderId: req.uid, text: message.text, createdAt: message.createdAt }).catch((err) =>
        console.error(`bot sandbox dispatch failed for ${bot.userId}:`, err)
      );
    }

    res.json({ ok: true, chatId: chat.id, message });
  })
);

router.put(
  "/:id/commands",
  asyncRoute(async (req, res) => {
    const bot = await requireOwnedBot(req, res);
    if (!bot) return;

    const raw = Array.isArray(req.body?.commands) ? req.body.commands : [];
    const commands = raw
      .map((c) => ({
        command: String(c?.command ?? "").trim().replace(/^\//, "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32),
        description: String(c?.description ?? "").trim().slice(0, 120),
      }))
      .filter((c) => c.command)
      .slice(0, 100);

    const updated = await updateBotCommands(bot.id, commands);
    res.json({ bot: updated });
  })
);

router.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const bot = await requireOwnedBot(req, res);
    if (!bot) return;
    res.json({ bot: { ...bot, user: publicUser(await getUser(bot.userId)) } });
  })
);

router.put(
  "/:id/code",
  asyncRoute(async (req, res) => {
    const bot = await requireOwnedBot(req, res);
    if (!bot) return;
    const updated = await updateBotCode(bot.id, (req.body?.code ?? "").slice(0, 50_000));
    res.json({ bot: updated });
  })
);

router.post(
  "/:id/test",
  asyncRoute(async (req, res) => {
    const bot = await requireOwnedBot(req, res);
    if (!bot) return;

    let chat = await findDmBetween(req.uid, bot.userId);
    if (!chat) {
      chat = await createChat({
        id: genId("c"),
        type: "dm",
        memberIds: [req.uid, bot.userId],
        pinned: false,
        muted: false,
        archived: false,
        createdAt: new Date().toISOString(),
      });
    }

    const code = req.body?.code ?? bot.code ?? "";
    const testMessage = {
      id: genId("test"),
      chatId: chat.id,
      senderId: req.uid,
      text: req.body?.text ?? "/start",
      createdAt: new Date().toISOString(),
    };
    const outcome = await runBotCode(bot, code, testMessage);
    res.json(outcome);
  })
);

router.get(
  "/:id/logs",
  asyncRoute(async (req, res) => {
    const bot = await requireOwnedBot(req, res);
    if (!bot) return;
    res.json({ logs: botLogs.getLogs(bot.id) });
  })
);

router.get(
  "/audience/:userId",
  asyncRoute(async (req, res) => {
    const bot = await getBotByUserId(req.params.userId);
    if (!bot) return res.status(404).json({ error: "Это не бот" });
    res.json({
      users: countBotAudience(req.params.userId),
      app: bot.appUrl || bot.appCode ? { name: bot.appName || "Приложение" } : null,
    });
  })
);

module.exports = router;
