const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getChat, updateChat, deleteChat, createChat, listChats, listChatsForUser } = require("../data/chats");
const { deleteMessagesForChat } = require("../data/messages");
const { getSettings, setChatCleared, deleteChatForUser, setChatWallpaper } = require("../data/settings");
const { attachSummaries } = require("../data/chat-summary");
const { listUsers, getUser } = require("../data/users");
const { listContactsFor } = require("../data/contacts");
const { publicUser } = require("../data/sanitize");
const { markTyping, getTypingUserId } = require("../data/typing");
const { broadcastToUsers } = require("../ws");
const messagesRouter = require("./messages");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const chats = await listChatsForUser(req.uid);
    const withSummary = await attachSummaries(chats, req.uid);
    // attachSummaries already applies chatClears when computing lastMessage,
    // so a hidden chat with no *new* message since it was hidden naturally
    // has lastMessage: null here — no separate timestamp comparison needed,
    // and a fresh incoming message un-hides it for free.
    const settings = await getSettings(req.uid);
    const hidden = settings.hiddenChats ?? {};
    const visible = withSummary.filter((c) => !hidden[c.id] || c.lastMessage);
    res.json({ chats: visible });
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
    const { title, avatarImage, memberIds, adminIds } = req.body ?? {};
    if (!title?.trim()) return res.status(400).json({ error: "Введите название канала" });
    const now = new Date().toISOString();
    // Members/admins picked in the create dialog (see memberPickerDialog.js)
    // — the creator is always included and is always an owner-level admin
    // regardless of what the dialog sent, same defensive union pattern as
    // /groups below.
    const members = new Set([req.uid, ...(Array.isArray(memberIds) ? memberIds : [])]);
    const admins = new Set([req.uid, ...(Array.isArray(adminIds) ? adminIds.filter((id) => members.has(id)) : [])]);
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
      avatarImage: avatarImage || undefined,
      memberIds: [...members],
      ownerId: req.uid,
      adminIds: [...admins],
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

// Creates a new group chat with the given title and initial members
// (the creator is always included as owner+admin).
router.post(
  "/groups",
  asyncRoute(async (req, res) => {
    const { title, memberIds, avatarImage, adminIds } = req.body ?? {};
    if (!title?.trim()) return res.status(400).json({ error: "Введите название группы" });
    const members = new Set([req.uid, ...(Array.isArray(memberIds) ? memberIds : [])]);
    const admins = new Set([req.uid, ...(Array.isArray(adminIds) ? adminIds.filter((id) => members.has(id)) : [])]);
    const chat = await createChat({
      id: `c_${Date.now()}`,
      type: "group",
      title: title.trim(),
      avatarColor: "#2E56D9",
      avatarImage: avatarImage || undefined,
      memberIds: [...members],
      ownerId: req.uid,
      adminIds: [...admins],
      pinned: false,
      muted: false,
      archived: false,
      createdAt: new Date().toISOString(),
    });
    res.json({ chat });
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

// Per-chat wallpaper override (Settings sets the global default; this is
// the chat header's "…" → "Фон чата" picker overriding it for one
// conversation only, same shape as chatClears/hiddenChats — private to
// this account, stored in *this user's* settings row, not the chat itself).
router.post(
  "/:id/wallpaper",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const { wallpaper } = req.body ?? {};
    const settings = await setChatWallpaper(req.uid, req.params.id, wallpaper ?? null);
    res.json({ settings });
  })
);

// "Delete for me" from the chat-list long-press menu: the chat drops out of
// *this user's* list and its history is cleared from their view, but stays
// fully intact for every other member — the group/channel-wide DELETE /:id
// below is the "for everyone" counterpart, and stays restricted to DM-like
// chats client-side (see chatListItem.js) since wiping a whole group for
// every member isn't something a casual long-press should be able to do.
router.post(
  "/:id/delete-for-me",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    await deleteChatForUser(req.uid, req.params.id, new Date().toISOString());
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

    if (role === "add") {
      if (chat.memberIds.includes(userId)) {
        return res.status(400).json({ error: "Уже в чате" });
      }
      const user = await getUser(userId);
      if (!user) return res.status(404).json({ error: "Пользователь не найден" });

      // "Who can add me to groups/channels" (Settings → Конфиденциальность) —
      // same everyone/contacts/nobody shape as phone/last-seen, checked
      // against the *target's* contact list, not the adder's (same sense as
      // the profile-view privacy check in routes/users.js).
      const { privacy } = await getSettings(userId);
      if (privacy.invites === "nobody") {
        return res.status(403).json({ error: "Пользователь ограничил добавление в чаты" });
      }
      if (privacy.invites === "contacts") {
        const targetsContacts = await listContactsFor(userId);
        if (!targetsContacts.some((c) => c.userId === req.uid)) {
          return res.status(403).json({ error: "Пользователь ограничил добавление в чаты" });
        }
      }

      const updated = await updateChat(req.params.id, { memberIds: [...chat.memberIds, userId] });
      // The newly added member needs to see this chat show up in their own
      // list right away, not just on their next poll.
      broadcastToUsers([userId], { type: "chat:added", chat: updated });
      return res.json({ chat: updated });
    }

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

// Restricts (or un-restricts) a member from posting — "until" is either an
// ISO timestamp (temporary) or "forever" (permanent); omitting/null lifts an
// existing restriction. Enforced on the actual send path in routes/messages.js.
router.post(
  "/:id/restrict",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const isOwnerOrAdmin = chat.ownerId === req.uid || chat.adminIds?.includes(req.uid);
    if (!isOwnerOrAdmin) return res.status(403).json({ error: "Недостаточно прав" });

    const { userId, until } = req.body ?? {};
    if (userId === chat.ownerId || chat.adminIds?.includes(userId)) {
      return res.status(400).json({ error: "Нельзя ограничить владельца или администратора" });
    }
    if (!chat.memberIds.includes(userId)) return res.status(404).json({ error: "not found" });

    const restrictions = { ...chat.restrictions };
    if (until) restrictions[userId] = until;
    else delete restrictions[userId];

    const updated = await updateChat(req.params.id, { restrictions });
    res.json({ chat: updated });
  })
);

// Premium members vote a group up — one vote/24h each, +1 point per vote.
// Crossing a threshold (see server/lib/groupLevels.js) levels the group up;
// the level shows as a badge (see InfoPanel/chatView) — cosmetic only.
router.post(
  "/:id/vote",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (chat.type !== "group") return res.status(400).json({ error: "Голосование доступно только для групп" });

    const me = await getUser(req.uid);
    if (!me?.isPremium) return res.status(403).json({ error: "Голосовать могут только пользователи с Shalter Premium" });

    const lastVote = chat.votes?.[req.uid];
    if (lastVote && Date.now() - new Date(lastVote).getTime() < 24 * 3600_000) {
      return res.status(429).json({ error: "Вы уже голосовали за эту группу сегодня" });
    }

    const updated = await updateChat(req.params.id, {
      points: (chat.points ?? 0) + 1,
      votes: { ...chat.votes, [req.uid]: new Date().toISOString() },
    });
    res.json({ chat: updated });
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
    broadcastToUsers(chat.memberIds.filter((id) => id !== req.uid), {
      type: "typing:update",
      chatId: req.params.id,
      userId: req.uid,
    });
    res.json({ ok: true });
  })
);

router.use("/:id/messages", messagesRouter);

module.exports = router;
