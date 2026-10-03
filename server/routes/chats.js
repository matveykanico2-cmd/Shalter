const express = require("express");
const { genId } = require("../lib/genId");
const { logExport } = require("../data/dataExport");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getChat, updateChat, deleteChat, createChat, listChats, listChatsForUser, findDmBetween, findChatByInviteCode, findChatByUsername, findChannelByDiscussionChatId, isSecretChat, claimSecretDevice } = require("../data/chats");
const { checkUsername, normalizeUsername } = require("../lib/username");
const { colorUnlocked, lockedColorError, colorState } = require("../lib/chatFeatures");
const { PERMISSIONS, permissionsOf, sanitizePermissions, can } = require("../lib/chatPermissions");
const { deleteMessagesForChat, markChatRead } = require("../data/messages");
const { getSettings, updateSettings, mutedStateFor, setChatCleared, deleteChatForUser, setChatWallpaper, setDraft, clearUnreadMark } = require("../data/settings");
const { allowsUser, recordsReadTime, publicUsersFor } = require("../lib/privacyRules");
const { messageCost } = require("../lib/messagePrice");
const { attachSummaries } = require("../data/chat-summary");
const { listUsers, listUsersByIds, getUser } = require("../data/users");
const { hasAdminSection } = require("../lib/adminAccess");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { findOrCreateDm, sendMessageAndBroadcast, serviceLine } = require("../lib/systemChat");
const { publicUser } = require("../data/sanitize");
const { isSafeUrl } = require("../lib/sanitizeAttachments");
const { getBotByUserId } = require("../data/bots");
const joinRequests = require("../data/joinRequests");
const { markTyping, clearTyping, getTyping, normalizeAction } = require("../data/typing");
const { broadcastToUsers } = require("../ws");
const messagesRouter = require("./messages");
const { logAdminAction, listAdminLog } = require("../data/adminLog");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const chats = await listChatsForUser(req.uid, { deviceId: req.cookies?.device_id ?? null });
    const withSummary = await attachSummaries(chats, req.uid);
    const settings = await getSettings(req.uid);
    const hidden = settings.hiddenChats ?? {};
    const visible = withSummary.filter((c) => {
      if (hidden[c.id] && !c.lastMessage) return false;
      if (c.type === "dm" && !c.lastMessage && !c.draft) return false;
      return true;
    });
    res.json({ chats: visible });
  })
);

router.post(
  "/pinned-order",
  asyncRoute(async (req, res) => {
    const ids = req.body?.chatIds;
    if (!Array.isArray(ids) || ids.length > 500 || !ids.every((id) => typeof id === "string")) {
      return res.status(400).json({ error: "Нужен список чатов" });
    }
    const settings = await getSettings(req.uid);
    const flags = settings.chatFlags ?? {};
    const mine = new Set((await listChatsForUser(req.uid)).map((c) => c.id));
    const wanted = [...new Set(ids)].filter((id) => mine.has(id) && flags[id]?.pinned === true);
    const rest = (settings.pinnedOrder ?? []).filter((id) => !wanted.includes(id));
    await updateSettings(req.uid, { pinnedOrder: [...wanted, ...rest] });
    res.json({ ok: true, pinnedOrder: [...wanted, ...rest] });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { userId, title, avatarColor } = req.body ?? {};

    const self = userId === req.uid;
    if (!self && !(await getUser(userId))) return res.status(404).json({ error: "Пользователь не найден" });
    const existing = await findDmBetween(req.uid, self ? req.uid : userId);
    if (existing) return res.json({ chat: existing });

    const chat = await createChat({
      id: genId("c"),
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

// Секретный чат: личка со своим ключом шифрования, привязанная к устройству.
// Можно завести несколько с одним человеком — как в Telegram.
router.post(
  "/secret",
  asyncRoute(async (req, res) => {
    const userId = req.body?.userId;
    const deviceId = req.cookies?.device_id;
    if (!deviceId) return res.status(400).json({ error: "Не удалось определить устройство" });
    if (typeof userId !== "string" || userId === req.uid) return res.status(400).json({ error: "Выберите собеседника" });
    const other = await getUser(userId);
    if (!other) return res.status(404).json({ error: "Пользователь не найден" });
    if (other.isBot) return res.status(400).json({ error: "С ботом секретный чат не начать" });
    if ((other.blockedUserIds ?? []).includes(req.uid)) return res.status(403).json({ error: "Пользователь заблокировал вас" });

    const chat = await createChat({
      id: genId("c"),
      type: "dm",
      title: "",
      memberIds: [req.uid, userId],
      pinned: false,
      muted: false,
      archived: false,
      createdAt: new Date().toISOString(),
      secret: true,
      secretDevices: { [req.uid]: deviceId },
    });
    // Без сообщения пустая личка не показывается в списке чатов.
    await serviceLine(chat, req.uid, (name) => `🔒 ${name} начал(а) секретный чат. Сообщения шифруются ключом этого чата, их нельзя переслать, а сам чат доступен только на этом устройстве.`);
    res.json({ chat: await getChat(chat.id) });
  })
);

// Секретный чат доступен только с «своего» устройства. Собеседник привязывает
// его, открыв в первый раз; с других его устройств чата как будто нет.
router.use(
  "/:id",
  asyncRoute(async (req, res, next) => {
    if (!isSecretChat(req.params.id)) return next();
    const chat = await getChat(req.params.id);
    if (!chat?.memberIds.includes(req.uid) || !claimSecretDevice(chat.id, req.uid, req.cookies?.device_id)) {
      return res.status(404).json({ error: "not found" });
    }
    next();
  })
);

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

router.post(
  "/channels",
  asyncRoute(async (req, res) => {
    const { title, avatarImage, memberIds, adminIds } = req.body ?? {};
    if (!title?.trim()) return res.status(400).json({ error: "Введите название канала" });
    const identity = await resolveNewChatIdentity(req.body ?? {});
    if (identity.error) return res.status(identity.error.status).json({ error: identity.error.error });
    const now = new Date().toISOString();
    const members = new Set([req.uid, ...(await invitableIds(memberIds, req.uid))]);
    const admins = new Set([req.uid, ...(Array.isArray(adminIds) ? adminIds.filter((id) => members.has(id)) : [])]);
    const discussion = await createChat({
      id: genId("c"),
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
      id: genId("c"),
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
    await serviceNote(channel, null, () => `Канал «${channel.title}» создан`);
    await serviceNote(discussion, null, () => `Группа обсуждения канала «${channel.title}» создана`);
    res.json({ chat: channel });
  })
);

router.post(
  "/groups",
  asyncRoute(async (req, res) => {
    const { title, memberIds, avatarImage, adminIds } = req.body ?? {};
    if (!title?.trim()) return res.status(400).json({ error: "Введите название группы" });
    const identity = await resolveNewChatIdentity(req.body ?? {});
    if (identity.error) return res.status(identity.error.status).json({ error: identity.error.error });
    const members = new Set([req.uid, ...(await invitableIds(memberIds, req.uid))]);
    const admins = new Set([req.uid, ...(Array.isArray(adminIds) ? adminIds.filter((id) => members.has(id)) : [])]);
    const chat = await createChat({
      id: genId("c"),
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
    await serviceNote(chat, req.uid, (name) => `${name} создал(а) группу «${chat.title}»`);
    res.json({ chat });
  })
);

// Creating a chat with people in it is the same act as adding them, so it honours
// the same "who can add me to chats" privacy setting the add-member route checks.
async function invitableIds(ids, actorId) {
  if (!Array.isArray(ids)) return [];
  const out = [];
  for (const id of new Set(ids)) {
    if (typeof id !== "string" || id === actorId || !(await getUser(id))) continue;
    if (await allowsUser(id, "invites", actorId)) out.push(id);
  }
  return out;
}

function durationLabel(sec) {
  if (sec % 86400 === 0) {
    const d = sec / 86400;
    return d === 7 ? "1 неделя" : d === 30 || d === 31 ? "1 месяц" : `${d} дн.`;
  }
  if (sec % 3600 === 0) return `${sec / 3600} ч`;
  if (sec % 60 === 0) return `${sec / 60} мин`;
  return `${sec} с`;
}

// Служебные строки в ленте группы о смене ролей, как в Telegram. kick/ban/add
// и передача владения объявляются в своих ветках отдельно.
const ROLE_NOTES = {
  promote: (a, t) => `${a} назначил(а) ${t} администратором`,
  demote: (a, t, self) => (self ? `${a} больше не администратор` : `${a} снял(а) ${t} с должности администратора`),
  mod: (a, t) => `${a} назначил(а) ${t} модератором`,
  unmod: (a, t) => `${a} снял(а) ${t} с должности модератора`,
  owner: (a, t) => `${a} сделал(а) ${t} совладельцем группы`,
  unowner: (a, t) => `${a} снял(а) с ${t} права владельца`,
  unban: (a, t) => `${a} разблокировал(а) ${t}`,
};

function announceRole(chat, actorId, targetId, role) {
  const build = ROLE_NOTES[role];
  if (!build || chat.type !== "group") return;
  (async () => {
    const target = targetId ? await getUser(targetId) : null;
    await serviceNote(chat, actorId, (name) => build(name, target?.name ?? "участника", actorId === targetId));
  })().catch((err) => console.error("role note failed:", err));
}

async function serviceNote(chat, actorId, build) {
  const actor = actorId ? await getUser(actorId) : null;
  const name = actor?.name ?? "Кто-то";
  const text = build(name, actor);
  if (!text) return null;
  return sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, text, { type: "system" });
}

// Приветствие новому участнику группы, если админы его задали. {name} —
// имя вступившего.
async function sendWelcome(chat, userId) {
  if (chat.type !== "group" || !chat.welcomeText) return;
  try {
    const user = await getUser(userId);
    if (!user || user.isBot) return;
    const text = chat.welcomeText.replaceAll("{name}", user.name ?? "");
    await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, `👋 ${text}`, { type: "system" });
  } catch (err) {
    console.error("welcome message failed:", err);
  }
}

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
    const users = await listUsersByIds(chat.memberIds);
    const byId = new Map(users.map((u) => [u.id, u]));
    const memberUsers = chat.memberIds
      .map((mid) => byId.get(mid))
      .filter((u) => u !== undefined);
    const members = await publicUsersFor(memberUsers, req.uid);

    const botMember = members.find((u) => u.isBot && u.id !== req.uid);
    const bot = botMember ? await getBotByUserId(botMember.id) : null;
    const commands = bot?.commands?.length ? bot.commands : null;

    let paidMessages = null;
    if (chat.type === "dm") {
      const other = users.find((u) => u.id !== req.uid);
      if (other && !other.isBot) {
        const { price, mustPay } = await messageCost(req.uid, other, chat.id);
        if (price > 0) paidMessages = { stars: price, youPay: mustPay };
      }
    } else if (chat.type === "group") {
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
    // Только эти поля можно менять через этот маршрут. Раньше тело запроса
    // целиком уходило в updateChat — и любой участник мог вписать себя в
    // ownerIds/adminIds, поменять memberIds, снять баны или права.
    const body = req.body ?? {};
    const patch = {};
    if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 128);
    if ("title" in patch && !patch.title) return res.status(400).json({ error: "Название не может быть пустым" });
    if (typeof body.description === "string") patch.description = body.description.trim().slice(0, 500) || null;
    if ("avatarImage" in body) {
      if (body.avatarImage && !(typeof body.avatarImage === "string" && isSafeUrl(body.avatarImage))) {
        return res.status(400).json({ error: "Некорректное изображение" });
      }
      patch.avatarImage = body.avatarImage || null;
    }
    if (typeof body.avatarColor === "string") patch.avatarColor = body.avatarColor.slice(0, 32);
    if ("autoDeleteSeconds" in body) {
      const sec = Number(body.autoDeleteSeconds) || 0;
      if (!Number.isInteger(sec) || sec < 0 || sec > 366 * 86400) return res.status(400).json({ error: "Некорректный срок автоудаления" });
      patch.autoDeleteSeconds = sec || null;
    }
    for (const k of ["pinned", "archived", "muted", "unread"]) if (k in body) patch[k] = !!body[k];

    if ("avatarColor" in patch && !colorUnlocked(chat, patch.avatarColor)) {
      return res.status(403).json({ error: lockedColorError(patch.avatarColor) });
    }
    const EDITABLE_BY_STAFF = ["title", "description", "avatarImage", "avatarColor", "autoDeleteSeconds"];
    if (chat.type !== "dm" && EDITABLE_BY_STAFF.some((k) => k in patch) && !isOwnerOrAdminOf(chat, req.uid)) {
      return res.status(403).json({ error: "Менять настройки чата могут владельцы и админы" });
    }

    const PERSONAL = ["pinned", "archived", "muted", "unread"];
    const personal = PERSONAL.filter((k) => k in patch);
    if (personal.length) {
      const settings = await getSettings(req.uid);
      const chatFlags = { ...(settings.chatFlags ?? {}) };
      const flags = { ...(chatFlags[chat.id] ?? {}) };
      if ("pinned" in patch) flags.pinned = !!patch.pinned;
      if ("archived" in patch) {
        flags.archived = !!patch.archived;
        if (flags.archived) flags.archivedAt = new Date().toISOString();
        else delete flags.archivedAt;
      }
      if ("muted" in patch) flags.muted = !!patch.muted;
      if (patch.unread) flags.unread = true;
      else if ("unread" in patch) delete flags.unread;
      chatFlags[chat.id] = flags;
      const next = { chatFlags };
      if ("pinned" in patch) {
        const order = (settings.pinnedOrder ?? []).filter((id) => id !== chat.id);
        next.pinnedOrder = patch.pinned ? [chat.id, ...order] : order;
      }
      if ("muted" in patch) {
        const mutedChats = { ...(settings.notifications?.mutedChats ?? {}) };
        if (patch.muted) mutedChats[chat.id] = true;
        else delete mutedChats[chat.id];
        next.notifications = { ...settings.notifications, mutedChats };
      }
      await updateSettings(req.uid, next);
      for (const k of PERSONAL) delete patch[k];
    }
    if (!Object.keys(patch).length) {
      const [summary] = await attachSummaries([chat], req.uid);
      return res.json({ chat: summary });
    }

    const updated = await updateChat(req.params.id, patch);
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    if (chat.type !== "dm") {
      for (const k of ["title", "description", "avatarImage", "autoDeleteSeconds"]) {
        if (k in patch && patch[k] !== chat[k]) logAdminAction(chat.id, req.uid, `chat_${k}`, { details: k === "avatarImage" ? null : { value: patch[k] } });
      }
    }
    if (chat.type === "group" || chat.type === "channel") {
      const where = chat.type === "channel" ? "канала" : "группы";
      if (typeof patch.title === "string" && patch.title.trim() && patch.title.trim() !== chat.title) {
        await serviceNote(updated, req.uid, (name) =>
          chat.type === "channel" ? `Название канала изменено на «${updated.title}»` : `${name} изменил(а) название группы на «${updated.title}»`
        );
      }
      if ("description" in patch && (patch.description ?? null) !== (chat.description ?? null)) {
        await serviceNote(updated, req.uid, (name) =>
          chat.type === "channel" ? null : patch.description ? `${name} изменил(а) описание группы` : `${name} удалил(а) описание группы`
        );
      }
      if ("autoDeleteSeconds" in patch && (patch.autoDeleteSeconds ?? null) !== (chat.autoDeleteSeconds ?? null)) {
        await serviceNote(updated, req.uid, (name) =>
          patch.autoDeleteSeconds ? `${name} включил(а) автоудаление сообщений: ${durationLabel(patch.autoDeleteSeconds)}` : `${name} выключил(а) автоудаление сообщений`
        );
      }
      if ("avatarImage" in patch && patch.avatarImage !== chat.avatarImage) {
        await serviceNote(updated, req.uid, (name) =>
          patch.avatarImage
            ? chat.type === "channel" ? `Фото ${where} обновлено` : `${name} изменил(а) фото группы`
            : chat.type === "channel" ? `Фото ${where} удалено` : `${name} удалил(а) фото группы`
        );
      }
    }
    res.json({ chat: updated });
  })
);

router.get(
  "/:id/features",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    res.json({ colors: colorState(chat), points: chat.points ?? 0 });
  })
);

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
        banned: (chat.bannedIds ?? []).includes(req.uid),
        approveJoins: !!chat.approveJoins,
        requestPending: joinRequests.hasRequest(chat.id, req.uid),
      },
    });
  })
);

// Join a public group or channel straight from its @username.
router.post(
  "/:id/join",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.isPublic || (chat.type !== "group" && chat.type !== "channel")) {
      return res.status(404).json({ error: "Чат не найден" });
    }
    if (chat.memberIds.includes(req.uid)) return res.json({ chat });
    if ((chat.bannedIds ?? []).includes(req.uid)) return res.status(403).json({ error: "Вас заблокировали в этом чате" });

    if (chat.approveJoins) {
      joinRequests.addRequest(chat.id, req.uid);
      const who = await getUser(req.uid);
      broadcastToUsers(
        chat.memberIds.filter((id) => isOwnerOrAdminOf(chat, id)),
        { type: "chat:join-request", chatId: chat.id, user: publicUser(who) }
      );
      return res.json({ pending: true });
    }

    const updated = await updateChat(chat.id, { memberIds: [...chat.memberIds, req.uid] });
    broadcastToUsers([req.uid], { type: "chat:added", chat: updated });
    if (chat.type === "group") {
      broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
      const joiner = await getUser(req.uid);
      await sendMessageAndBroadcast(updated, SYSTEM_BOT_ID, `${joiner?.name ?? "Кто-то"} вступил(а) в группу`, { type: "system" });
      await sendWelcome(updated, req.uid);
    }
    res.json({ chat: updated });
  })
);

router.get(
  "/:id/banned",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (!isOwnerOrAdminOf(chat, req.uid) && !chat.moderatorIds?.includes(req.uid)) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    const users = await Promise.all((chat.bannedIds ?? []).map(async (id) => publicUser(await getUser(id))));
    res.json({ users: users.filter(Boolean) });
  })
);

router.post(
  "/:id/public",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
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

    const username = normalizeUsername(req.body?.username);
    const problem = await checkUsername(username, { forChatId: chat.id });
    if (problem) return res.status(problem.status).json({ error: problem.error });

    const updated = await updateChat(req.params.id, { isPublic: true, username });
    res.json({ chat: updated });
  })
);

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
      return res.json({ ok: true, approved: false });
    }

    if ((chat.bannedIds ?? []).includes(req.params.userId)) return res.status(409).json({ error: "Пользователь заблокирован в этом чате" });
    const updated = await updateChat(chat.id, { memberIds: [...new Set([...chat.memberIds, req.params.userId])] });
    logAdminAction(chat.id, req.uid, "join_approve", { targetId: req.params.userId });
    broadcastToUsers([req.params.userId], { type: "chat:added", chat: updated });
    broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
    await sendWelcome(updated, req.params.userId);
    res.json({ ok: true, approved: true, chat: updated });
  })
);

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
    if ("anonymousAdmins" in (req.body ?? {}) && chat.type === "group") patch.anonymousAdmins = !!req.body.anonymousAdmins;
    if (!Object.keys(patch).length) return res.status(400).json({ error: "Нечего менять" });
    const updated = await updateChat(chat.id, patch);
    logAdminAction(chat.id, req.uid, "settings", { details: patch });
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    res.json({ chat: updated });
  })
);

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
    logAdminAction(chat.id, req.uid, "permissions");
    await serviceNote(updated, req.uid, (name) => `${name} изменил(а) права участников`);
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    res.json({ chat: updated, permissions: permissionsOf(updated) });
  })
);

router.post(
  "/:id/reactions",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (chat.type !== "channel") return res.status(400).json({ error: "Список реакций настраивается только у каналов" });
    if (!isOwnerOrAdminOf(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });
    const list = req.body?.reactions;
    const allowedReactions = Array.isArray(list)
      ? [...new Set(list.map((e) => String(e).trim()).filter(Boolean))].slice(0, 20)
      : null;
    const updated = await updateChat(chat.id, { allowedReactions });
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    res.json({ chat: updated });
  })
);

router.post(
  "/:id/discussion",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (chat.type !== "channel") return res.status(400).json({ error: "Обсуждение есть только у каналов" });
    if (!isOwnerOrAdminOf(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });

    const action = req.body?.action;

    if (action === "unlink") {
      const updated = await updateChat(chat.id, { linkedDiscussionChatId: null });
      broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
      return res.json({ chat: updated, discussion: null });
    }

    if (action === "link") {
      const group = await getChat(req.body?.groupId);
      if (!group || group.type !== "group") return res.status(404).json({ error: "Группа не найдена" });
      if (!isOwnerOrAdminOf(group, req.uid)) return res.status(403).json({ error: "Вы не администратор этой группы" });
      const taken = (await listChats()).find((c) => c.id !== chat.id && c.linkedDiscussionChatId === group.id);
      if (taken) return res.status(409).json({ error: `Эта группа уже обсуждение канала «${taken.title}»` });

      const updated = await updateChat(chat.id, { linkedDiscussionChatId: group.id });
      broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
      return res.json({ chat: updated, discussion: group });
    }

    if (action === "create") {
      const discussion = await createChat({
        id: genId("c"),
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

    const settings = await getSettings(req.uid);
    const mutedChats = { ...(settings.notifications?.mutedChats ?? {}) };
    if (value === null) delete mutedChats[chat.id];
    else mutedChats[chat.id] = value;
    await updateSettings(req.uid, { notifications: { ...settings.notifications, mutedChats } });

    const state = mutedStateFor({ notifications: { mutedChats } }, chat.id);
    res.json({ chat: { ...chat, ...state } });
  })
);

router.post(
  "/:id/slow-mode",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (chat.type !== "group") return res.status(400).json({ error: "Медленный режим есть только у групп" });
    if (!isOwnerOrAdminOf(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });
    const seconds = Math.max(0, Math.min(3600, Math.trunc(Number(req.body?.seconds) || 0)));
    const updated = await updateChat(chat.id, { slowModeSeconds: seconds || null });
    logAdminAction(chat.id, req.uid, "slow_mode", { details: { seconds } });
    if ((chat.slowModeSeconds ?? 0) !== seconds) {
      await serviceNote(updated, req.uid, (name) => (seconds ? `${name} включил(а) медленный режим: ${durationLabel(seconds)}` : `${name} выключил(а) медленный режим`));
    }
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    res.json({ chat: updated, slowModeSeconds: updated.slowModeSeconds ?? 0 });
  })
);

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
    if (updated.linkedDiscussionChatId) {
      broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: { id: updated.linkedDiscussionChatId } });
    }
    res.json({ chat: updated, commentPriceStars: updated.commentPriceStars ?? 0 });
  })
);

const crypto = require("crypto");

function newInviteCode() {
  return crypto.randomBytes(16).toString("base64url").slice(0, 22);
}

router.post(
  "/:id/invite",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (chat.type === "dm") return res.status(400).json({ error: "Пригласительная ссылка есть только у групп и каналов" });
    if (!isOwnerOrAdminOf(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });

    const code = chat.inviteCode && !req.body?.revoke ? chat.inviteCode : newInviteCode();
    const updated = chat.inviteCode === code ? chat : await updateChat(chat.id, { inviteCode: code });
    res.json({ code, chat: updated });
  })
);

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
        banned: (chat.bannedIds ?? []).includes(req.uid),
        approveJoins: !!chat.approveJoins,
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
    if ((chat.bannedIds ?? []).includes(req.uid)) return res.status(403).json({ error: "Вас заблокировали в этом чате" });

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
    broadcastToUsers([req.uid], { type: "chat:added", chat: updated });
    broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
    if (chat.type === "group") {
      const joiner = await getUser(req.uid);
      await sendMessageAndBroadcast(updated, SYSTEM_BOT_ID, `${joiner?.name ?? "Кто-то"} вступил(а) в группу по ссылке-приглашению`, {
        type: "system",
      });
      await sendWelcome(updated, req.uid);
    }
    res.json({ chat: updated });
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat) return res.status(404).json({ error: "not found" });
    const member = chat.memberIds.includes(req.uid);
    const ownStaff = member && (chat.type === "dm" || chat.type === "bot" || isOwnerOrAdminOf(chat, req.uid));
    const moderator =
      !ownStaff && chat.type !== "dm" && hasAdminSection(await getUser(req.uid), "moderation");
    if (!member && !moderator) return res.status(404).json({ error: "not found" });
    if (!ownStaff && !moderator) {
      return res.status(403).json({ error: "Удалить чат для всех может только владелец или админ" });
    }
    broadcastToUsers(chat.memberIds, { type: "chat:deleted", chatId: chat.id });
    await deleteMessagesForChat(req.params.id);
    await deleteChat(req.params.id);
    if (moderator) {
      const kind = chat.type === "channel" ? "Канал" : "Группа";
      const reason = String(req.body?.reason ?? "").trim().slice(0, 500);
      const owners = [...new Set([chat.ownerId, ...(chat.ownerIds ?? [])].filter(Boolean))];
      // Журнал модерации — тот же, что у удаления аккаунтов (admin.js).
      try {
        logExport({
          adminId: req.uid,
          targetUserId: owners[0] ?? req.uid,
          reason: `УДАЛЕНИЕ ${chat.type === "channel" ? "КАНАЛА" : "ГРУППЫ"} «${chat.title ?? ""}»${chat.username ? ` @${chat.username}` : ""} (${chat.id}): ${reason || "нарушение правил"}`,
          messageCount: 0,
        });
      } catch (err) {
        console.error("moderation log failed:", err);
      }
      for (const ownerId of owners) {
        const dm = await findOrCreateDm(SYSTEM_BOT_ID, ownerId);
        await sendMessageAndBroadcast(
          dm,
          SYSTEM_BOT_ID,
          `🛡 ${kind} «${chat.title ?? chat.name}» удалён${chat.type === "channel" ? "" : "а"} модерацией Shalter за нарушение правил.${reason ? `\nПричина: ${reason}` : ""}`
        );
      }
    }
    res.json({ ok: true });
  })
);

router.post(
  "/:id/clear",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const forEveryone = !!(req.body ?? {}).forEveryone;
    if (forEveryone && chat.type !== "dm" && !isOwnerOrAdminOf(chat, req.uid)) {
      return res.status(403).json({ error: "Очистить историю у всех могут только владельцы и админы" });
    }
    if (forEveryone) {
      await deleteMessagesForChat(req.params.id);
    } else {
      await setChatCleared(req.uid, req.params.id, new Date().toISOString());
    }
    res.json({ ok: true });
  })
);

router.post(
  "/:id/wallpaper",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const { wallpaper, forEveryone, label } = req.body ?? {};
    if (forEveryone && chat.type !== "dm" && !isOwnerOrAdminOf(chat, req.uid)) {
      return res.status(403).json({ error: "Менять фон для всех могут только владельцы и админы" });
    }
    if (forEveryone) {
      const updated = await updateChat(chat.id, { wallpaper: wallpaper ?? null });
      broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
      const what = typeof label === "string" && label.trim() ? label.trim().slice(0, 40) : null;
      await serviceNote(updated, req.uid, (name) =>
        !wallpaper ? `${name} сбросил(а) фон чата` : what ? `${name} поменял(а) фон чата на «${what}»` : `${name} поменял(а) фон чата`
      );
      return res.json({ chat: updated });
    }
    const settings = await setChatWallpaper(req.uid, req.params.id, wallpaper ?? null);
    res.json({ settings });
  })
);

router.post(
  "/:id/draft",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const { text } = req.body ?? {};
    await setDraft(req.uid, req.params.id, typeof text === "string" ? text.slice(0, 8192) : "");
    res.json({ ok: true });
  })
);

router.post(
  "/:id/read",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const recordTime = await recordsReadTime(chat, req.uid);
    const changedIds = await markChatRead(req.params.id, req.uid, { recordTime });
    await clearUnreadMark(req.uid, req.params.id);
    if (changedIds.length > 0) {
      broadcastToUsers(
        chat.memberIds.filter((m) => m !== req.uid),
        { type: "message:read", chatId: req.params.id, readerId: req.uid, messageIds: changedIds, readAt: recordTime ? new Date().toISOString() : undefined }
      );
    }
    res.json({ ok: true, count: changedIds.length });
  })
);

router.post(
  "/:id/delete-for-me",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    await deleteChatForUser(req.uid, req.params.id, new Date().toISOString());
    res.json({ ok: true });
  })
);

router.post(
  "/:id/leave",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const memberIds = chat.memberIds.filter((m) => m !== req.uid);
    const adminIds = chat.adminIds?.filter((m) => m !== req.uid);
    const moderatorIds = chat.moderatorIds?.filter((m) => m !== req.uid);
    // Chats created before ownerIds existed only carry ownerId; it must count here, or
    // any ordinary member leaving would hand ownership to whoever is listed first.
    let ownerIds = [...new Set([chat.ownerId, ...(chat.ownerIds ?? [])])].filter((m) => m && m !== req.uid);

    if (memberIds.length === 0) {
      await deleteMessagesForChat(req.params.id);
      await deleteChat(req.params.id);
      return res.json({ ok: true, deleted: true });
    }

    // Владельцем становится админ, а не первый попавшийся подписчик.
    if (ownerIds.length === 0) ownerIds = [(adminIds ?? []).find((m) => memberIds.includes(m)) ?? memberIds[0]];

    const afterLeave = await updateChat(req.params.id, {
      memberIds,
      adminIds,
      moderatorIds,
      ownerIds,
      ownerId: chat.ownerId === req.uid ? ownerIds[0] : chat.ownerId,
    });
    broadcastToUsers(memberIds, { type: "chat:updated", chat: afterLeave });
    if (chat.type === "group") await serviceNote(afterLeave, req.uid, (name) => `${name} покинул(а) группу`);
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
    const memberMayAdd = req.body?.role === "add" && chat.type === "group" && can(chat, req.uid, "addMembers");
    if (!isOwnerOrAdmin && !isModerator && !memberMayAdd) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }

    const { userId, role } = req.body ?? {};
    const log = () => {
      logAdminAction(chat.id, req.uid, `member_${role}`, { targetId: userId });
      announceRole(chat, req.uid, userId, role);
    };
    if (!isOwnerOrAdmin && !["add", "kick", "ban", "unban"].includes(role)) {
      return res.status(403).json({ error: "Модератор может только добавлять и удалять участников" });
    }

    if (role === "unban") {
      const updated = await updateChat(req.params.id, { bannedIds: (chat.bannedIds ?? []).filter((m) => m !== userId) });
      log();
      return res.json({ chat: updated });
    }

    if (role === "add") {
      if (chat.memberIds.includes(userId)) {
        return res.status(400).json({ error: "Уже в чате" });
      }
      const user = await getUser(userId);
      if (!user) return res.status(404).json({ error: "Пользователь не найден" });

      if (!(await allowsUser(userId, "invites", req.uid))) {
        return res.status(403).json({ error: "Пользователь ограничил добавление в чаты" });
      }
      const wasBanned = (chat.bannedIds ?? []).includes(userId);
      if (wasBanned && !isOwnerOrAdmin && !isModerator) {
        return res.status(403).json({ error: "Пользователь заблокирован в этом чате" });
      }

      const updated = await updateChat(req.params.id, {
        memberIds: [...chat.memberIds, userId],
        ...(wasBanned ? { bannedIds: chat.bannedIds.filter((m) => m !== userId) } : {}),
      });
      broadcastToUsers([userId], { type: "chat:added", chat: updated });
      if (chat.type === "group" || user.isBot) {
        const actor = await getUser(req.uid);
        await sendMessageAndBroadcast(updated, SYSTEM_BOT_ID, user.isBot ? `${actor?.name ?? "Кто-то"} добавил(а) бота ${user.name}` : `${actor?.name ?? "Кто-то"} добавил(а) в группу ${user.name}`, {
          type: "system",
        });
        await sendWelcome(updated, userId);
      }
      log();
      return res.json({ chat: updated });
    }

    if (role === "owner" || role === "unowner") {
      if (!isOwner(chat, req.uid)) return res.status(403).json({ error: "Управлять владельцами может только владелец" });
      if (!chat.memberIds.includes(userId)) return res.status(404).json({ error: "Пользователь не в чате" });

      const owners = new Set(chat.ownerIds ?? []);
      if (chat.ownerId) owners.add(chat.ownerId);

      if (role === "owner") {
        owners.add(userId);
      } else {
        if (!owners.has(userId)) return res.status(400).json({ error: "Этот участник не владелец" });
        if (owners.size <= 1) return res.status(400).json({ error: "В чате должен остаться хотя бы один владелец" });
        owners.delete(userId);
      }

      const admins = new Set(chat.adminIds ?? []);
      if (role === "owner") admins.add(userId);
      // Снимаемый мог быть основным владельцем (chat.ownerId) — иначе isOwner()
      // продолжал бы его пускать.
      const ownerId = owners.has(chat.ownerId) ? chat.ownerId : [...owners][0];
      const updated = await updateChat(req.params.id, { ownerId, ownerIds: [...owners], adminIds: [...admins] });
      broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
      log();
      return res.json({ chat: updated });
    }

    // Передача владения, как в Telegram: новый владелец — единственный,
    // прежний остаётся администратором.
    if (role === "transfer") {
      if (!isOwner(chat, req.uid)) return res.status(403).json({ error: "Передать чат может только владелец" });
      if (userId === req.uid) return res.status(400).json({ error: "Вы уже владелец" });
      if (!chat.memberIds.includes(userId)) return res.status(404).json({ error: "Пользователь не в чате" });
      const target = await getUser(userId);
      if (!target) return res.status(404).json({ error: "Пользователь не найден" });
      if (target.isBot) return res.status(400).json({ error: "Бота нельзя сделать владельцем" });
      const admins = new Set(chat.adminIds ?? []);
      admins.add(userId);
      admins.add(req.uid);
      const updated = await updateChat(req.params.id, { ownerId: userId, ownerIds: [userId], adminIds: [...admins] });
      broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
      const actor = await getUser(req.uid);
      await sendMessageAndBroadcast(updated, SYSTEM_BOT_ID, `${actor?.name ?? "Кто-то"} передал(а) права владельца: ${target.name}`, { type: "system" });
      log();
      return res.json({ chat: updated });
    }

    if (isOwner(chat, userId)) {
      return res.status(400).json({ error: "Сначала снимите с участника права владельца" });
    }

    if (role === "mod" || role === "unmod") {
      const isOwnerOrRealAdmin = isOwnerOrAdminOf(chat, req.uid);
      if (!isOwnerOrRealAdmin) return res.status(403).json({ error: "Недостаточно прав" });
      if (!chat.memberIds.includes(userId)) return res.status(404).json({ error: "Пользователь не в чате" });
      const mods = new Set(chat.moderatorIds ?? []);
      if (role === "mod") mods.add(userId);
      else mods.delete(userId);
      const updated = await updateChat(req.params.id, { moderatorIds: [...mods] });
      broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
      log();
      return res.json({ chat: updated });
    }

    if (role === "kick" || role === "ban") {
      if (!chat.memberIds.includes(userId)) return res.status(404).json({ error: "Пользователь не в чате" });
      if ((chat.adminIds ?? []).includes(userId) && !isOwner(chat, req.uid)) {
        return res.status(403).json({ error: "Удалить администратора может только владелец" });
      }
      const kicked = await getUser(userId);
      const updated = await updateChat(req.params.id, {
        memberIds: chat.memberIds.filter((m) => m !== userId),
        adminIds: chat.adminIds?.filter((m) => m !== userId),
        moderatorIds: chat.moderatorIds?.filter((m) => m !== userId),
        ownerIds: chat.ownerIds?.filter((m) => m !== userId),
        ...(role === "ban" ? { bannedIds: [...new Set([...(chat.bannedIds ?? []), userId])] } : {}),
      });
      joinRequests.removeRequest(chat.id, userId);
      broadcastToUsers([userId], { type: "chat:deleted", chatId: chat.id });
      broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
      if (chat.type === "group" && kicked) {
        const actor = await getUser(req.uid);
        await sendMessageAndBroadcast(updated, SYSTEM_BOT_ID, `${actor?.name ?? "Кто-то"} ${role === "ban" ? "заблокировал(а)" : "удалил(а) из группы"} ${kicked.name}`, {
          type: "system",
        });
      }
      log();
      return res.json({ chat: updated });
    }
    if (role === "promote") {
      if (!chat.memberIds.includes(userId)) return res.status(404).json({ error: "Пользователь не в чате" });
      const admins = new Set(chat.adminIds ?? []);
      admins.add(userId);
      const updated = await updateChat(req.params.id, { adminIds: [...admins] });
      broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
      log();
      return res.json({ chat: updated });
    }
    if (role === "demote") {
      if (userId !== req.uid && !isOwner(chat, req.uid)) {
        return res.status(403).json({ error: "Снять другого администратора может только владелец" });
      }
      const updated = await updateChat(req.params.id, {
        adminIds: (chat.adminIds ?? []).filter((m) => m !== userId),
      });
      broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
      log();
      return res.json({ chat: updated });
    }
    res.status(400).json({ error: "unknown role" });
  })
);

router.post(
  "/:id/title",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const { userId, title } = req.body ?? {};
    if (!chat.memberIds.includes(userId)) return res.status(404).json({ error: "Пользователь не в чате" });
    // Теги участников, как в Telegram: владелец ставит кому угодно, админ — всем,
    // кроме владельцев и других админов, участник — себе, если группа разрешает.
    const self = userId === req.uid;
    const allowed = isOwner(chat, req.uid)
      ? true
      : self
        ? isOwnerOrAdminOf(chat, req.uid) || can(chat, req.uid, "setOwnTag")
        : isOwnerOrAdminOf(chat, req.uid) && !isOwnerOrAdminOf(chat, userId);
    if (!allowed) return res.status(403).json({ error: "Недостаточно прав, чтобы менять этот тег" });

    const titles = { ...(chat.memberTitles ?? {}) };
    const clean = String(title ?? "").trim().slice(0, 24);
    if (clean) titles[userId] = clean;
    else delete titles[userId];

    const updated = await updateChat(req.params.id, { memberTitles: titles });
    if (!self) logAdminAction(chat.id, req.uid, "member_tag", { targetId: userId, details: { value: clean || null } });
    broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
    res.json({ chat: updated });
  })
);

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
    logAdminAction(chat.id, req.uid, until ? "member_restrict" : "member_unrestrict", { targetId: userId, details: until ? { until } : null });
    if (chat.type === "group") {
      const target = await getUser(userId);
      const who = target?.name ?? "участнику";
      await serviceNote(updated, req.uid, (name) =>
        !until
          ? `${name} снова разрешил(а) писать ${who}`
          : until === "forever"
            ? `${name} запретил(а) писать ${who}`
            : `${name} запретил(а) писать ${who} до ${new Date(until).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} (МСК)`
      );
    }
    res.json({ chat: updated });
  })
);

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
    const typing = getTyping(req.params.id, req.uid);
    res.json({ typingUserId: typing?.userId ?? null, typingAction: typing?.action ?? null });
  })
);

router.post(
  "/:id/typing",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    const cancel = req.body?.action === "cancel";
    const action = cancel ? "cancel" : normalizeAction(req.body?.action);
    if (cancel) clearTyping(req.params.id, req.uid);
    else markTyping(req.params.id, req.uid, action);
    broadcastToUsers(chat.memberIds.filter((id) => id !== req.uid), {
      type: "typing:update",
      chatId: req.params.id,
      userId: req.uid,
      action,
    });
    res.json({ ok: true });
  })
);

router.post(
  "/:id/welcome",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (chat.type !== "group") return res.status(400).json({ error: "Приветствие есть только у групп" });
    if (!isOwnerOrAdminOf(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });
    const text = String(req.body?.text ?? "").trim().slice(0, 1000);
    const updated = await updateChat(chat.id, { welcomeText: text || null });
    logAdminAction(chat.id, req.uid, "welcome", { details: { value: text || null } });
    if ((chat.welcomeText ?? "") !== text) {
      await serviceNote(updated, req.uid, (name) => (text ? `${name} изменил(а) приветствие для новых участников` : `${name} выключил(а) приветствие`));
    }
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    res.json({ chat: updated, welcomeText: updated.welcomeText ?? "" });
  })
);

// Запрет пересылки и сохранения в личной переписке: включает любой из двоих
// (с Premium), действует на обоих, снять может только тот, кто включил.
router.post(
  "/:id/protect",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (chat.type !== "dm") return res.status(400).json({ error: "Только для личных чатов" });
    const on = !!req.body?.enabled;
    const list = new Set(chat.protectedBy ?? []);
    if (on) {
      const me = await getUser(req.uid);
      if (!me?.isPremium) return res.status(402).json({ error: "Запрет пересылки доступен с Premium", premiumHelps: true });
      list.add(req.uid);
    } else {
      list.delete(req.uid);
    }
    const updated = await updateChat(chat.id, { protectedBy: [...list] });
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: { id: updated.id, protectedBy: updated.protectedBy } });
    if (on !== (chat.protectedBy ?? []).includes(req.uid)) {
      const me = await getUser(req.uid);
      await sendMessageAndBroadcast(
        updated,
        SYSTEM_BOT_ID,
        on ? `${me?.name ?? "Собеседник"} запретил(а) пересылку и сохранение в этом чате` : `${me?.name ?? "Собеседник"} снова разрешил(а) пересылку`,
        { type: "system" }
      ).catch(() => {});
    }
    res.json({ chat: updated, protectedBy: updated.protectedBy });
  })
);

router.get(
  "/:id/admin-log",
  asyncRoute(async (req, res) => {
    const chat = await requireMemberChat(req, res);
    if (!chat) return;
    if (chat.type === "dm") return res.status(400).json({ error: "Журнал есть только у групп и каналов" });
    if (!isOwnerOrAdminOf(chat, req.uid) && !(chat.moderatorIds ?? []).includes(req.uid)) {
      return res.status(403).json({ error: "Журнал видят только администраторы" });
    }
    const beforeId = Number(req.query.beforeId) || null;
    const entries = listAdminLog(chat.id, { limit: 100, beforeId });
    const ids = [...new Set(entries.flatMap((e) => [e.actorId, e.targetId]).filter(Boolean))];
    const users = (await listUsersByIds(ids)).map(publicUser);
    res.json({ entries, users });
  })
);

router.use("/:id/messages", messagesRouter);
router.use("/:id/topics", require("./topics"));

module.exports = router;
module.exports.serviceNote = serviceNote;
