const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listBotsByOwner, getBot, createBot, regenerateToken, deleteBot, updateBotCode } = require("../data/bots");
const { createUser, getUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { runBotCode } = require("../lib/botSandbox");
const botLogs = require("../data/botLogs");
const { listChats, createChat } = require("../data/chats");

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
