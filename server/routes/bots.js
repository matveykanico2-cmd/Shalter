const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listBotsByOwner, getBot, createBot, regenerateToken, deleteBot, updateBotCode } = require("../data/bots");
const { createUser, getUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { runBotCode } = require("../lib/botSandbox");
const botLogs = require("../data/botLogs");
const { listChats, createChat } = require("../data/chats");
const { askAI } = require("../lib/ai");

const router = express.Router();
router.use(requireUserId);

// "My bots" — management list (create/regenerate/delete), not a public bot
// directory. Token is deliberately never included here (only ever returned
// once, at creation, and again via /regenerate-token) — see BOTS.md.
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

    const userId = `bot_${Date.now()}`;
    await createUser({
      id: userId,
      name: name.trim(),
      username: `${name.trim().toLowerCase().replace(/\s+/g, "_")}_bot`,
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

// Keeps the AI assistant honest about the *actual* sandbox surface (see
// public/BOTS.md's "In-app editor" section) rather than inventing plausible-
// looking but nonexistent APIs — the single biggest failure mode for an LLM
// asked to write code against a bespoke, undocumented-to-it runtime.
const ASSIST_SYSTEM_PROMPT = `Ты — ассистент программиста, который помогает писать код для чат-ботов Shalter прямо во встроенном редакторе.

Песочница вызывает ОДНУ функцию на каждое входящее сообщение:

async function handleMessage(msg, bot) { ... }

Доступно внутри неё:
- msg.text, msg.chatId, msg.senderId, msg.createdAt — поля входящего сообщения.
- bot.send(text, opts?) — ответить в тот же чат, откуда пришло msg.
- bot.sendTo(chatId, text, opts?) — отправить в конкретный чат. opts: { keyboard, replyToId }.
- bot.ai(prompt, opts?) — спросить настроенную на сервере ИИ, вернёт текст. opts: { system, maxTokens (по умолчанию 512, максимум 2048) }. До 12 вызовов в минуту на бота.
- console.log/console.error/console.warn — попадают в панель логов.
- fetch — обычный fetch для внешних API.
- keyboard (inline-кнопки): [[{ text: "Да", action: "/yes" }, { text: "Нет", action: "/no" }]] — нажатие присылает action как обычное сообщение от пользователя.

Никаких других глобальных переменных, доступа к файловой системе или npm-пакетам нет — код выполняется в изолированной песочнице с таймаутом 20с.

Отвечай кратко и по делу на русском. Когда даёшь код — выдавай ПОЛНОСТЬЮ готовую функцию handleMessage целиком (не фрагмент) в одном блоке \`\`\`js ... \`\`\`, чтобы её можно было целиком вставить в редактор.`;

// Rate limit is shared with bot.ai()/POST /ai (same askAI(botId, ...) call,
// server/lib/ai.js) — deliberately: this is still "AI usage attributed to
// this bot", and reusing that bucket avoids needing a second cost dimension
// to reason about.
router.post(
  "/:id/assist",
  asyncRoute(async (req, res) => {
    const bot = await requireOwnedBot(req, res);
    if (!bot) return;
    const { message, code } = req.body ?? {};
    if (!message?.trim()) return res.status(400).json({ error: "Введите вопрос" });

    const prompt = `Текущий код в редакторе:\n\`\`\`js\n${(code ?? "").slice(0, 6000) || "(пусто)"}\n\`\`\`\n\nЗапрос: ${message.trim().slice(0, 2000)}`;
    // askAI throws (rather than returning an error shape) on anything from
    // "not configured" to a timeout — same as routes/botApi.js's /ai, catch
    // it here so the specific message reaches the client instead of the
    // generic 500 the shared error handler gives unhandled rejections.
    try {
      const reply = await askAI(bot.id, prompt, { system: ASSIST_SYSTEM_PROMPT, maxTokens: 1500 });
      res.json({ reply });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
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

    let chat = (await listChats()).find(
      (c) => c.type === "dm" && c.memberIds.includes(req.uid) && c.memberIds.includes(bot.userId)
    );
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

module.exports = router;
