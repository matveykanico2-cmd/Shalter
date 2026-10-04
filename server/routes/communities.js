// Сообщества (Communities), как в Telegram: владелец объединяет свои группы и
// каналы под одной вывеской. У сообщества своя страница по ссылке
// /community/:id — с неё вступают в открытые чаты, а в каждом чате видно,
// в какое сообщество он входит.
const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { genId } = require("../lib/genId");
const { getChat } = require("../data/chats");
const { isSafeUrl } = require("../lib/sanitizeAttachments");
// Владелец или админ (модераторов чата не считаем).
const isOwnerOrAdmin = (chat, uid) => chat.ownerId === uid || (chat.ownerIds ?? []).includes(uid) || (chat.adminIds ?? []).includes(uid);
const communities = require("../data/communities");

const router = express.Router();
router.use(requireUserId);

function cleanTitle(raw) {
  return String(raw ?? "").trim().slice(0, 100);
}
function cleanDescription(raw) {
  return String(raw ?? "").trim().slice(0, 500);
}
// Кто может добавлять чаты в сообщество (tweb Community.AddMode): «all» — все
// участники, «admins» — только администраторы.
function cleanAddMode(raw) {
  return raw === "admins" ? "admins" : raw === "all" ? "all" : undefined;
}
function cleanVisible(raw) {
  if (raw === false || raw === 0 || raw === "false" || raw === "0") return false;
  if (raw === true || raw === 1 || raw === "true" || raw === "1") return true;
  return undefined;
}

// Аватар — либо data-URL, либо ссылка на загрузку/внешний https; иначе не принимаем.
function cleanAvatarImage(raw) {
  if (raw == null || raw === "") return null;
  return typeof raw === "string" && isSafeUrl(raw) ? raw : undefined;
}

// Карточка чата для страницы сообщества: закрытые чаты показываем по
// названию, но вступить в них можно только по приглашению.
async function chatCard(chat, uid) {
  if (!chat || chat.secret) return null;
  return {
    id: chat.id,
    type: chat.type,
    title: chat.title,
    username: chat.username ?? null,
    avatarColor: chat.avatarColor ?? null,
    avatarImage: chat.avatarImage ?? null,
    isPublic: !!chat.isPublic,
    members: chat.memberIds.length,
    isMember: chat.memberIds.includes(uid),
    canManage: isOwnerOrAdmin(chat, uid),
  };
}

// Скрытые чаты (linked_peers.visible === false в tweb) видит только владелец —
// остальным в списке сообщества они не показываются.
async function view(community, uid) {
  const hidden = new Set(community.hiddenChatIds);
  const cards = (await Promise.all(community.chatIds.map(async (id) => chatCard(await getChat(id), uid)))).filter(Boolean);
  const chats = cards
    .map((c) => ({ ...c, visible: !hidden.has(c.id) }))
    .filter((c) => c.visible || community.ownerId === uid);
  return {
    id: community.id,
    title: community.title,
    description: community.description ?? null,
    avatarColor: community.avatarColor ?? null,
    avatarImage: community.avatarImage ?? null,
    addMode: community.addMode,
    isOwner: community.ownerId === uid,
    chats,
    // Чаты сообщества, где пользователь состоит — по ним и «все участники» могут добавлять.
    isMember: community.ownerId === uid || chats.some((c) => c.isMember),
  };
}

async function requireOwned(req, res) {
  const community = communities.getCommunity(req.params.id);
  if (!community) {
    res.status(404).json({ error: "Сообщество не найдено" });
    return null;
  }
  if (community.ownerId !== req.uid) {
    res.status(403).json({ error: "Менять сообщество может только его владелец" });
    return null;
  }
  return community;
}

// Право управлять чатами сообщества: владелец всегда, остальные — когда
// сообщество открыто для всех его участников (addMode === "all").
async function canManageChats(community, uid) {
  if (community.ownerId === uid) return true;
  if (community.addMode !== "all") return false;
  const chats = await Promise.all(community.chatIds.map((id) => getChat(id)));
  return chats.some((chat) => chat && chat.memberIds.includes(uid));
}

// Добавлять можно только свои группы и каналы (где вы владелец или админ).
async function checkAddable(chatId, uid) {
  const chat = typeof chatId === "string" ? await getChat(chatId) : null;
  if (!chat || !chat.memberIds.includes(uid)) return { status: 404, error: "Чат не найден" };
  if (chat.type !== "group" && chat.type !== "channel") return { status: 400, error: "В сообщество добавляются группы и каналы" };
  if (!isOwnerOrAdmin(chat, uid)) return { status: 403, error: "Добавить чат может только его владелец или администратор" };
  return { chat };
}

router.get(
  "/mine",
  asyncRoute(async (req, res) => {
    const list = communities.listCommunitiesOwnedBy(req.uid);
    res.json({ communities: list.map((c) => ({ id: c.id, title: c.title, chatCount: c.chatIds.length })) });
  })
);

// Для списка чатов (как в tweb): сообщество — отдельная строка, его чаты — в выезжающей панели.
router.get(
  "/joined",
  asyncRoute(async (req, res) => {
    const list = communities.listCommunitiesForUser(req.uid);
    const out = [];
    for (const c of list) {
      const hidden = new Set(c.ownerId === req.uid ? [] : c.hiddenChatIds);
      const visible = [];
      for (const id of c.chatIds) {
        if (hidden.has(id)) continue;
        const chat = await getChat(id);
        if (chat && !chat.secret) visible.push(id);
      }
      out.push({
        id: c.id,
        title: c.title,
        description: c.description ?? null,
        avatarColor: c.avatarColor ?? null,
        avatarImage: c.avatarImage ?? null,
        isOwner: c.ownerId === req.uid,
        chatIds: visible,
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
    res.json({ community: community ? { id: community.id, title: community.title, isOwner: community.ownerId === req.uid } : null });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const title = cleanTitle(req.body?.title);
    if (!title) return res.status(400).json({ error: "Введите название сообщества" });
    const firstChatId = req.body?.chatId;
    if (firstChatId) {
      const check = await checkAddable(firstChatId, req.uid);
      if (check.error) return res.status(check.status).json({ error: check.error });
      if (communities.communityOfChat(firstChatId)) return res.status(409).json({ error: "Этот чат уже входит в сообщество" });
    }
    const community = communities.createCommunity({
      id: genId("cm"),
      ownerId: req.uid,
      title,
      description: cleanDescription(req.body?.description),
      avatarColor: typeof req.body?.avatarColor === "string" ? req.body.avatarColor.slice(0, 20) : null,
      avatarImage: cleanAvatarImage(req.body?.avatarImage),
      addMode: cleanAddMode(req.body?.addMode) ?? "all",
    });
    if (firstChatId) communities.addChatToCommunity(community.id, firstChatId, { visible: cleanVisible(req.body?.chatVisible) ?? true });
    res.json({ community: await view(communities.getCommunity(community.id), req.uid) });
  })
);

router.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const community = communities.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: "Сообщество не найдено" });
    res.json({ community: await view(community, req.uid) });
  })
);

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const community = await requireOwned(req, res);
    if (!community) return;
    const patch = {};
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
      const addMode = cleanAddMode(req.body.addMode);
      if (!addMode) return res.status(400).json({ error: "Некорректный режим добавления чатов" });
      patch.addMode = addMode;
    }
    res.json({ community: await view(communities.updateCommunity(community.id, patch), req.uid) });
  })
);

router.post(
  "/:id/chats",
  asyncRoute(async (req, res) => {
    const community = communities.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: "Сообщество не найдено" });
    if (!(await canManageChats(community, req.uid))) return res.status(403).json({ error: "Добавлять чаты может только владелец сообщества" });
    const check = await checkAddable(req.body?.chatId, req.uid);
    if (check.error) return res.status(check.status).json({ error: check.error });
    const visible = cleanVisible(req.body?.visible) ?? true;
    if (!communities.addChatToCommunity(community.id, check.chat.id, { visible })) {
      return res.status(409).json({ error: "Этот чат уже входит в другое сообщество" });
    }
    res.json({ community: await view(communities.getCommunity(community.id), req.uid) });
  })
);

// Видимость чата в сообществе (tweb CommunityChatSettings): скрытый чат остаётся
// в сообществе, но не показывается в его списке.
router.patch(
  "/:id/chats/:chatId",
  asyncRoute(async (req, res) => {
    const community = communities.getCommunity(req.params.id);
    if (!community || !community.chatIds.includes(req.params.chatId)) return res.status(404).json({ error: "not found" });
    if (!(await canManageChats(community, req.uid))) return res.status(403).json({ error: "Недостаточно прав" });
    const visible = cleanVisible(req.body?.visible);
    if (visible === undefined) return res.status(400).json({ error: "Нужно visible: true или false" });
    communities.setCommunityChatVisible(community.id, req.params.chatId, visible);
    res.json({ community: await view(communities.getCommunity(community.id), req.uid) });
  })
);

// Убрать чат может владелец сообщества или администратор самого чата.
router.delete(
  "/:id/chats/:chatId",
  asyncRoute(async (req, res) => {
    const community = communities.getCommunity(req.params.id);
    if (!community || !community.chatIds.includes(req.params.chatId)) return res.status(404).json({ error: "not found" });
    const chat = await getChat(req.params.chatId);
    const allowed = community.ownerId === req.uid || (chat && chat.memberIds.includes(req.uid) && isOwnerOrAdmin(chat, req.uid));
    if (!allowed) return res.status(403).json({ error: "Недостаточно прав" });
    communities.removeChatFromCommunity(community.id, req.params.chatId);
    res.json({ community: await view(communities.getCommunity(community.id), req.uid) });
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const community = await requireOwned(req, res);
    if (!community) return;
    communities.deleteCommunity(community.id);
    res.json({ ok: true });
  })
);

module.exports = router;
