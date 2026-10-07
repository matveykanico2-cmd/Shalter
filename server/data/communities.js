const db = require("../db");

const ADD_MODES = new Set(["all", "admins"]);

// Права администратора сообщества — те же четыре, что в tweb
// (Community.AdminEditInfo / AdminEditChats / AdminBanMembers / AdminAddAdmins).
const RIGHTS = ["editInfo", "editChats", "ban", "addAdmins"];
const ALL_RIGHTS = Object.fromEntries(RIGHTS.map((r) => [r, true]));
const DEFAULT_ADMIN_RIGHTS = { editInfo: true, editChats: true, ban: true, addAdmins: false };

function cleanRights(raw) {
  const out = {};
  for (const r of RIGHTS) out[r] = !!raw?.[r];
  return out;
}

function parseRights(text) {
  try {
    return cleanRights(JSON.parse(text));
  } catch {
    return cleanRights(DEFAULT_ADMIN_RIGHTS);
  }
}

function rowToCommunity(row) {
  if (!row) return undefined;
  const chats = db
    .prepare("SELECT chatId, visible, addedBy FROM community_chats WHERE communityId = ? ORDER BY addedAt ASC")
    .all(row.id);
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    description: row.description ?? undefined,
    avatarColor: row.avatarColor ?? undefined,
    avatarImage: row.avatarImage ?? undefined,
    addMode: ADD_MODES.has(row.addMode) ? row.addMode : "all",
    createdAt: row.createdAt,
    chatIds: chats.map((c) => c.chatId),
    // Скрытые чаты остаются в сообществе, но видны только своим участникам и админам (tweb: linked_peers.visible).
    hiddenChatIds: chats.filter((c) => !c.visible).map((c) => c.chatId),
    addedBy: Object.fromEntries(chats.filter((c) => c.addedBy).map((c) => [c.chatId, c.addedBy])),
  };
}

function getCommunity(id) {
  return rowToCommunity(db.prepare("SELECT * FROM communities WHERE id = ?").get(id));
}

function communityOfChat(chatId) {
  const row = db.prepare("SELECT communityId FROM community_chats WHERE chatId = ?").get(chatId);
  return row ? getCommunity(row.communityId) : undefined;
}

function createCommunity({ id, ownerId, title, description, avatarColor, avatarImage, addMode }) {
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("INSERT INTO communities (id, ownerId, title, description, avatarColor, avatarImage, addMode, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      id,
      ownerId,
      title,
      description || null,
      avatarColor ?? null,
      avatarImage ?? null,
      ADD_MODES.has(addMode) ? addMode : "all",
      now
    );
    db.prepare("INSERT INTO community_members (communityId, userId, role, joinedAt) VALUES (?, ?, 'owner', ?)").run(id, ownerId, now);
  })();
  return getCommunity(id);
}

function updateCommunity(id, { title, description, avatarImage, addMode }) {
  const existing = getCommunity(id);
  if (!existing) return undefined;
  db.prepare("UPDATE communities SET title = ?, description = ?, avatarImage = ?, addMode = ? WHERE id = ?").run(
    title ?? existing.title,
    description === undefined ? existing.description ?? null : description || null,
    avatarImage === undefined ? existing.avatarImage ?? null : avatarImage || null,
    addMode === undefined ? existing.addMode : ADD_MODES.has(addMode) ? addMode : existing.addMode,
    id
  );
  return getCommunity(id);
}

function deleteCommunity(id) {
  db.prepare("DELETE FROM communities WHERE id = ?").run(id);
}

// ---------- чаты ----------

// false — чат уже в другом сообществе.
function addChatToCommunity(communityId, chatId, { visible = true, addedBy = null } = {}) {
  const taken = db.prepare("SELECT communityId FROM community_chats WHERE chatId = ?").get(chatId);
  if (taken) return taken.communityId === communityId;
  db.transaction(() => {
    db.prepare("INSERT INTO community_chats (chatId, communityId, visible, addedBy, addedAt) VALUES (?, ?, ?, ?, ?)").run(
      chatId,
      communityId,
      visible ? 1 : 0,
      addedBy,
      new Date().toISOString()
    );
    // Чат попал в сообщество — его заявки во все сообщества больше не нужны.
    db.prepare("DELETE FROM community_requests WHERE chatId = ?").run(chatId);
  })();
  return true;
}

function removeChatFromCommunity(communityId, chatId) {
  return db.prepare("DELETE FROM community_chats WHERE communityId = ? AND chatId = ?").run(communityId, chatId).changes > 0;
}

function setCommunityChatVisible(communityId, chatId, visible) {
  db.prepare("UPDATE community_chats SET visible = ? WHERE communityId = ? AND chatId = ?").run(visible ? 1 : 0, communityId, chatId);
}

// ---------- участники ----------

function memberRow(communityId, userId) {
  return db.prepare("SELECT * FROM community_members WHERE communityId = ? AND userId = ?").get(communityId, userId);
}

function ensureMemberRow(communityId, userId) {
  db.prepare("INSERT OR IGNORE INTO community_members (communityId, userId, joinedAt) VALUES (?, ?, ?)").run(communityId, userId, new Date().toISOString());
}

function isBanned(communityId, userId) {
  return !!db.prepare("SELECT 1 FROM community_bans WHERE communityId = ? AND userId = ?").get(communityId, userId);
}

function inLinkedChat(communityId, userId) {
  return !!db
    .prepare("SELECT 1 FROM community_chats cc JOIN chat_members m ON m.chatId = cc.chatId WHERE cc.communityId = ? AND m.userId = ? LIMIT 1")
    .get(communityId, userId);
}

// Роль пользователя в сообществе: owner | admin | member | null (не участник).
// Участник — у кого есть строка без «вышел» или кто состоит хоть в одном чате сообщества.
function roleOf(community, userId) {
  if (!community || !userId) return null;
  if (community.ownerId === userId) return "owner";
  if (isBanned(community.id, userId)) return null;
  const row = memberRow(community.id, userId);
  if (row?.left) return null;
  if (row?.role === "admin") return "admin";
  if (row || inLinkedChat(community.id, userId)) return "member";
  return null;
}

function rightsOf(community, userId) {
  const role = roleOf(community, userId);
  if (role === "owner") return { ...ALL_RIGHTS };
  if (role === "admin") return parseRights(memberRow(community.id, userId)?.rights);
  return cleanRights({});
}

function prefsOf(communityId, userId) {
  const row = memberRow(communityId, userId);
  return { pinned: !!row?.pinned, collapsed: row ? !!row.collapsed : true };
}

function setPrefs(communityId, userId, { pinned, collapsed }) {
  ensureMemberRow(communityId, userId);
  if (pinned !== undefined) db.prepare("UPDATE community_members SET pinned = ? WHERE communityId = ? AND userId = ?").run(pinned ? 1 : 0, communityId, userId);
  if (collapsed !== undefined) db.prepare("UPDATE community_members SET collapsed = ? WHERE communityId = ? AND userId = ?").run(collapsed ? 1 : 0, communityId, userId);
}

function joinCommunity(communityId, userId) {
  ensureMemberRow(communityId, userId);
  db.prepare("UPDATE community_members SET left = 0 WHERE communityId = ? AND userId = ?").run(communityId, userId);
}

// Выход — только из сообщества: чаты остаются, роль админа снимается.
function leaveCommunity(communityId, userId) {
  ensureMemberRow(communityId, userId);
  db.prepare("UPDATE community_members SET left = 1, role = 'member', rights = NULL, pinned = 0 WHERE communityId = ? AND userId = ?").run(communityId, userId);
}

// Сообщества, где пользователь участвует (владелец, админ, явная строка или член чата сообщества).
function listCommunitiesForUser(uid) {
  const rows = db
    .prepare(
      `SELECT DISTINCT c.* FROM communities c
       LEFT JOIN community_members cm ON cm.communityId = c.id AND cm.userId = ?
       LEFT JOIN community_chats cc ON cc.communityId = c.id
       LEFT JOIN chat_members m ON m.chatId = cc.chatId AND m.userId = ?
       WHERE (c.ownerId = ? OR cm.userId IS NOT NULL OR m.userId IS NOT NULL)
         AND (c.ownerId = ? OR cm.left IS NULL OR cm.left = 0)
         AND NOT EXISTS (SELECT 1 FROM community_bans b WHERE b.communityId = c.id AND b.userId = ? AND c.ownerId <> ?)
       ORDER BY c.createdAt DESC`
    )
    .all(uid, uid, uid, uid, uid, uid);
  return rows.map(rowToCommunity);
}

// Все участники: явные строки + члены чатов сообщества, минус вышедшие и забаненные.
function listMemberIds(communityId) {
  const community = getCommunity(communityId);
  if (!community) return [];
  const ids = new Set([community.ownerId]);
  for (const r of db.prepare("SELECT userId FROM community_members WHERE communityId = ? AND left = 0").all(communityId)) ids.add(r.userId);
  for (const r of db
    .prepare("SELECT DISTINCT m.userId FROM community_chats cc JOIN chat_members m ON m.chatId = cc.chatId WHERE cc.communityId = ?")
    .all(communityId)) {
    ids.add(r.userId);
  }
  const left = new Set(db.prepare("SELECT userId FROM community_members WHERE communityId = ? AND left = 1").all(communityId).map((r) => r.userId));
  const banned = new Set(db.prepare("SELECT userId FROM community_bans WHERE communityId = ?").all(communityId).map((r) => r.userId));
  return [...ids].filter((id) => id === community.ownerId || (!left.has(id) && !banned.has(id)));
}

// ---------- администраторы ----------

function listAdmins(communityId) {
  return db
    .prepare("SELECT userId, rights FROM community_members WHERE communityId = ? AND role = 'admin' AND left = 0 ORDER BY joinedAt ASC")
    .all(communityId)
    .map((r) => ({ userId: r.userId, rights: parseRights(r.rights) }));
}

function setAdmin(communityId, userId, rights) {
  ensureMemberRow(communityId, userId);
  db.prepare("UPDATE community_members SET role = 'admin', rights = ?, left = 0 WHERE communityId = ? AND userId = ?").run(
    JSON.stringify(cleanRights(rights)),
    communityId,
    userId
  );
}

function removeAdmin(communityId, userId) {
  db.prepare("UPDATE community_members SET role = 'member', rights = NULL WHERE communityId = ? AND userId = ? AND role = 'admin'").run(communityId, userId);
}

// ---------- баны ----------

function listBans(communityId) {
  return db.prepare("SELECT userId, bannedBy, bannedAt FROM community_bans WHERE communityId = ? ORDER BY bannedAt DESC").all(communityId);
}

function banUser(communityId, userId, bannedBy) {
  db.transaction(() => {
    db.prepare("INSERT OR REPLACE INTO community_bans (communityId, userId, bannedBy, bannedAt) VALUES (?, ?, ?, ?)").run(communityId, userId, bannedBy, new Date().toISOString());
    db.prepare("DELETE FROM community_members WHERE communityId = ? AND userId = ?").run(communityId, userId);
    db.prepare("DELETE FROM community_requests WHERE communityId = ? AND suggestedBy = ?").run(communityId, userId);
  })();
}

function unbanUser(communityId, userId) {
  return db.prepare("DELETE FROM community_bans WHERE communityId = ? AND userId = ?").run(communityId, userId).changes > 0;
}

// ---------- заявки на добавление чатов ----------

function rowToRequest(r) {
  return r && { id: r.id, communityId: r.communityId, chatId: r.chatId, suggestedBy: r.suggestedBy, visible: !!r.visible, createdAt: r.createdAt };
}

function listRequests(communityId) {
  return db.prepare("SELECT * FROM community_requests WHERE communityId = ? ORDER BY createdAt ASC").all(communityId).map(rowToRequest);
}

function countRequests(communityId) {
  return db.prepare("SELECT COUNT(*) AS n FROM community_requests WHERE communityId = ?").get(communityId).n;
}

function getRequest(id) {
  return rowToRequest(db.prepare("SELECT * FROM community_requests WHERE id = ?").get(id));
}

// false — на этот чат уже есть заявка в это сообщество.
function addRequest({ id, communityId, chatId, suggestedBy, visible }) {
  const res = db
    .prepare("INSERT OR IGNORE INTO community_requests (id, communityId, chatId, suggestedBy, visible, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, communityId, chatId, suggestedBy, visible ? 1 : 0, new Date().toISOString());
  return res.changes > 0;
}

function deleteRequest(id) {
  db.prepare("DELETE FROM community_requests WHERE id = ?").run(id);
}

module.exports = {
  RIGHTS,
  DEFAULT_ADMIN_RIGHTS,
  cleanRights,
  getCommunity,
  communityOfChat,
  createCommunity,
  updateCommunity,
  deleteCommunity,
  addChatToCommunity,
  removeChatFromCommunity,
  setCommunityChatVisible,
  roleOf,
  rightsOf,
  prefsOf,
  setPrefs,
  joinCommunity,
  leaveCommunity,
  listCommunitiesForUser,
  listMemberIds,
  isBanned,
  listAdmins,
  setAdmin,
  removeAdmin,
  listBans,
  banUser,
  unbanUser,
  listRequests,
  countRequests,
  getRequest,
  addRequest,
  deleteRequest,
};
