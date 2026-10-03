const express = require("express");
const { publicUsersFor } = require("../lib/privacyRules");
const { getSettings } = require("../data/settings");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listChatsForUser, searchPublicChannels } = require("../data/chats");
const { searchInChats } = require("../data/messages");
const { searchUsers, listUserNamesByIds } = require("../data/users");
const { publicUsers } = require("../data/sanitize");

const router = express.Router();
router.use(requireUserId);

const LIMIT = 20;

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const raw = (req.query.q ?? "").toString().trim();
    const q = raw.toLowerCase();
    const handle = q.replace(/^@/, "");
    if (!q) return res.json({ chats: [], channels: [], users: [], bots: [], messages: [] });

    const [chats, users, publicChannels] = await Promise.all([
      // Секретные чаты в общий поиск не попадают — как в Telegram.
      listChatsForUser(req.uid).then((list) => list.filter((c) => !c.secret)),
      searchUsers(raw, { limit: LIMIT }),
      searchPublicChannels(raw),
    ]);

    const peerOf = (c) => ((c.type === "dm" || c.type === "bot") ? c.memberIds.find((id) => id !== req.uid) : null);
    const peers = new Map(listUserNamesByIds(chats.map(peerOf).filter(Boolean)).map((u) => [u.id, u]));
    const isSaved = (c) => c.type === "dm" && c.memberIds.length === 1 && c.memberIds[0] === req.uid;
    const nameOf = (c) => {
      if (isSaved(c)) return "избранное";
      const peer = peers.get(peerOf(c));
      return (peer?.name ?? c.title ?? "").toLowerCase();
    };
    const handleOf = (c) => (peers.get(peerOf(c))?.username ?? c.username ?? "").toLowerCase();

    const matchedChats = chats
      .filter((c) => nameOf(c).includes(q) || (handle && handleOf(c).includes(handle)))
      .sort((a, b) => {
        const rank = (c) => (handleOf(c).startsWith(handle) ? 0 : nameOf(c).startsWith(q) ? 1 : 2);
        return rank(a) - rank(b);
      });
    const peersInResults = new Set(matchedChats.map(peerOf).filter(Boolean));

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

    const score = (u) => {
      const name = (u.name ?? "").toLowerCase();
      const uname = (u.username ?? "").toLowerCase();
      if (uname === handle || name === q) return 0;
      if (uname.startsWith(handle)) return 1;
      if (name.startsWith(q)) return 2;
      if (uname.includes(handle)) return 3;
      return 4;
    };
    const matchedAccounts = users
      .filter(
        (u) =>
          u.id !== req.uid &&
          !u.isBanned &&
          !peersInResults.has(u.id) &&
          (u.name.toLowerCase().includes(q) || (u.username ?? "").toLowerCase().includes(handle))
      )
      .sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name, "ru"));

    const clears = (await getSettings(req.uid)).chatClears ?? {};
    const matchedMessages = searchInChats(
      chats.map((c) => c.id),
      q,
      { limit: LIMIT }
    )
      // Удалённые «у себя» и стёртые очисткой истории не должны всплывать в поиске.
      .filter((m) => !m.deleted && !m.deletedForIds?.includes(req.uid) && !(clears[m.chatId] && m.createdAt <= clears[m.chatId]))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.json({
      chats: matchedChats,
      channels: matchedChannels,
      users: await publicUsersFor(matchedAccounts.filter((u) => !u.isBot).slice(0, LIMIT), req.uid),
      bots: publicUsers(matchedAccounts.filter((u) => u.isBot)).slice(0, LIMIT),
      messages: matchedMessages,
    });
  })
);

module.exports = router;
