const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listBotsByOwner, getBot, createBot, regenerateToken, deleteBot, updateBotCode, updateBotCommands, updateBotDescription } = require("../data/bots");
const { createUser, getUser, updateUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { checkUsername, normalizeUsername, generateBotUsername } = require("../lib/username");
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

    const description = typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 300) : null;
    const updated = description === null ? await getBot(bot.id) : await updateBotDescription(bot.id, description);
    res.json({ bot: { ...updated, user: publicUser(await getUser(bot.userId)) } });
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
