const db = require("../db");

function rowToCommunity(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    description: row.description ?? undefined,
    avatarColor: row.avatarColor ?? undefined,
    createdAt: row.createdAt,
    chatIds: db
      .prepare("SELECT chatId FROM community_chats WHERE communityId = ? ORDER BY addedAt ASC")
      .all(row.id)
      .map((r) => r.chatId),
  };
}

function getCommunity(id) {
  return rowToCommunity(db.prepare("SELECT * FROM communities WHERE id = ?").get(id));
}

function listCommunitiesOwnedBy(ownerId) {
  return db.prepare("SELECT * FROM communities WHERE ownerId = ? ORDER BY createdAt DESC").all(ownerId).map(rowToCommunity);
}

function communityOfChat(chatId) {
  const row = db.prepare("SELECT communityId FROM community_chats WHERE chatId = ?").get(chatId);
  return row ? getCommunity(row.communityId) : undefined;
}

function createCommunity({ id, ownerId, title, description, avatarColor }) {
  db.prepare("INSERT INTO communities (id, ownerId, title, description, avatarColor, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    ownerId,
    title,
    description ?? null,
    avatarColor ?? null,
    new Date().toISOString()
  );
  return getCommunity(id);
}

function updateCommunity(id, { title, description }) {
  const existing = getCommunity(id);
  if (!existing) return undefined;
  db.prepare("UPDATE communities SET title = ?, description = ? WHERE id = ?").run(
    title ?? existing.title,
    description === undefined ? existing.description ?? null : description || null,
    id
  );
  return getCommunity(id);
}

// false — чат уже в другом сообществе.
function addChatToCommunity(communityId, chatId) {
  const taken = db.prepare("SELECT communityId FROM community_chats WHERE chatId = ?").get(chatId);
  if (taken) return taken.communityId === communityId;
  db.prepare("INSERT INTO community_chats (chatId, communityId, addedAt) VALUES (?, ?, ?)").run(chatId, communityId, new Date().toISOString());
  return true;
}

function removeChatFromCommunity(communityId, chatId) {
  db.prepare("DELETE FROM community_chats WHERE communityId = ? AND chatId = ?").run(communityId, chatId);
}

function deleteCommunity(id) {
  db.prepare("DELETE FROM communities WHERE id = ?").run(id);
}

module.exports = {
  getCommunity,
  listCommunitiesOwnedBy,
  communityOfChat,
  createCommunity,
  updateCommunity,
  addChatToCommunity,
  removeChatFromCommunity,
  deleteCommunity,
};
