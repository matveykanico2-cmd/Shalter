const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireBotToken } = require("../middleware/botAuth");
const { getUser } = require("../data/users");
const { listChatsForUser } = require("../data/chats");
const { listAllMessages } = require("../data/messages");
const { publicUser } = require("../data/sanitize");
const { sendBotMessage } = require("../lib/botMessaging");

// The actual "program it however you want" surface — see BOTS.md. A bot's
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

module.exports = router;
