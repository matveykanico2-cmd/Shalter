const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getChat, updateChat, deleteChat, createChat, listChats, listChatsForUser, findDmBetween, findChatByInviteCode, findChatByUsername, findChannelByDiscussionChatId } = require("../data/chats");
const { checkUsername, normalizeUsername } = require("../lib/username");
const { colorUnlocked, lockedColorError, colorState } = require("../lib/chatFeatures");
const { PERMISSIONS, permissionsOf, sanitizePermissions } = require("../lib/chatPermissions");
const { deleteMessagesForChat } = require("../data/messages");
const { getSettings, updateSettings, mutedStateFor, setChatCleared, deleteChatForUser, setChatWallpaper, setDraft } = require("../data/settings");
const { allowsUser } = require("../lib/privacyRules");
const { messageCost } = require("../lib/messagePrice");
const { attachSummaries } = require("../data/chat-summary");
const { listUsers, listUsersByIds, getUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { getBotByUserId } = require("../data/bots");
const joinRequests = require("../data/joinRequests");
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

    // A chat with yourself ("Избранное") has one member, so the two-way
    // membership test below matches *every* DM you have — asking for it used to
    // hand back whichever conversation happened to come first.
    const self = userId === req.uid;
    // Один запрос по join-таблице вместо чтения всех чатов сервера вместе с
    // их участниками — «написать человеку» дорожало с каждым чатом в базе.
    const existing = await findDmBetween(req.uid, self ? req.uid : userId);
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

// Secret (E2E) chats used to live here as POST /secret. The whole feature is
// gone — chat types are dm | group | channel | bot now. Anything that used to
// branch on type "secret" (message text left unprocessed, drafts not synced,
// no link previews/mentions/translation, an undecryptable data export) was a
// second, quietly worse code path through the entire messaging stack, kept
// alive for a mode nobody was actually using.

// Description and @handle, given at creation time. Both used to be
// after-the-fact edits gated on the chat's level, so a new channel started
// nameless and private and could only be published once its members had voted
// it up — which they can't do before it exists. A handle claimed here goes
// through exactly the same namespace check as /:id/public.
async function resolveNewChatIdentity({ description, username, isPublic }) {
  const desc = typeof description === "string" ? description.trim().slice(0, 500) : "";
  if (!isPublic || !String(username ?? "").trim()) {
    return { description: desc || null, username: null, isPublic: false };
  }
  const handle = normalizeUsername(username);
  const problem = await checkUsername(handle);
  if (problem) return { error: problem };
  return { description: desc || null, username: handle, isPublic: true };
}

// Creates a new channel with an auto-created, linked discussion group
// (Telegram's real "channel + discussion group" pattern), so posts published
// to the channel (see server/routes/posts.js) have somewhere to be commented on.
router.post(
  "/channels",
  asyncRoute(async (req, res) => {
    const { title, avatarImage, memberIds, adminIds } = req.body ?? {};
    if (!title?.trim()) return res.status(400).json({ error: "Введите название канала" });
    const identity = await resolveNewChatIdentity(req.body ?? {});
    if (identity.error) return res.status(identity.error.status).json({ error: identity.error.error });
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
      description: identity.description,
      username: identity.username,
      avatarColor: "#D9822E",
      avatarImage: avatarImage || undefined,
      memberIds: [...members],
      ownerId: req.uid,
      adminIds: [...admins],
      isPublic: identity.isPublic,
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
    const identity = await resolveNewChatIdentity(req.body ?? {});
    if (identity.error) return res.status(identity.error.status).json({ error: identity.error.error });
    const members = new Set([req.uid, ...(Array.isArray(memberIds) ? memberIds : [])]);
    const admins = new Set([req.uid, ...(Array.isArray(adminIds) ? adminIds.filter((id) => members.has(id)) : [])]);
    const chat = await createChat({
      id: `c_${Date.now()}`,
      type: "group",
      title: title.trim(),
      description: identity.description,
      username: identity.username,
      isPublic: identity.isPublic,
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

// Ownership is a list now (server/db.js's isOwner flag). chats.ownerId is kept as
// the creator for compatibility, so both are consulted — otherwise a co-owner
// would be silently powerless everywhere the old code compared ownerId directly.
function isOwner(chat, userId) {
  return chat?.ownerId === userId || (chat?.ownerIds ?? []).includes(userId);
}

function isOwnerOrAdminOf(chat, userId) {
  return isOwner(chat, userId) || (chat?.adminIds ?? []).includes(userId);
}

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
    // Только участники этого чата. Раньше здесь читались ВСЕ аккаунты сервера
    // — вместе с аватарами — и по ним шёл поиск перебором на каждого участника.
    const users = await listUsersByIds(chat.memberIds);
    const byId = new Map(users.map((u) => [u.id, u]));
    const members = chat.memberIds
      .map((mid) => byId.get(mid))
      .filter((u) => u !== undefined)
      .map(publicUser);

    // A bot's command list, so the composer can offer them the way Telegram's
    // "/" menu does. Stored since bots existed and shown nowhere until now —
    // people had to already know a bot's commands to use it.
    const botMember = members.find((u) => u.isBot && u.id !== req.uid);
    const bot = botMember ? await getBotByUserId(botMember.id) : null;
    const commands = bot?.commands?.length ? bot.commands : null;

    // Во что обойдётся сообщение в этой переписке — чтобы поле ввода могло
    // сказать цену заранее, а не отказом после отправки (lib/messagePrice.js).
    let paidMessages = null;
    if (chat.type === "dm") {
      const other = users.find((u) => u.id !== req.uid);
      if (other && !other.isBot) {
        const { price, mustPay } = await messageCost(req.uid, other, chat.id);
        if (price > 0) paidMessages = { stars: price, youPay: mustPay };
      }
    } else if (chat.type === "group") {
      // Группа обсуждения канала: та же цена, что и при отправке
      // (server/routes/messages.js), — известна заранее, до отказа при отправке.
      const channel = await findChannelByDiscussionChatId(chat.id);
      const price = channel?.commentPriceStars ?? 0;
      if (price > 0) {
        const me = await getUser(req.uid);
        const youPay = channel.ownerId !== req.uid && !isOwnerOrAdminOf(channel, req.uid) && !me?.isPremium;
        paidMessages = { stars: price, youPay, kind: "comment" };
      }
    }

    res.json({ chat: summary, members, commands, paidMessages });
  })
);

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const patch = req.body ?? {};

    // Only the palette is level-gated now (lib/chatFeatures.js) — a picture, a
    // description and auto-delete are how a chat is run, not a reward. Checked
    // here rather than only in the UI, because this route is also what a bot or
    // a hand-rolled request would use.
    if ("avatarColor" in patch && !colorUnlocked(chat, patch.avatarColor)) {
      return res.status(403).json({ error: lockedColorError(patch.avatarColor) });
    }
    // Renaming, re-picturing and re-describing a group or channel is the
    // owners' and admins' job — it used to be open to any member, so anyone in
    // a group could rename it.
    const EDITABLE_BY_STAFF = ["title", "description", "avatarImage", "avatarColor", "autoDeleteSeconds"];
    if (chat.type !== "dm" && EDITABLE_BY_STAFF.some((k) => k in patch) && !isOwnerOrAdminOf(chat, req.uid)) {
      return res.status(403).json({ error: "Менять настройки чата могут владельцы и админы" });
    }

    const updated = await updateChat(req.params.id, patch);
    // Рассылка — то, чего здесь не было. Соседние маршруты (участники, права,
    // закрепления) о своих изменениях сообщают, а самый частый — переименование
    // и смена фото чата — молчал. Из-за этого новое название и новый аватар
    // группы не появлялись ни у участников, ни у того, кто их поменял: до
    // перезагрузки страницы везде висело старое.
    //
    // Личная переписка сюда тоже попадает (у неё правится, например, обои), и
    // memberIds там — те же двое, кому это и надо знать.
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    res.json({ chat: updated });
  })
);

// The palette this chat's level has unlocked, and what the next one adds. Its
// own route so the info panel can show progress without duplicating the table
// client-side.
router.get(
  "/:id/features",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    res.json({ colors: colorState(chat), points: chat.points ?? 0 });
  })
);

// Toggles a channel between public (listed in the directory — see
// routes/channels.js — and joinable by @username without an invite) and
// private. Owner/admin only, and validated/uniqueness-checked here rather
// than left to the generic PATCH /:id above, which has no permission or
// format checks at all — fine for pinned/muted/archived (harmless if any
// member flips those), not fine for something that publishes a channel and
// claims a global @username.
// Публичный канал или группа по @хендлу — чтобы ссылка вида /@shalter_news
// открывалась у того, кто в нём ещё не состоит. Отдаётся только то, что и так
// видно в поиске по каталогу: имя, описание, картинка и число участников.
router.get(
  "/by-username/:username",
  asyncRoute(async (req, res) => {
    const chat = await findChatByUsername(String(req.params.username).replace(/^@/, ""));
    if (!chat || !chat.isPublic) return res.status(404).json({ error: "not found" });
    res.json({
      chat: {
        id: chat.id,
        type: chat.type,
        title: chat.title,
        username: chat.username,
        description: chat.description ?? null,
        avatarColor: chat.avatarColor,
        avatarImage: chat.avatarImage,
        isVerified: !!chat.isVerified,
        subscribers: chat.memberIds.length,
        isMember: chat.memberIds.includes(req.uid),
      },
    });
  })
);

router.post(
  "/:id/public",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    // Groups too, not just channels: a public group with an @link is an
    // ordinary thing to want, and the handle namespace and directory already
    // handle both.
    if (chat.type !== "channel" && chat.type !== "group") {
      return res.status(400).json({ error: "Публичными могут быть только группы и каналы" });
    }
    const isOwnerOrAdmin = isOwnerOrAdminOf(chat, req.uid);
    if (!isOwnerOrAdmin) return res.status(403).json({ error: "Недостаточно прав" });

    const { isPublic } = req.body ?? {};
    if (!isPublic) {
      const updated = await updateChat(req.params.id, { isPublic: false });
      return res.json({ chat: updated });
    }

    // One shared @handle namespace with real accounts — see lib/username.js,
    // which now owns this check for all three paths that claim a handle.
    const username = normalizeUsername(req.body?.username);
    const problem = await checkUsername(username, { forChatId: chat.id });
    if (problem) return res.status(problem.status).json({ error: problem.error });

    const updated = await updateChat(req.params.id, { isPublic: true, username });
    res.json({ chat: updated });
  })
);

// The queue of people waiting to be let in, and the two answers to it.
router.get(
  "/:id/join-requests",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (!isOwnerOrAdminOf(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });
    const rows = joinRequests.listRequests(chat.id);
    const users = await Promise.all(rows.map(async (r) => ({ ...r, user: publicUser(await getUser(r.userId)) })));
    res.json({ requests: users.filter((r) => r.user) });
  })
);

router.post(
  "/:id/join-requests/:userId",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (!isOwnerOrAdminOf(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });
    if (!joinRequests.hasRequest(chat.id, req.params.userId)) return res.status(404).json({ error: "Заявка не найдена" });

    const approve = req.body?.approve !== false;
    joinRequests.removeRequest(chat.id, req.params.userId);
    if (!approve) {
      // Declining says nothing to the person: an invite-only chat that tells
      // strangers "you were rejected" hands them a way to probe it.
      return res.json({ ok: true, approved: false });
    }

    const updated = await updateChat(chat.id, { memberIds: [...chat.memberIds, req.params.userId] });
    broadcastToUsers([req.params.userId], { type: "chat:added", chat: updated });
    broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
    res.json({ ok: true, approved: true, chat: updated });
  })
);

// Approval on/off, and whether posts carry their author's name. Both are
// owner/admin switches on the chat itself.
router.post(
  "/:id/settings",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (chat.type === "dm") return res.status(400).json({ error: "Только для групп и каналов" });
    if (!isOwnerOrAdminOf(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });
    const patch = {};
    if ("approveJoins" in (req.body ?? {})) patch.approveJoins = !!req.body.approveJoins;
    if ("signMessages" in (req.body ?? {})) patch.signMessages = !!req.body.signMessages;
    if (!Object.keys(patch).length) return res.status(400).json({ error: "Нечего менять" });
    const updated = await updateChat(chat.id, patch);
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    res.json({ chat: updated });
  })
);

// What ordinary members may do here (lib/chatPermissions.js). Groups only:
// posting in a channel is already admin-only, and a second mechanism saying the
// same thing is how two rules end up disagreeing.
router.get(
  "/:id/permissions",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    res.json({ permissions: permissionsOf(chat), fields: PERMISSIONS });
  })
);

router.post(
  "/:id/permissions",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (chat.type !== "group") return res.status(400).json({ error: "Права участников есть только у групп" });
    if (!isOwnerOrAdminOf(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });
    const updated = await updateChat(chat.id, { permissions: sanitizePermissions(req.body?.permissions) });
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    res.json({ chat: updated, permissions: permissionsOf(updated) });
  })
);

// The discussion group behind a channel's comments — creating one, pointing at
// an existing group, or detaching it.
//
// A channel got a discussion group at creation and there was no way to change
// that afterwards: no way to turn comments off, and no way to point the channel
// at a group people were already in. Both are ordinary things to want.
router.post(
  "/:id/discussion",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (chat.type !== "channel") return res.status(400).json({ error: "Обсуждение есть только у каналов" });
    if (!isOwnerOrAdminOf(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });

    const action = req.body?.action;

    if (action === "unlink") {
      // The group itself is left alone. It has its own members and its own
      // history — deleting somebody's group as a side effect of "turn comments
      // off" would be destroying data nobody asked to lose.
      const updated = await updateChat(chat.id, { linkedDiscussionChatId: null });
      broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
      return res.json({ chat: updated, discussion: null });
    }

    if (action === "link") {
      const group = await getChat(req.body?.groupId);
      if (!group || group.type !== "group") return res.status(404).json({ error: "Группа не найдена" });
      if (!isOwnerOrAdminOf(group, req.uid)) return res.status(403).json({ error: "Вы не администратор этой группы" });
      // One discussion group per channel, and one channel per group: a group
      // wired to two channels would collect two streams of comments with no way
      // to tell them apart.
      const taken = (await listChats()).find((c) => c.id !== chat.id && c.linkedDiscussionChatId === group.id);
      if (taken) return res.status(409).json({ error: `Эта группа уже обсуждение канала «${taken.title}»` });

      const updated = await updateChat(chat.id, { linkedDiscussionChatId: group.id });
      broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
      return res.json({ chat: updated, discussion: group });
    }

    if (action === "create") {
      const discussion = await createChat({
        id: `c_${Date.now()}_d`,
        type: "group",
        title: `${chat.title} · Обсуждение`,
        avatarColor: "#5C6473",
        memberIds: [req.uid],
        ownerId: req.uid,
        adminIds: [req.uid],
        pinned: false,
        muted: false,
        archived: false,
        createdAt: new Date().toISOString(),
      });
      const updated = await updateChat(chat.id, { linkedDiscussionChatId: discussion.id });
      broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
      return res.json({ chat: updated, discussion });
    }

    res.status(400).json({ error: "Неизвестное действие" });
  })
);

// Muting for a period, the way Telegram offers it — the app only had a
// permanent switch, so "quiet for an hour" meant remembering to turn it back on.
router.post(
  "/:id/mute",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const hours = Number(req.body?.hours);
    const value =
      req.body?.forever === true
        ? true
        : req.body?.off === true
          ? null
          : Number.isFinite(hours) && hours > 0
            ? new Date(Date.now() + hours * 3600_000).toISOString()
            : undefined;
    if (value === undefined) return res.status(400).json({ error: "Укажите срок" });

    // Пишем в настройки того, кто попросил тишины, а не в общую запись чата:
    // иначе один участник группы выключает уведомления всем остальным.
    const settings = await getSettings(req.uid);
    const mutedChats = { ...(settings.notifications?.mutedChats ?? {}) };
    if (value === null) delete mutedChats[chat.id];
    else mutedChats[chat.id] = value;
    await updateSettings(req.uid, { notifications: { ...settings.notifications, mutedChats } });

    const state = mutedStateFor({ notifications: { mutedChats } }, chat.id);
    res.json({ chat: { ...chat, ...state } });
  })
);

// Slow mode — group only, owners/admins set it.
router.post(
  "/:id/slow-mode",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (chat.type !== "group") return res.status(400).json({ error: "Медленный режим есть только у групп" });
    if (!isOwnerOrAdminOf(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });
    const seconds = Math.max(0, Math.min(3600, Math.trunc(Number(req.body?.seconds) || 0)));
    const updated = await updateChat(chat.id, { slowModeSeconds: seconds || null });
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    res.json({ chat: updated, slowModeSeconds: updated.slowModeSeconds ?? 0 });
  })
);

// Плата звёздами за комментарий под постом канала — канал только, владелец/админ
// задают цену. Списание при отправке — server/routes/messages.js.
router.post(
  "/:id/comment-price",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (chat.type !== "channel") return res.status(400).json({ error: "Платные комментарии есть только у каналов" });
    if (!isOwnerOrAdminOf(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });
    const stars = Math.max(0, Math.min(90000, Math.trunc(Number(req.body?.stars) || 0)));
    const updated = await updateChat(chat.id, { commentPriceStars: stars });
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    // Композитор, который знает про цену, открыт не на канале, а на его группе
    // обсуждения (id другой) — без этого второго сообщения тот, у кого сейчас
    // открыты комментарии, увидел бы новую цену только перезайдя в чат
    // (chatView.js сверяет msg.chat.id с id открытого чата, и там это id
    // группы, а не канала).
    if (updated.linkedDiscussionChatId) {
      broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: { id: updated.linkedDiscussionChatId } });
    }
    res.json({ chat: updated, commentPriceStars: updated.commentPriceStars ?? 0 });
  })
);

// ── Invite links ───────────────────────────────────────────────────────────
//
// How anyone joins a private group or channel. Before this the only way in was
// an admin adding you by id, so a private chat could not grow at all and a
// public @link was the only self-service route — which forced groups to be
// public just to be joinable.
//
// The code is a random 22-char token, not the chat id: an id is guessable from
// any other chat's URL, and "anyone who can guess an id can walk in" is not an
// invite system.
const crypto = require("crypto");

function newInviteCode() {
  return crypto.randomBytes(16).toString("base64url").slice(0, 22);
}

// Returns the link, creating one on first ask. Owner/admin only — a link is a
// standing invitation to everything said in the chat.
router.post(
  "/:id/invite",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (chat.type === "dm") return res.status(400).json({ error: "Пригласительная ссылка есть только у групп и каналов" });
    if (!isOwnerOrAdminOf(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });

    // `revoke` regenerates: the old code stops working the moment the new one is
    // written, which is the entire reason to have this button.
    const code = chat.inviteCode && !req.body?.revoke ? chat.inviteCode : newInviteCode();
    const updated = chat.inviteCode === code ? chat : await updateChat(chat.id, { inviteCode: code });
    res.json({ code, chat: updated });
  })
);

// What's behind a link, before joining. Deliberately readable without being a
// member — otherwise nobody could ever see what they're being invited to — but
// it returns only what an invitation should show: name, picture, size.
router.get(
  "/invite/:code",
  asyncRoute(async (req, res) => {
    const chat = await findChatByInviteCode(req.params.code);
    if (!chat) return res.status(404).json({ error: "Ссылка недействительна или отозвана" });
    res.json({
      chat: {
        id: chat.id,
        type: chat.type,
        title: chat.title,
        description: chat.description,
        avatarColor: chat.avatarColor,
        avatarImage: chat.avatarImage,
        isVerified: chat.isVerified,
        memberCount: chat.memberIds.length,
        alreadyMember: chat.memberIds.includes(req.uid),
        approveJoins: !!chat.approveJoins,
        // So the screen can say "заявка отправлена" instead of offering a
        // button that would silently do nothing the second time.
        requestPending: joinRequests.hasRequest(chat.id, req.uid),
      },
    });
  })
);

router.post(
  "/invite/:code/join",
  asyncRoute(async (req, res) => {
    const chat = await findChatByInviteCode(req.params.code);
    if (!chat) return res.status(404).json({ error: "Ссылка недействительна или отозвана" });
    if (chat.memberIds.includes(req.uid)) return res.json({ chat });

    // With approval on, the link buys a place in a queue rather than a seat.
    // This is what makes a leaked link survivable: whoever has it still has to
    // get past somebody.
    if (chat.approveJoins) {
      joinRequests.addRequest(chat.id, req.uid);
      const who = await getUser(req.uid);
      broadcastToUsers(
        chat.memberIds.filter((id) => isOwnerOrAdminOf(chat, id)),
        { type: "chat:join-request", chatId: chat.id, user: publicUser(who) }
      );
      return res.json({ pending: true, chat: { id: chat.id, title: chat.title, type: chat.type } });
    }

    const updated = await updateChat(chat.id, { memberIds: [...chat.memberIds, req.uid] });
    // The chat appears for the joiner, and everyone already inside sees the
    // member list change without waiting on a poll.
    broadcastToUsers([req.uid], { type: "chat:added", chat: updated });
    broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
    res.json({ chat: updated });
  })
);

// Deleting a chat for everyone. In a DM either side may (it's half theirs); a
// group or channel belongs to whoever runs it — this used to accept any member,
// so anyone in a group could delete it out from under everybody.
router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (chat.type !== "dm" && !isOwnerOrAdminOf(chat, req.uid)) {
      return res.status(403).json({ error: "Удалить чат для всех может только владелец или админ" });
    }
    // Everyone loses it from their list at once, rather than each person finding
    // out by tapping a chat that 404s.
    broadcastToUsers(chat.memberIds, { type: "chat:deleted", chatId: chat.id });
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

// Debounce-saved from the composer on every keystroke (see composer.js) —
// deliberately not routed through the general PATCH /api/settings (that
// does a shallow merge, so it'd clobber every other chat's draft on every
// save; this does the same read-merge-write as /:id/wallpaper instead).
router.post(
  "/:id/draft",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const { text } = req.body ?? {};
    await setDraft(req.uid, req.params.id, typeof text === "string" ? text : "");
    res.json({ ok: true });
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
    const moderatorIds = chat.moderatorIds?.filter((m) => m !== req.uid);
    let ownerIds = (chat.ownerIds ?? []).filter((m) => m !== req.uid);

    if (memberIds.length === 0) {
      await deleteMessagesForChat(req.params.id);
      await deleteChat(req.params.id);
      return res.json({ ok: true, deleted: true });
    }

    // The chat must never be left without an owner — with nobody flagged, no one
    // could appoint one again. When the last owner walks out, the longest-standing
    // remaining member inherits it, which is what the old single-owner code did.
    if (ownerIds.length === 0) ownerIds = [memberIds[0]];

    await updateChat(req.params.id, {
      memberIds,
      adminIds,
      moderatorIds,
      ownerIds,
      // chats.ownerId is the creator field; it only moves when the creator is the
      // one leaving, and then it follows whoever inherited ownership.
      ownerId: chat.ownerId === req.uid ? ownerIds[0] : chat.ownerId,
    });
    res.json({ ok: true, deleted: false });
  })
);

router.post(
  "/:id/members",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const isOwnerOrAdmin = isOwnerOrAdminOf(chat, req.uid);
    const isModerator = chat.moderatorIds?.includes(req.uid);
    if (!isOwnerOrAdmin && !isModerator) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }

    const { userId, role } = req.body ?? {};
    // A moderator's remit is people, not structure: it can add and remove
    // members, and nothing else.
    if (!isOwnerOrAdmin && !["add", "kick"].includes(role)) {
      return res.status(403).json({ error: "Модератор может только добавлять и удалять участников" });
    }

    if (role === "add") {
      if (chat.memberIds.includes(userId)) {
        return res.status(400).json({ error: "Уже в чате" });
      }
      const user = await getUser(userId);
      if (!user) return res.status(404).json({ error: "Пользователь не найден" });

      // "Who can add me to groups/channels" (Settings → Конфиденциальность) —
      // уровень плюс поимённые исключения (server/lib/privacyRules.js),
      // проверяется по контактам *того, кого добавляют*, а не добавляющего
      // (та же несимметричность, что у просмотра профиля в routes/users.js).
      if (!(await allowsUser(userId, "invites", req.uid))) {
        return res.status(403).json({ error: "Пользователь ограничил добавление в чаты" });
      }

      const updated = await updateChat(req.params.id, { memberIds: [...chat.memberIds, userId] });
      // The newly added member needs to see this chat show up in their own
      // list right away, not just on their next poll.
      broadcastToUsers([userId], { type: "chat:added", chat: updated });
      return res.json({ chat: updated });
    }

    // Handing the chat to someone else. Owner only — an admin promoting itself
    // would make ownership meaningless. The previous owner stays an admin rather
    // than being dropped to a plain member, which is almost never what someone
    // transferring a group wants.
    // A chat can have several owners. "owner" adds one, "unowner" removes one —
    // both owner-only, because an admin able to appoint owners would make the
    // distinction meaningless.
    if (role === "owner" || role === "unowner") {
      if (!isOwner(chat, req.uid)) return res.status(403).json({ error: "Управлять владельцами может только владелец" });
      if (!chat.memberIds.includes(userId)) return res.status(404).json({ error: "Пользователь не в чате" });

      const owners = new Set(chat.ownerIds ?? []);
      if (chat.ownerId) owners.add(chat.ownerId);

      if (role === "owner") {
        owners.add(userId);
      } else {
        if (!owners.has(userId)) return res.status(400).json({ error: "Этот участник не владелец" });
        // Never leave a chat ownerless: with nobody flagged, no one could ever
        // appoint an owner again and the chat would be permanently stuck.
        if (owners.size <= 1) return res.status(400).json({ error: "В чате должен остаться хотя бы один владелец" });
        owners.delete(userId);
      }

      // Owners are admins too — every owner-level action goes through the
      // owner-or-admin gate, and a co-owner who wasn't an admin would be unable
      // to do the admin-level half of the job.
      const admins = new Set(chat.adminIds ?? []);
      if (role === "owner") admins.add(userId);
      const updated = await updateChat(req.params.id, { ownerIds: [...owners], adminIds: [...admins] });
      broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
      return res.json({ chat: updated });
    }

    // Everything below changes a *lower* role, so it must not be aimed at an
    // owner. Removing owner rights goes through "unowner" above.
    if (isOwner(chat, userId)) {
      return res.status(400).json({ error: "Сначала снимите с участника права владельца" });
    }

    // Moderator: can mute and remove members, but cannot touch the chat's own
    // settings or hand out roles. Only the owner and admins may appoint one, and
    // the group has to have reached the level that unlocks the role at all.
    if (role === "mod" || role === "unmod") {
      const isOwnerOrRealAdmin = isOwnerOrAdminOf(chat, req.uid);
      if (!isOwnerOrRealAdmin) return res.status(403).json({ error: "Недостаточно прав" });
      if (!chat.memberIds.includes(userId)) return res.status(404).json({ error: "Пользователь не в чате" });
      const mods = new Set(chat.moderatorIds ?? []);
      if (role === "mod") mods.add(userId);
      else mods.delete(userId);
      const updated = await updateChat(req.params.id, { moderatorIds: [...mods] });
      broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
      return res.json({ chat: updated });
    }

    if (role === "kick") {
      const updated = await updateChat(req.params.id, {
        memberIds: chat.memberIds.filter((m) => m !== userId),
        adminIds: chat.adminIds?.filter((m) => m !== userId),
        // Leaving a stale moderator flag behind would silently restore the role
        // if the same person were ever added back.
        moderatorIds: chat.moderatorIds?.filter((m) => m !== userId),
        ownerIds: chat.ownerIds?.filter((m) => m !== userId),
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

// The label everyone sees next to a member instead of the default role word:
// "владелец", "модератор", or whatever the owner types — "пользователь",
// "дизайнер", anything. Owner-only, because it's shown to the whole chat and
// letting members title themselves turns it into a second bio.
router.post(
  "/:id/title",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (!isOwner(chat, req.uid)) return res.status(403).json({ error: "Менять подписи может только владелец" });

    const { userId, title } = req.body ?? {};
    if (!chat.memberIds.includes(userId)) return res.status(404).json({ error: "Пользователь не в чате" });

    const titles = { ...(chat.memberTitles ?? {}) };
    const clean = String(title ?? "").trim().slice(0, 24);
    // An empty title removes the override rather than storing "", so the member
    // falls back to their real role word.
    if (clean) titles[userId] = clean;
    else delete titles[userId];

    const updated = await updateChat(req.params.id, { memberTitles: titles });
    broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
    res.json({ chat: updated });
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
    const isOwnerOrAdmin = isOwnerOrAdminOf(chat, req.uid);
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
