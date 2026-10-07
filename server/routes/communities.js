// Сообщества (Communities), как в tweb (layer 228+): несколько групп и каналов под
// одной вывеской. У сообщества своё членство (выход — только из сообщества),
// администраторы с правами, удалённые участники, заявки на добавление чатов
// (режим «только админы») и личные настройки строки в списке чатов:
// закрепить, без звука, «показывать одной строкой». Страница — /community/:id.
const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { genId } = require("../lib/genId");
const { getChat } = require("../data/chats");
const { getUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { markChatRead } = require("../data/messages");
const { getSettings, updateSettings } = require("../data/settings");
const { isSafeUrl } = require("../lib/sanitizeAttachments");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { sendMessageAndBroadcast } = require("../lib/systemChat");
const { broadcastToUsers } = require("../ws");
const communities = require("../data/communities");

const router = express.Router();
router.use(requireUserId);

// Владелец или админ чата (модераторов не считаем).
const isChatAdmin = (chat, uid) => chat.ownerId === uid || (chat.ownerIds ?? []).includes(uid) || (chat.adminIds ?? []).includes(uid);

const cleanTitle = (raw) => String(raw ?? "").trim().slice(0, 128);
const cleanDescription = (raw) => String(raw ?? "").trim().slice(0, 255);
const cleanAddMode = (raw) => (raw === "admins" ? "admins" : raw === "all" ? "all" : undefined);
function cleanVisible(raw) {
  if (raw === false || raw === 0 || raw === "false" || raw === "0") return false;
  if (raw === true || raw === 1 || raw === "true" || raw === "1") return true;
  return undefined;
}
// Аватар — data-URL, ссылка на загрузку или внешний https; иначе не принимаем.
function cleanAvatarImage(raw) {
  if (raw == null || raw === "") return null;
  return typeof raw === "string" && isSafeUrl(raw) ? raw : undefined;
}

const kindOf = (chat) => (chat.type === "channel" ? "Канал" : "Группа");

// Служебная строка в самом чате (tweb: бабл communityChanged). Не роняет основное действие.
async function announce(chat, text) {
  try {
    await sendMessageAndBroadcast(chat, SYSTEM_BOT_ID, text, { type: "system" });
  } catch {}
}

// Всем участникам — «перечитайте сообщество» (список чатов и открытые экраны).
function notify(communityId, extraUserIds = []) {
  const ids = new Set([...communities.listMemberIds(communityId), ...extraUserIds]);
  broadcastToUsers([...ids], { type: "community:updated", communityId });
}

// Чат, который пользователь видит в списке сообщества. Скрытый — только его
// участникам и тем, кто управляет чатами сообщества.
function canSeeChat(community, chat, uid, rights) {
  if (!chat || chat.secret) return false;
  if (!community.hiddenChatIds.includes(chat.id)) return true;
  return rights.editChats || chat.memberIds.includes(uid);
}

function chatCard(community, chat, uid) {
  return {
    id: chat.id,
    type: chat.type,
    title: chat.title,
    username: chat.username ?? null,
    avatarColor: chat.avatarColor ?? null,
    avatarImage: chat.avatarImage ?? null,
    isPublic: !!chat.isPublic,
    approveJoins: !!chat.approveJoins,
    members: chat.memberIds.length,
    isMember: chat.memberIds.includes(uid),
    isChatAdmin: isChatAdmin(chat, uid),
    visible: !community.hiddenChatIds.includes(chat.id),
    addedBy: community.addedBy[chat.id] ?? null,
  };
}

async function visibleChats(community, uid, rights) {
  const chats = await Promise.all(community.chatIds.map((id) => getChat(id)));
  return chats.filter((c) => canSeeChat(community, c, uid, rights));
}

// Добавлять чаты может участник с правом editChats, а при addMode «all» — любой участник.
// При «admins» обычный участник может только предложить (заявка).
function addPolicy(community, uid) {
  const role = communities.roleOf(community, uid);
  if (!role) return null;
  if (communities.rightsOf(community, uid).editChats) return "add";
  return community.addMode === "all" ? "add" : "suggest";
}

async function view(community, uid) {
  const role = communities.roleOf(community, uid);
  const rights = communities.rightsOf(community, uid);
  const chats = (await visibleChats(community, uid, rights)).map((c) => chatCard(community, c, uid));
  const memberIds = communities.listMemberIds(community.id);
  return {
    id: community.id,
    title: community.title,
    description: community.description ?? null,
    avatarColor: community.avatarColor ?? null,
    avatarImage: community.avatarImage ?? null,
    addMode: community.addMode,
    role,
    isOwner: role === "owner",
    isMember: !!role,
    isBanned: role === null && communities.isBanned(community.id, uid),
    rights,
    addPolicy: addPolicy(community, uid),
    ...communities.prefsOf(community.id, uid),
    chats,
    membersCount: memberIds.length,
    adminsCount: communities.listAdmins(community.id).length + 1,
    bannedCount: rights.ban ? communities.listBans(community.id).length : 0,
    requestsCount: rights.editChats ? communities.countRequests(community.id) : 0,
  };
}

// Загружает сообщество и проверяет право; при отказе сам отвечает и возвращает null.
function load(req, res, right) {
  const community = communities.getCommunity(req.params.id);
  if (!community) {
    res.status(404).json({ error: "Сообщество не найдено" });
    return null;
  }
  if (right === "member") {
    if (communities.roleOf(community, req.uid)) return community;
    res.status(403).json({ error: "Вы не участник сообщества" });
    return null;
  }
  const allowed = !right || (right === "owner" ? community.ownerId === req.uid : communities.rightsOf(community, req.uid)[right]);
  if (!allowed) {
    res.status(403).json({ error: "Недостаточно прав" });
    return null;
  }
  return community;
}

// В сообщество добавляются только свои группы и каналы (где вы владелец или админ).
async function checkAddable(chatId, uid) {
  const chat = typeof chatId === "string" ? await getChat(chatId) : null;
  if (!chat || !chat.memberIds.includes(uid)) return { status: 404, error: "Чат не найден" };
  if (chat.secret || (chat.type !== "group" && chat.type !== "channel")) return { status: 400, error: "В сообщество добавляются группы и каналы" };
  if (!isChatAdmin(chat, uid)) return { status: 403, error: "Добавить чат может только его владелец или администратор" };
  if (communities.communityOfChat(chat.id)) return { status: 409, error: "Этот чат уже входит в сообщество" };
  return { chat };
}

async function linkChat(community, chat, { visible, addedBy }) {
  if (!communities.addChatToCommunity(community.id, chat.id, { visible, addedBy })) return false;
  await announce(chat, `${kindOf(chat)} добавлен${chat.type === "channel" ? "" : "а"} в сообщество «${community.title}»`);
  notify(community.id);
  return true;
}

async function unlinkChat(community, chat) {
  const before = communities.listMemberIds(community.id);
  if (!communities.removeChatFromCommunity(community.id, chat.id)) return;
  if (chat) await announce(chat, `${kindOf(chat)} больше не входит в сообщество «${community.title}»`);
  notify(community.id, before);
}

async function userCard(id, extra = {}) {
  const u = publicUser(await getUser(id));
  return u ? { ...u, ...extra } : null;
}

// ---------- списки ----------

// Сообщества, в которые пользователь может добавить (или предложить) свой чат.
router.get(
  "/mine",
  asyncRoute(async (req, res) => {
    const list = communities.listCommunitiesForUser(req.uid);
    res.json({
      communities: list
        .map((c) => ({ id: c.id, title: c.title, avatarColor: c.avatarColor ?? null, avatarImage: c.avatarImage ?? null, chatCount: c.chatIds.length, addPolicy: addPolicy(c, req.uid) }))
        .filter((c) => c.addPolicy),
    });
  })
);

// Для списка чатов (как в tweb): сообщество — отдельная строка, его чаты — в панели.
router.get(
  "/joined",
  asyncRoute(async (req, res) => {
    const out = [];
    for (const c of communities.listCommunitiesForUser(req.uid)) {
      const rights = communities.rightsOf(c, req.uid);
      const chats = await visibleChats(c, req.uid, rights);
      out.push({
        id: c.id,
        title: c.title,
        description: c.description ?? null,
        avatarColor: c.avatarColor ?? null,
        avatarImage: c.avatarImage ?? null,
        role: communities.roleOf(c, req.uid),
        isOwner: c.ownerId === req.uid,
        rights,
        addMode: c.addMode,
        ...communities.prefsOf(c.id, req.uid),
        chatIds: chats.map((ch) => ch.id),
        requestsCount: rights.editChats ? communities.countRequests(c.id) : 0,
      });
    }
    res.json({ communities: out });
  })
);

router.get(
  "/by-chat/:chatId",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.chatId);
    if (!chat || (!chat.memberIds.includes(req.uid) && !chat.isPublic)) return res.status(404).json({ error: "not found" });
    const community = communities.communityOfChat(chat.id);
    if (!community) return res.json({ community: null });
    const rights = communities.rightsOf(community, req.uid);
    res.json({
      community: {
        id: community.id,
        title: community.title,
        avatarColor: community.avatarColor ?? null,
        avatarImage: community.avatarImage ?? null,
        isOwner: community.ownerId === req.uid,
        isMember: !!communities.roleOf(community, req.uid),
        // Убрать чат может тот, кто управляет чатами сообщества, или админ самого чата.
        canRemoveChat: rights.editChats || isChatAdmin(chat, req.uid),
      },
    });
  })
);

// ---------- само сообщество ----------

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const title = cleanTitle(req.body?.title);
    if (!title) return res.status(400).json({ error: "Введите название сообщества" });
    const firstChatId = req.body?.chatId;
    let first = null;
    if (firstChatId) {
      const check = await checkAddable(firstChatId, req.uid);
      if (check.error) return res.status(check.status).json({ error: check.error });
      first = check.chat;
    }
    const avatarImage = cleanAvatarImage(req.body?.avatarImage);
    if (avatarImage === undefined) return res.status(400).json({ error: "Некорректное изображение" });
    const community = communities.createCommunity({
      id: genId("cm"),
      ownerId: req.uid,
      title,
      description: cleanDescription(req.body?.description),
      avatarColor: typeof req.body?.avatarColor === "string" ? req.body.avatarColor.slice(0, 20) : null,
      avatarImage,
      addMode: cleanAddMode(req.body?.addMode) ?? "all",
    });
    if (first) await linkChat(community, first, { visible: cleanVisible(req.body?.chatVisible) ?? true, addedBy: req.uid });
    res.json({ community: await view(communities.getCommunity(community.id), req.uid) });
  })
);

router.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const community = load(req, res);
    if (!community) return;
    if (communities.isBanned(community.id, req.uid) && community.ownerId !== req.uid) {
      return res.status(403).json({ error: "Вас удалили из этого сообщества" });
    }
    res.json({ community: await view(community, req.uid) });
  })
);

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const community = load(req, res);
    if (!community) return;
    const rights = communities.rightsOf(community, req.uid);
    const patch = {};
    const infoTouched = ["title", "description", "avatarImage"].some((k) => req.body?.[k] !== undefined);
    if (infoTouched && !rights.editInfo) return res.status(403).json({ error: "Нет права менять информацию о сообществе" });
    if (req.body?.title !== undefined) {
      patch.title = cleanTitle(req.body.title);
      if (!patch.title) return res.status(400).json({ error: "Введите название сообщества" });
    }
    if (req.body?.description !== undefined) patch.description = cleanDescription(req.body.description);
    if (req.body?.avatarImage !== undefined) {
      const avatarImage = cleanAvatarImage(req.body.avatarImage);
      if (avatarImage === undefined) return res.status(400).json({ error: "Некорректное изображение" });
      patch.avatarImage = avatarImage;
    }
    if (req.body?.addMode !== undefined) {
      if (!rights.editChats) return res.status(403).json({ error: "Нет права менять список чатов" });
      patch.addMode = cleanAddMode(req.body.addMode);
      if (!patch.addMode) return res.status(400).json({ error: "Некорректный режим добавления чатов" });
    }
    const updated = communities.updateCommunity(community.id, patch);
    notify(community.id);
    res.json({ community: await view(updated, req.uid) });
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const community = load(req, res, "owner");
    if (!community) return;
    const members = communities.listMemberIds(community.id);
    communities.deleteCommunity(community.id);
    broadcastToUsers(members, { type: "community:updated", communityId: community.id });
    res.json({ ok: true });
  })
);

// ---------- участие и личные настройки ----------

router.post(
  "/:id/join",
  asyncRoute(async (req, res) => {
    const community = load(req, res);
    if (!community) return;
    if (communities.isBanned(community.id, req.uid)) return res.status(403).json({ error: "Вас удалили из этого сообщества" });
    communities.joinCommunity(community.id, req.uid);
    res.json({ community: await view(community, req.uid) });
  })
);

router.post(
  "/:id/leave",
  asyncRoute(async (req, res) => {
    const community = load(req, res, "member");
    if (!community) return;
    if (community.ownerId === req.uid) return res.status(400).json({ error: "Владелец не может покинуть сообщество — его можно только удалить" });
    communities.leaveCommunity(community.id, req.uid);
    res.json({ ok: true });
  })
);

// { pinned?, collapsed? } — закрепить строку / показывать одной строкой (tweb toggleCollapsedInDialogs).
router.post(
  "/:id/prefs",
  asyncRoute(async (req, res) => {
    const community = load(req, res, "member");
    if (!community) return;
    const pinned = cleanVisible(req.body?.pinned);
    const collapsed = cleanVisible(req.body?.collapsed);
    communities.setPrefs(community.id, req.uid, { pinned, collapsed });
    res.json({ community: await view(community, req.uid) });
  })
);

async function myChats(community, uid) {
  const chats = await Promise.all(community.chatIds.map((id) => getChat(id)));
  return chats.filter((c) => c && c.memberIds.includes(uid));
}

// Без звука — сразу на все мои чаты сообщества: { forever } | { hours } | { off }.
router.post(
  "/:id/mute",
  asyncRoute(async (req, res) => {
    const community = load(req, res, "member");
    if (!community) return;
    const hours = Number(req.body?.hours);
    const value =
      req.body?.forever === true ? true : req.body?.off === true ? null : Number.isFinite(hours) && hours > 0 ? new Date(Date.now() + hours * 3600_000).toISOString() : undefined;
    if (value === undefined) return res.status(400).json({ error: "Укажите срок" });
    const settings = await getSettings(req.uid);
    const mutedChats = { ...(settings.notifications?.mutedChats ?? {}) };
    for (const chat of await myChats(community, req.uid)) {
      if (value === null) delete mutedChats[chat.id];
      else mutedChats[chat.id] = value;
    }
    await updateSettings(req.uid, { notifications: { ...settings.notifications, mutedChats } });
    res.json({ ok: true });
  })
);

router.post(
  "/:id/read",
  asyncRoute(async (req, res) => {
    const community = load(req, res, "member");
    if (!community) return;
    for (const chat of await myChats(community, req.uid)) {
      const changedIds = await markChatRead(chat.id, req.uid);
      if (changedIds.length) {
        broadcastToUsers(chat.memberIds.filter((m) => m !== req.uid), { type: "message:read", chatId: chat.id, readerId: req.uid, messageIds: changedIds });
      }
    }
    res.json({ ok: true });
  })
);

// Участники сообщества — для выбора админа или удаления. ?q= — поиск по имени/нику.
router.get(
  "/:id/members",
  asyncRoute(async (req, res) => {
    const community = load(req, res, "member");
    if (!community) return;
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const admins = new Map(communities.listAdmins(community.id).map((a) => [a.userId, a.rights]));
    const users = [];
    for (const id of communities.listMemberIds(community.id)) {
      const role = id === community.ownerId ? "owner" : admins.has(id) ? "admin" : "member";
      const u = await userCard(id, { role });
      if (!u) continue;
      if (q && !`${u.name ?? ""} ${u.username ?? ""}`.toLowerCase().includes(q)) continue;
      users.push(u);
      if (users.length >= 200) break;
    }
    res.json({ users });
  })
);

// ---------- чаты сообщества ----------

router.post(
  "/:id/chats",
  asyncRoute(async (req, res) => {
    const community = load(req, res);
    if (!community) return;
    const policy = addPolicy(community, req.uid);
    if (!policy) return res.status(403).json({ error: "Добавлять чаты могут только участники сообщества" });
    const check = await checkAddable(req.body?.chatId, req.uid);
    if (check.error) return res.status(check.status).json({ error: check.error });
    const visible = cleanVisible(req.body?.visible) ?? true;
    if (policy === "suggest") {
      const created = communities.addRequest({ id: genId("cr"), communityId: community.id, chatId: check.chat.id, suggestedBy: req.uid, visible });
      if (!created) return res.status(409).json({ error: "Заявка на этот чат уже отправлена" });
      const managers = communities.listMemberIds(community.id).filter((id) => communities.rightsOf(community, id).editChats);
      broadcastToUsers(managers, { type: "community:updated", communityId: community.id });
      return res.json({ requested: true, community: await view(community, req.uid) });
    }
    if (!(await linkChat(community, check.chat, { visible, addedBy: req.uid }))) {
      return res.status(409).json({ error: "Этот чат уже входит в другое сообщество" });
    }
    res.json({ community: await view(communities.getCommunity(community.id), req.uid) });
  })
);

// Видимость чата в сообществе (tweb CommunityChatSettings).
router.patch(
  "/:id/chats/:chatId",
  asyncRoute(async (req, res) => {
    const community = load(req, res, "editChats");
    if (!community) return;
    if (!community.chatIds.includes(req.params.chatId)) return res.status(404).json({ error: "Чат не входит в сообщество" });
    const visible = cleanVisible(req.body?.visible);
    if (visible === undefined) return res.status(400).json({ error: "Нужно visible: true или false" });
    communities.setCommunityChatVisible(community.id, req.params.chatId, visible);
    notify(community.id);
    res.json({ community: await view(communities.getCommunity(community.id), req.uid) });
  })
);

// Убрать чат может тот, кто управляет чатами сообщества, или админ самого чата.
router.delete(
  "/:id/chats/:chatId",
  asyncRoute(async (req, res) => {
    const community = load(req, res);
    if (!community) return;
    if (!community.chatIds.includes(req.params.chatId)) return res.status(404).json({ error: "Чат не входит в сообщество" });
    const chat = await getChat(req.params.chatId);
    const allowed = communities.rightsOf(community, req.uid).editChats || (chat && chat.memberIds.includes(req.uid) && isChatAdmin(chat, req.uid));
    if (!allowed) return res.status(403).json({ error: "Недостаточно прав" });
    await unlinkChat(community, chat);
    res.json({ community: await view(communities.getCommunity(community.id), req.uid) });
  })
);

// ---------- заявки (tweb Community.PendingRequests) ----------

router.get(
  "/:id/requests",
  asyncRoute(async (req, res) => {
    const community = load(req, res, "editChats");
    if (!community) return;
    const out = [];
    for (const r of communities.listRequests(community.id)) {
      const chat = await getChat(r.chatId);
      if (!chat) continue;
      out.push({ ...r, chat: chatCard(community, chat, req.uid), suggestedBy: await userCard(r.suggestedBy) });
    }
    res.json({ requests: out });
  })
);

async function resolveRequest(community, request, approve, uid) {
  communities.deleteRequest(request.id);
  const chat = await getChat(request.chatId);
  if (approve && chat && !communities.communityOfChat(chat.id)) {
    await linkChat(community, chat, { visible: request.visible, addedBy: request.suggestedBy });
    return true;
  }
  broadcastToUsers([request.suggestedBy, uid], { type: "community:updated", communityId: community.id });
  return false;
}

// { approve: true|false } для одной заявки или для всех (requestId === "all").
router.post(
  "/:id/requests/:requestId",
  asyncRoute(async (req, res) => {
    const community = load(req, res, "editChats");
    if (!community) return;
    const approve = req.body?.approve === true;
    const list =
      req.params.requestId === "all"
        ? communities.listRequests(community.id)
        : [communities.getRequest(req.params.requestId)].filter((r) => r && r.communityId === community.id);
    if (!list.length) return res.status(404).json({ error: "Заявка не найдена" });
    let added = 0;
    for (const r of list) if (await resolveRequest(community, r, approve, req.uid)) added++;
    res.json({ added, declined: list.length - added, community: await view(communities.getCommunity(community.id), req.uid) });
  })
);

// ---------- администраторы ----------

router.get(
  "/:id/admins",
  asyncRoute(async (req, res) => {
    const community = load(req, res, "member");
    if (!community) return;
    const admins = [await userCard(community.ownerId, { role: "owner", rights: communities.rightsOf(community, community.ownerId) })];
    for (const a of communities.listAdmins(community.id)) admins.push(await userCard(a.userId, { role: "admin", rights: a.rights }));
    res.json({ admins: admins.filter(Boolean) });
  })
);

// Назначить или изменить права: { rights: { editInfo, editChats, ban, addAdmins } }.
router.put(
  "/:id/admins/:userId",
  asyncRoute(async (req, res) => {
    const community = load(req, res, "addAdmins");
    if (!community) return;
    const target = req.params.userId;
    if (target === community.ownerId) return res.status(400).json({ error: "Права владельца не меняются" });
    if (!communities.roleOf(community, target)) return res.status(400).json({ error: "Этот пользователь не участник сообщества" });
    // Админ не может выдать прав больше, чем есть у него самого.
    const mine = communities.rightsOf(community, req.uid);
    const rights = communities.cleanRights(req.body?.rights ?? communities.DEFAULT_ADMIN_RIGHTS);
    for (const r of communities.RIGHTS) if (rights[r] && !mine[r]) return res.status(403).json({ error: "Нельзя выдать право, которого нет у вас" });
    communities.setAdmin(community.id, target, rights);
    broadcastToUsers([target], { type: "community:updated", communityId: community.id });
    res.json({ ok: true });
  })
);

router.delete(
  "/:id/admins/:userId",
  asyncRoute(async (req, res) => {
    const community = load(req, res);
    if (!community) return;
    // Снять себя может любой админ; других — только с правом addAdmins.
    if (req.params.userId !== req.uid && !communities.rightsOf(community, req.uid).addAdmins) return res.status(403).json({ error: "Недостаточно прав" });
    communities.removeAdmin(community.id, req.params.userId);
    broadcastToUsers([req.params.userId], { type: "community:updated", communityId: community.id });
    res.json({ ok: true });
  })
);

// ---------- удалённые участники ----------

router.get(
  "/:id/bans",
  asyncRoute(async (req, res) => {
    const community = load(req, res, "ban");
    if (!community) return;
    const users = [];
    for (const b of communities.listBans(community.id)) {
      const u = await userCard(b.userId, { bannedAt: b.bannedAt });
      if (u) users.push(u);
    }
    res.json({ users });
  })
);

// Сколько чатов уберётся вместе с пользователем (tweb Community.BanWarning).
async function chatsOwnedIn(community, userId) {
  const chats = await Promise.all(community.chatIds.map((id) => getChat(id)));
  return chats.filter((c) => c && (c.ownerId === userId || (c.ownerIds ?? []).includes(userId)));
}

router.get(
  "/:id/bans/:userId/preview",
  asyncRoute(async (req, res) => {
    const community = load(req, res, "ban");
    if (!community) return;
    res.json({ chats: (await chatsOwnedIn(community, req.params.userId)).map((c) => ({ id: c.id, title: c.title })) });
  })
);

router.put(
  "/:id/bans/:userId",
  asyncRoute(async (req, res) => {
    const community = load(req, res, "ban");
    if (!community) return;
    const target = req.params.userId;
    if (target === req.uid) return res.status(400).json({ error: "Нельзя удалить себя" });
    if (target === community.ownerId) return res.status(403).json({ error: "Владельца удалить нельзя" });
    if (communities.roleOf(community, target) === "admin" && community.ownerId !== req.uid) {
      return res.status(403).json({ error: "Администратора может удалить только владелец" });
    }
    const before = communities.listMemberIds(community.id);
    const owned = await chatsOwnedIn(community, target);
    communities.banUser(community.id, target, req.uid);
    for (const chat of owned) {
      communities.removeChatFromCommunity(community.id, chat.id);
      await announce(chat, `${kindOf(chat)} больше не входит в сообщество «${community.title}»`);
    }
    notify(community.id, before);
    res.json({ ok: true, removedChats: owned.length });
  })
);

router.delete(
  "/:id/bans/:userId",
  asyncRoute(async (req, res) => {
    const community = load(req, res, "ban");
    if (!community) return;
    communities.unbanUser(community.id, req.params.userId);
    res.json({ ok: true });
  })
);

module.exports = router;
