const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { searchPublicChannels, getChat, updateChat } = require("../data/chats");
const { broadcastToUsers } = require("../ws");

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

module.exports = router;
