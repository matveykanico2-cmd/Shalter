const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getChat, updateChat, deleteChat, createChat, listChats, listChatsForUser } = require("../data/chats");
const { deleteMessagesForChat } = require("../data/messages");
const { setChatCleared } = require("../data/settings");
const { attachSummaries } = require("../data/chat-summary");
const { listUsers } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { markTyping, getTypingUserId } = require("../data/typing");
const messagesRouter = require("./messages");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const chats = await listChatsForUser(req.uid);
    const withSummary = await attachSummaries(chats, req.uid);
    res.json({ chats: withSummary });
  })
);

// Start a new DM (or return the existing one) — used from Contacts.
router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { userId, title, avatarColor } = req.body ?? {};

    const existing = (await listChats()).find(
      (c) => c.type === "dm" && c.memberIds.includes(req.uid) && c.memberIds.includes(userId)
    );
    if (existing) return res.json({ chat: existing });

    const chat = await createChat({
      id: `c_${Date.now()}`,
      type: "dm",
      title,
      avatarColor,
      memberIds: [req.uid, userId],
      pinned: false,
      muted: false,
      archived: false,
      createdAt: new Date().toISOString(),
    });

    res.json({ chat });
  })
);

// Creates a new channel with an auto-created, linked discussion group
// (Telegram's real "channel + discussion group" pattern), so posts published
// to the channel (see server/routes/posts.js) have somewhere to be commented on.
router.post(
  "/channels",
  asyncRoute(async (req, res) => {
    const { title } = req.body ?? {};
    if (!title?.trim()) return res.status(400).json({ error: "Введите название канала" });
    const now = new Date().toISOString();
    const discussion = await createChat({
      id: `c_${Date.now()}_d`,
      type: "group",
      title: `${title.trim()} · Обсуждение`,
      avatarColor: "#5C6473",
      memberIds: [req.uid],
      ownerId: req.uid,
      adminIds: [req.uid],
      pinned: false,
      muted: false,
      archived: false,
      createdAt: now,
    });
    const channel = await createChat({
      id: `c_${Date.now()}`,
      type: "channel",
      title: title.trim(),
      avatarColor: "#D9822E",
      memberIds: [req.uid],
      ownerId: req.uid,
      adminIds: [req.uid],
      isPublic: false,
      pinned: false,
      muted: false,
      archived: false,
      linkedDiscussionChatId: discussion.id,
      createdAt: now,
    });
    res.json({ chat: channel });
  })
);

async function requireMemberChat(req, res) {
  const chat = await getChat(req.params.id);
  if (!chat || !chat.memberIds.includes(req.uid)) {
    res.status(404).json({ error: "not found" });
    return null;
  }
  return chat;
}

router.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const [summary] = await attachSummaries([chat], req.uid);
    const users = await listUsers();
    const members = chat.memberIds
      .map((mid) => users.find((u) => u.id === mid))
      .filter((u) => u !== undefined)
      .map(publicUser);
    res.json({ chat: summary, members });
  })
);

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const updated = await updateChat(req.params.id, req.body ?? {});
    res.json({ chat: updated });
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    await deleteMessagesForChat(req.params.id);
    await deleteChat(req.params.id);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/clear",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const forEveryone = !!(req.body ?? {}).forEveryone;
    if (forEveryone) {
      await deleteMessagesForChat(req.params.id);
    } else {
      // Hides everything up to now from just this user — history stays
      // intact for everyone else in the chat.
      await setChatCleared(req.uid, req.params.id, new Date().toISOString());
    }
    res.json({ ok: true });
  })
);

// Leaving a group/channel removes you from the member list; if you were
// the last member, the chat (and its history) is cleaned up entirely.
router.post(
  "/:id/leave",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const memberIds = chat.memberIds.filter((m) => m !== req.uid);
    const adminIds = chat.adminIds?.filter((m) => m !== req.uid);

    if (memberIds.length === 0) {
      await deleteMessagesForChat(req.params.id);
      await deleteChat(req.params.id);
      return res.json({ ok: true, deleted: true });
    }

    await updateChat(req.params.id, {
      memberIds,
      adminIds,
      ownerId: chat.ownerId === req.uid ? memberIds[0] : chat.ownerId,
    });
    res.json({ ok: true, deleted: false });
  })
);

router.post(
  "/:id/members",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const isOwnerOrAdmin = chat.ownerId === req.uid || chat.adminIds?.includes(req.uid);
    if (!isOwnerOrAdmin) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }

    const { userId, role } = req.body ?? {};
    if (userId === chat.ownerId) {
      return res.status(400).json({ error: "Нельзя изменить владельца" });
    }

    if (role === "kick") {
      const updated = await updateChat(req.params.id, {
        memberIds: chat.memberIds.filter((m) => m !== userId),
        adminIds: chat.adminIds?.filter((m) => m !== userId),
      });
      return res.json({ chat: updated });
    }
    if (role === "promote") {
      const admins = new Set(chat.adminIds ?? []);
      admins.add(userId);
      const updated = await updateChat(req.params.id, { adminIds: [...admins] });
      return res.json({ chat: updated });
    }
    if (role === "demote") {
      const updated = await updateChat(req.params.id, {
        adminIds: (chat.adminIds ?? []).filter((m) => m !== userId),
      });
      return res.json({ chat: updated });
    }
    res.status(400).json({ error: "unknown role" });
  })
);

router.get(
  "/:id/typing",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    res.json({ typingUserId: getTypingUserId(req.params.id, req.uid) });
  })
);

router.post(
  "/:id/typing",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    markTyping(req.params.id, req.uid);
    res.json({ ok: true });
  })
);

router.use("/:id/messages", messagesRouter);

module.exports = router;
