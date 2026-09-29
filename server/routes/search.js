const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listChatsForUser, searchPublicChannels } = require("../data/chats");
const { searchInChats } = require("../data/messages");
const { searchUsers, listUserNamesByIds } = require("../data/users");
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

    // Люди и боты ищутся запросом к базе, а не чтением всех аккаунтов сервера
    // в память на каждое нажатие клавиши: у каждой строки users лежит аватар,
    // и поиск по десяти буквам стоил чтения всех картинок разом.
    const [chats, users, publicChannels] = await Promise.all([
      listChatsForUser(req.uid),
      searchUsers(raw, { limit: LIMIT }),
      searchPublicChannels(raw),
    ]);

    // Личный чат ищется по собеседнику, а не по своему title: title личного
    // чата — то, что передал его создатель (имя собеседника на момент
    // создания, а у второй стороны это вовсе её собственное имя), поэтому
    // «Катя» не находила переписку с Катей. Имена берутся одним лёгким
    // запросом по всем собеседникам сразу.
    const peerOf = (c) => ((c.type === "dm" || c.type === "bot") ? c.memberIds.find((id) => id !== req.uid) : null);
    const peers = new Map(listUserNamesByIds(chats.map(peerOf).filter(Boolean)).map((u) => [u.id, u]));
    const isSaved = (c) => c.type === "dm" && c.memberIds.length === 1 && c.memberIds[0] === req.uid;
    const nameOf = (c) => {
      if (isSaved(c)) return "избранное";
      const peer = peers.get(peerOf(c));
      return (peer?.name ?? c.title ?? "").toLowerCase();
    };
    const handleOf = (c) => (peers.get(peerOf(c))?.username ?? c.username ?? "").toLowerCase();

    // Your own chats, by title or by public @username — a channel you're in is
    // findable by the handle you'd share, not only by the name it shows.
    const matchedChats = chats
      .filter((c) => nameOf(c).includes(q) || (handle && handleOf(c).includes(handle)))
      .sort((a, b) => {
        const rank = (c) => (handleOf(c).startsWith(handle) ? 0 : nameOf(c).startsWith(q) ? 1 : 2);
        return rank(a) - rank(b);
      });
    // Собеседник, с которым уже есть переписка, показывается строкой этой
    // переписки — повторять его ниже ещё и в «Людях» незачем.
    const peersInResults = new Set(matchedChats.map(peerOf).filter(Boolean));

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
    //
    // Ranked, not just filtered: a @handle that *starts* with what was typed is
    // what someone means by "@dur", and burying it under everyone whose name
    // merely contains those letters makes the box feel broken.
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

    // Поиск по сообщениям делает база: раньше сюда выгружалась вся таблица
    // целиком и фильтровалась в памяти — на живом аккаунте это десятки тысяч
    // объектов, из которых показываются двадцать.
    const matchedMessages = searchInChats(
      chats.map((c) => c.id),
      q,
      { limit: LIMIT }
    )
      .filter((m) => !m.deleted)
      // Свежие — первыми, как в Telegram: searchInChats отдаёт по возрастанию
      // (так удобно поиску внутри одной переписки), а в общем поиске ищут
      // обычно недавнее.
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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
