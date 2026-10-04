const db = require("../db");

const ADD_MODES = new Set(["all", "admins"]);

function rowToCommunity(row) {
  if (!row) return undefined;
  const chats = db
    .prepare("SELECT chatId, visible FROM community_chats WHERE communityId = ? ORDER BY addedAt ASC")
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
    // Скрытые чаты остаются в сообществе, но не показываются в списке (tweb: linked_peers.visible).
    hiddenChatIds: chats.filter((c) => !c.visible).map((c) => c.chatId),
  };
}

function getCommunity(id) {
  return rowToCommunity(db.prepare("SELECT * FROM communities WHERE id = ?").get(id));
}

function listCommunitiesOwnedBy(ownerId) {
  return db.prepare("SELECT * FROM communities WHERE ownerId = ? ORDER BY createdAt DESC").all(ownerId).map(rowToCommunity);
}

// Сообщества, которые видит пользователь: свои и те, где он состоит хотя бы в одном чате.
function listCommunitiesForUser(uid) {
  return db
    .prepare(
      `SELECT DISTINCT c.* FROM communities c
       LEFT JOIN community_chats cc ON cc.communityId = c.id
       LEFT JOIN chat_members m ON m.chatId = cc.chatId AND m.userId = ?
       WHERE c.ownerId = ? OR m.userId IS NOT NULL
       ORDER BY c.createdAt DESC`
    )
    .all(uid, uid)
    .map(rowToCommunity);
}

function communityOfChat(chatId) {
  const row = db.prepare("SELECT communityId FROM community_chats WHERE chatId = ?").get(chatId);
  return row ? getCommunity(row.communityId) : undefined;
}

function createCommunity({ id, ownerId, title, description, avatarColor, avatarImage, addMode }) {
  db.prepare("INSERT INTO communities (id, ownerId, title, description, avatarColor, avatarImage, addMode, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    id,
    ownerId,
    title,
    description ?? null,
    avatarColor ?? null,
    avatarImage ?? null,
    ADD_MODES.has(addMode) ? addMode : "all",
    new Date().toISOString()
  );
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

// false — чат уже в другом сообществе.
function addChatToCommunity(communityId, chatId, { visible = true } = {}) {
  const taken = db.prepare("SELECT communityId FROM community_chats WHERE chatId = ?").get(chatId);
  if (taken) return taken.communityId === communityId;
  db.prepare("INSERT INTO community_chats (chatId, communityId, visible, addedAt) VALUES (?, ?, ?, ?)").run(
    chatId,
    communityId,
    visible ? 1 : 0,
    new Date().toISOString()
  );
  return true;
}

function removeChatFromCommunity(communityId, chatId) {
  db.prepare("DELETE FROM community_chats WHERE communityId = ? AND chatId = ?").run(communityId, chatId);
}

// Скрытие чата не трогает его видимость для участников самого чата — только список сообщества.
function setCommunityChatVisible(communityId, chatId, visible) {
  db.prepare("UPDATE community_chats SET visible = ? WHERE communityId = ? AND chatId = ?").run(visible ? 1 : 0, communityId, chatId);
}

function deleteCommunity(id) {
  db.prepare("DELETE FROM communities WHERE id = ?").run(id);
}

module.exports = {
  getCommunity,
  listCommunitiesOwnedBy,
  listCommunitiesForUser,
  communityOfChat,
  createCommunity,
  updateCommunity,
  addChatToCommunity,
  removeChatFromCommunity,
  setCommunityChatVisible,
  deleteCommunity,
};