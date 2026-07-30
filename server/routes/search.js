const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listChatsForUser } = require("../data/chats");
const { listAllMessages } = require("../data/messages");
const { listUsers } = require("../data/users");
const { publicUsers } = require("../data/sanitize");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const q = (req.query.q ?? "").toString().trim().toLowerCase();
    if (!q) return res.json({ chats: [], users: [], messages: [] });

    const [chats, users, messages] = await Promise.all([listChatsForUser(req.uid), listUsers(), listAllMessages()]);

    const matchedChats = chats.filter((c) => c.title.toLowerCase().includes(q));
    const matchedUsers = users.filter(
      (u) => u.id !== req.uid && (u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
    );
    const chatIds = new Set(chats.map((c) => c.id));
    const matchedMessages = messages
      .filter((m) => chatIds.has(m.chatId) && !m.deleted && m.text.toLowerCase().includes(q))
      .slice(-20);

    res.json({ chats: matchedChats, users: publicUsers(matchedUsers), messages: matchedMessages });
  })
);

module.exports = router;
