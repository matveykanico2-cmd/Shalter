const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listChatsForUser, searchPublicChannels } = require("../data/chats");
const { listAllMessages } = require("../data/messages");
const { listUsers } = require("../data/users");
const { publicUsers } = require("../data/sanitize");

// One search box for everything the app has: your own chats, public channels you
// haven't joined, people, bots, and message text.
//
// Channels and bots used to be missing entirely — a public channel could only be
// found on its own discovery screen, and a bot only if you happened to know it
// was an account and typed enough of its name to surface it among people. Both
// are things you look for by name, in the place you look for things.

const router = express.Router();
router.use(requireUserId);

const LIMIT = 20;

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const raw = (req.query.q ?? "").toString().trim();
    const q = raw.toLowerCase();
    // A leading @ means "this is a handle" — dropped before matching so
    // "@durov" and "durov" find the same thing.
    const handle = q.replace(/^@/, "");
    if (!q) return res.json({ chats: [], channels: [], users: [], bots: [], messages: [] });

    const [chats, users, messages, publicChannels] = await Promise.all([
      listChatsForUser(req.uid),
      listUsers(),
      listAllMessages(),
      searchPublicChannels(raw),
    ]);

    // Your own chats, by title or by public @username — a channel you're in is
    // findable by the handle you'd share, not only by the name it shows.
    const matchedChats = chats.filter(
      (c) => c.title.toLowerCase().includes(q) || (c.username ?? "").toLowerCase().includes(handle)
    );

    // Public channels you are *not* in. The ones you are in are already above,
    // and listing them twice under two headings is just noise.
    const joined = new Set(chats.map((c) => c.id));
    const matchedChannels = publicChannels
      .filter((c) => !joined.has(c.id))
      .slice(0, LIMIT)
      .map((c) => ({
        id: c.id,
        title: c.title,
        username: c.username,
        description: c.description,
        avatarColor: c.avatarColor,
        avatarImage: c.avatarImage,
        subscriberCount: c.memberIds.length,
      }));

    // Bots are accounts too, but they're a different thing to be looking for:
    // one is a person you might message, the other a service you might use.
    const matchedAccounts = users.filter(
      (u) =>
        u.id !== req.uid &&
        !u.isBanned &&
        (u.name.toLowerCase().includes(q) || (u.username ?? "").toLowerCase().includes(handle))
    );

    const chatIds = new Set(chats.map((c) => c.id));
    const matchedMessages = messages
      .filter((m) => chatIds.has(m.chatId) && !m.deleted && m.text.toLowerCase().includes(q))
      .slice(-LIMIT);

    res.json({
      chats: matchedChats,
      channels: matchedChannels,
      users: publicUsers(matchedAccounts.filter((u) => !u.isBot)).slice(0, LIMIT),
      bots: publicUsers(matchedAccounts.filter((u) => u.isBot)).slice(0, LIMIT),
      messages: matchedMessages,
    });
  })
);

module.exports = router;
