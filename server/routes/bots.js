const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { countBotAudience, getBotByUserId, getBotToken, listBotsByOwner, getBot, createBot, regenerateToken, deleteBot, updateBotApp, updateBotAppCode, updateBotCode, updateBotCommands, updateBotDescription } = require("../data/bots");
const { createUser, getUser, updateUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { checkUsername, normalizeUsername, generateBotUsername } = require("../lib/username");
const { runBotCode } = require("../lib/botSandbox");
const botLogs = require("../data/botLogs");
const { listChats, createChat, getChat, findDmBetween } = require("../data/chats");
const { buildInitData, buildAppUrl, validateAppUrl, sameApp } = require("../lib/miniApp");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");

const router = express.Router();
router.use(requireUserId);

// "My bots" — management list (create/regenerate/delete), not a public bot
// directory. Token is deliberately never included here (only ever returned
// once, at creation, and again via /regenerate-token) — see public/bots.html.
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

// Creates the bot's own `users` row (isBot: true — same shape as a real
// account, so it shows up in chats/search/avatars for free) plus the bots
// row that actually makes it programmable. The token in the response is
// shown to the owner exactly once.
router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { name, avatarImage, description } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: "Введите имя бота" });

    // Derived, validated and de-duplicated in lib/username.js — see
    // generateBotUsername for what the inline version here used to get wrong.
    const botUsername = await generateBotUsername(name);
    if (!botUsername) return res.status(409).json({ error: "Не удалось подобрать свободный юзернейм для бота — измените имя" });

    const userId = `bot_${Date.now()}`;
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

// Показать токен ещё раз. Раньше его можно было только перевыпустить — а это
// ломает уже работающего бота: старый токен перестаёт действовать, и программа
// на чьём-то сервере молча перестаёт отвечать. Владелец, потерявший строку,
// не должен платить за это простоем.
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
    res.json({ ok: true });
  })
);

// Renaming a bot, changing its picture or its description.
//
// The counterpart that was missing: a bot could be created and deleted, its
// token rotated and its code edited, but its name and avatar were fixed at
// creation. Getting either wrong meant deleting the bot — losing its @handle,
// its token and every chat it was in — and starting again.
router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const bot = await requireOwnedBot(req, res);
    if (!bot) return;

    const patch = {};
    if (typeof req.body?.name === "string" && req.body.name.trim()) patch.name = req.body.name.trim().slice(0, 60);
    if (typeof req.body?.avatarImage === "string") patch.avatarImage = req.body.avatarImage || null;

    // The @handle too — the last thing about a bot that was fixed at creation.
    // Same namespace check every other claim goes through, and the same "_bot"
    // convention the generated ones follow, so a bot can't take a handle that
    // reads like a person's.
    if (typeof req.body?.username === "string" && req.body.username.trim()) {
      const username = normalizeUsername(req.body.username);
      if (!/_bot$/i.test(username)) return res.status(400).json({ error: "Юзернейм бота должен заканчиваться на _bot" });
      const problem = await checkUsername(username, { forUserId: bot.userId });
      if (problem) return res.status(problem.status).json({ error: problem.error });
      patch.username = username;
    }

    if (Object.keys(patch).length) await updateUser(bot.userId, patch);

    // Мини-приложение (lib/miniApp.js). Адрес проверяется здесь, при
    // сохранении: криво введённый должен ругаться владельцу сразу, а не
    // открываться пустым окном у каждого, кто нажмёт кнопку.
    const appName = String(req.body?.appName ?? "").trim().slice(0, 40);
    // Приложение задаётся одним из двух способов, и они взаимоисключающие:
    // либо страница лежит на своём сервере (appUrl), либо её код хранит Shalter
    // (appCode → routes/miniAppHost.js). Что прислали, то и становится текущим.
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

// ── Мини-приложения ─────────────────────────────────────────────────────────
// Открыть приложение бота может любой, кто на него наткнулся, — это две
// следующие ручки, и владения ботом они не требуют (в отличие от всего выше).

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

// Выдаёт адрес, который встроенное окно откроет в iframe. Подпись ставится
// здесь, на сервере, а не в браузере: ключ выводится из токена бота, и
// показывать его клиенту нельзя — им отправляют сообщения от имени бота.
router.post(
  "/:id/app/open",
  asyncRoute(async (req, res) => {
    const bot = await requireBotWithApp(req, res);
    if (!bot) return;

    // Кнопка бота вправе открыть страницу внутри его же приложения, но не
    // чужой сайт: иначе к любому адресу в интернете уезжала бы подписанная
    // карточка нажавшего.
    // Приложение, размещённое здесь (setWebAppCode), живёт по адресу
    // /app/<юзернейм> — его и подписываем; внешнее берётся как есть.
    const botUser = await getUser(bot.userId);
    const baseUrl = bot.appCode ? `${req.protocol}://${req.get("host")}/app/${botUser?.username ?? ""}` : bot.appUrl;

    const requested = typeof req.body?.url === "string" && req.body.url.trim() ? req.body.url.trim() : null;
    if (requested && !sameApp(baseUrl, requested)) {
      return res.status(403).json({ error: "Кнопка ведёт за пределы приложения бота" });
    }

    const token = getBotToken(bot.id);
    if (!token) return res.status(409).json({ error: "У бота нет токена — приложение нечем подписать" });

    // chat_id попадает в подпись, только если чат действительно общий: иначе
    // приложение получило бы «пользователь X пишет из чата Y» про чат, к
    // которому ни он, ни бот отношения не имеют.
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

// Приложение отправляет данные обратно боту (Shalter.WebApp.sendData).
//
// Отличие от Telegram, и оно намеренное: там такое сообщение боту видит только
// бот, у человека в переписке не появляется ничего. Здесь это обычное
// сообщение от самого человека — видимое ему же. Приложение действует от его
// имени, и то, что оно отправило, должно остаться у него перед глазами, а не
// уйти в невидимый канал.
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

    // Тот же запуск кода бота, что и у обычного сообщения (routes/messages.js):
    // для бота это и есть обычное сообщение, и отвечать на него он должен так
    // же. Без ожидания — медленный бот не должен задерживать ответ приложению.
    if (bot.code?.trim()) {
      runBotCode(bot, bot.code, { id: message.id, chatId: chat.id, senderId: req.uid, text: message.text, createdAt: message.createdAt }).catch((err) =>
        console.error(`bot sandbox dispatch failed for ${bot.userId}:`, err)
      );
    }

    res.json({ ok: true, chatId: chat.id, message });
  })
);

// The command list a bot advertises — what the composer's "/" menu offers.
//
// The column has existed since bots did, and nothing could write to it: no
// route here, nothing in the Bot API. So every bot's list was empty and the
// feature was invisible. Same format BotFather uses ("command - description"
// per line), because that's what anyone who has set up a Telegram bot will type.
router.put(
  "/:id/commands",
  asyncRoute(async (req, res) => {
    const bot = await requireOwnedBot(req, res);
    if (!bot) return;

    const raw = Array.isArray(req.body?.commands) ? req.body.commands : [];
    const commands = raw
      .map((c) => ({
        // Telegram's own rule: lowercase letters, digits and underscores.
        command: String(c?.command ?? "").trim().replace(/^\//, "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32),
        description: String(c?.description ?? "").trim().slice(0, 120),
      }))
      .filter((c) => c.command)
      .slice(0, 100);

    const updated = await updateBotCommands(bot.id, commands);
    res.json({ bot: updated });
  })
);

// Saves the in-app "handleMessage" program (Settings → Боты → Код) — an
// alternative to running an external script against the Bot API. See
// server/lib/botSandbox.js for what actually executes it.
router.put(
  "/:id/code",
  asyncRoute(async (req, res) => {
    const bot = await requireOwnedBot(req, res);
    if (!bot) return;
    const updated = await updateBotCode(bot.id, (req.body?.code ?? "").slice(0, 50_000));
    res.json({ bot: updated });
  })
);

// "Run" button in the editor — executes the given (possibly unsaved-yet)
// code against a synthetic message, so the owner can see what it does
// without needing a second device to actually message the bot. Uses the
// owner's real DM chat with the bot (creating it on demand) rather than a
// fake chat id, so that bot.send()/sendTo() calls in the tested code
// actually succeed and post a real, visible reply — otherwise every test of
// a bot that replies would fail with "Bot is not a member of this chat"
// before the owner ever gets to see whether their logic works.
router.post(
  "/:id/test",
  asyncRoute(async (req, res) => {
    const bot = await requireOwnedBot(req, res);
    if (!bot) return;

    let chat = await findDmBetween(req.uid, bot.userId);
    if (!chat) {
      chat = await createChat({
        id: `c_${Date.now()}`,
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
      id: `test_${Date.now()}`,
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

// Сколько людей пользуется ботом. Показывается в шапке чата с ботом вместо
// «в сети»: у программы нет присутствия — она не «заходила» и не «была
// недавно», — а число собеседников как раз говорит о боте что-то настоящее.
//
// Считается по join-таблице участников, а не перебором чатов в памяти: у
// популярного бота их тысячи.
router.get(
  "/audience/:userId",
  asyncRoute(async (req, res) => {
    const bot = await getBotByUserId(req.params.userId);
    if (!bot) return res.status(404).json({ error: "Это не бот" });
    res.json({
      users: countBotAudience(req.params.userId),
      // Есть ли у бота мини-приложение — здесь, а не отдельным запросом:
      // шапка чата с ботом всё равно спрашивает про аудиторию при открытии, и
      // кнопке «Открыть приложение» больше ничего не нужно, кроме надписи.
      app: bot.appUrl || bot.appCode ? { name: bot.appName || "Приложение" } : null,
    });
  })
);

module.exports = router;
