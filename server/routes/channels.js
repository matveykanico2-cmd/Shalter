const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { searchPublicChannels, getChat, updateChat } = require("../data/chats");
const { broadcastToUsers } = require("../ws");
const { listMessages } = require("../data/messages");

const router = express.Router();
router.use(requireUserId);

// Public-channel discovery (public/js/views/discoverChannels.js) — anyone
// logged in can browse/search, same as Telegram's own public channel
// search. Deliberately separate from the channel's own chats.js CRUD:
// this never needs to be a *member* of a channel to see it here, unlike
// every route in routes/chats.js which gates on requireMemberChat.
router.get(
  "/",
  asyncRoute(async (req, res) => {
    const channels = await searchPublicChannels(req.query.q);
    res.json({
      channels: channels.map((c) => ({
        id: c.id,
        title: c.title,
        username: c.username,
        description: c.description,
        avatarColor: c.avatarColor,
        avatarImage: c.avatarImage,
        subscriberCount: c.memberIds.length,
        isMember: c.memberIds.includes(req.uid),
      })),
    });
  })
);

// Self-service join — unlike routes/chats.js's /:id/members (owner/admin
// adds *someone else*), a public channel's whole point is that anyone can
// subscribe themselves without an admin's action, same as Telegram.
router.post(
  "/:id/subscribe",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || chat.type !== "channel" || !chat.isPublic) return res.status(404).json({ error: "not found" });
    if (chat.memberIds.includes(req.uid)) return res.json({ chat });

    const updated = await updateChat(req.params.id, { memberIds: [...chat.memberIds, req.uid] });
    // Same event chatList.js already listens for when an admin adds someone
    // to a chat (routes/chats.js's /:id/members) — makes the new channel
    // show up in the subscriber's own chat list without a manual refresh.
    broadcastToUsers([req.uid], { type: "chat:added", chat: updated });
    res.json({ chat: updated });
  })
);

// ── Статистика канала ───────────────────────────────────────────────────────
//
// Просмотры и комментарии копились в базе с самого начала (столбцы views и
// commentCount на каждом сообщении), но посмотреть на них было негде: цифра
// просмотров видна под отдельным постом, а «как канал живёт в целом» —
// нигде. Считается на лету из уже имеющихся строк, без отдельной таблицы:
// канал на этом развёртывании — это сотни сообщений, а не миллионы, и
// заводить агрегаты ради такого объёма значит платить сложностью вперёд.
//
// Только для тех, кто ведёт канал: подписчику эти числа не нужны, а
// показывать посторонним, насколько канал живой, — решение владельца.
router.get(
  "/:id/stats",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || chat.type !== "channel") return res.status(404).json({ error: "Канал не найден" });
    const canSee = chat.ownerId === req.uid || (chat.ownerIds ?? []).includes(req.uid) || (chat.adminIds ?? []).includes(req.uid);
    if (!canSee) return res.status(403).json({ error: "Статистика доступна администраторам канала" });

    const posts = (await listMessages(chat.id, req.uid)).filter((m) => m.type !== "system" && !m.deleted);
    const views = posts.reduce((sum, m) => sum + (m.views ?? 0), 0);
    const comments = posts.reduce((sum, m) => sum + (m.commentCount ?? 0), 0);
    const reactions = posts.reduce((sum, m) => sum + (m.reactions ?? []).reduce((n, r) => n + (r.userIds?.length ?? 0), 0), 0);

    // По дням за две недели — чтобы было видно не только «сколько всего», но и
    // «когда». Пустые дни остаются в списке нулями: провал в графике сам по
    // себе информация, а сжатый до непустых дней ряд её прячет.
    const DAYS = 14;
    const today = new Date();
    const byDay = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      const key = day.toISOString().slice(0, 10);
      const ofDay = posts.filter((m) => (m.createdAt ?? "").slice(0, 10) === key);
      byDay.push({
        date: key,
        posts: ofDay.length,
        views: ofDay.reduce((sum, m) => sum + (m.views ?? 0), 0),
      });
    }

    const top = [...posts]
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0) || (b.commentCount ?? 0) - (a.commentCount ?? 0))
      .slice(0, 5)
      .map((m) => ({
        id: m.id,
        text: (m.text ?? "").slice(0, 120),
        createdAt: m.createdAt,
        views: m.views ?? 0,
        commentCount: m.commentCount ?? 0,
      }));

    res.json({
      subscribers: chat.memberIds.length,
      posts: posts.length,
      views,
      comments,
      reactions,
      // Среднее по постам, а не по дням: пустой день не должен занижать
      // «сколько читают один пост».
      averageViews: posts.length ? Math.round(views / posts.length) : 0,
      firstPostAt: posts.length ? posts[0].createdAt : null,
      lastPostAt: posts.length ? posts[posts.length - 1].createdAt : null,
      byDay,
      top,
    });
  })
);

module.exports = router;
