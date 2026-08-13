const db = require("../db");

function rowToChat(row) {
  if (!row) return undefined;
  const members = db.prepare("SELECT userId, isAdmin FROM chat_members WHERE chatId = ?").all(row.id);
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description ?? undefined,
    username: row.username ?? undefined,
    isPublic: !!row.isPublic || undefined,
    avatarColor: row.avatarColor ?? undefined,
    avatarImage: row.avatarImage ?? undefined,
    ownerId: row.ownerId ?? undefined,
    adminIds: members.filter((m) => m.isAdmin).map((m) => m.userId),
    memberIds: members.map((m) => m.userId),
    pinned: !!row.pinned,
    muted: !!row.muted,
    archived: !!row.archived,
    createdAt: row.createdAt,
    linkedDiscussionChatId: row.linkedDiscussionChatId ?? undefined,
    restrictions: row.restrictions ? JSON.parse(row.restrictions) : {},
    points: row.points ?? 0,
    votes: row.votes ? JSON.parse(row.votes) : {},
    autoDeleteSeconds: row.autoDeleteSeconds ?? undefined,
  };
}

async function listChats() {
  return db.prepare("SELECT * FROM chats").all().map(rowToChat);
}

async function listChatsForUser(userId) {
  const rows = db
    .prepare("SELECT c.* FROM chats c JOIN chat_members m ON m.chatId = c.id WHERE m.userId = ?")
    .all(userId);
  return rows.map(rowToChat);
}

async function getChat(id) {
  return rowToChat(db.prepare("SELECT * FROM chats WHERE id = ?").get(id));
}

// Case-insensitive (lower() comparison, same convention as
// findUserByUsername) — usernames and channel usernames share one visible
// @handle namespace (see routes/chats.js's /:id/public), even though they
// live in separate columns on separate tables.
async function findChatByUsername(username) {
  const normalized = (username ?? "").trim().toLowerCase();
  if (!normalized) return undefined;
  return rowToChat(db.prepare("SELECT * FROM chats WHERE lower(username) = ? AND username IS NOT NULL").get(normalized));
}

// Public-channel directory (routes/channels.js) — title/username substring
// match. SQLite's LIKE is already case-insensitive for ASCII by default
// (case_sensitive_like pragma is off), so no lower()/COLLATE needed here
// the way the exact-match lookup above needs it. Small-scale LIKE scan is
// fine at this app's size (see AGENTS.md: single-process, not built for
// horizontal scale); revisit with FTS5 if the channel count ever gets large.
async function searchPublicChannels(query) {
  const q = `%${(query ?? "").trim()}%`;
  const rows = db
    .prepare("SELECT * FROM chats WHERE type = 'channel' AND isPublic = 1 AND (title LIKE ? OR username LIKE ?) ORDER BY title ASC LIMIT 50")
    .all(q, q);
  return rows.map(rowToChat);
}

// De-duplicates because chat_members' primary key is (chatId, userId): a caller
// passing the same id twice used to abort the whole transaction with a UNIQUE
// constraint error and surface as a 500. The real case is a self-chat ("Saved
// messages" — routes/chats.js's POST / with userId === req.uid builds
// [uid, uid]), which is a legitimate chat that simply has one member; premium.js
// already relies on findOrCreateDm(uid, uid) working. Falsy ids are dropped for
// the same "one bad argument shouldn't fail the write" reason.
const setMembers = db.transaction((chatId, memberIds, adminIds) => {
  db.prepare("DELETE FROM chat_members WHERE chatId = ?").run(chatId);
  const insert = db.prepare("INSERT INTO chat_members (chatId, userId, isAdmin) VALUES (?, ?, ?)");
  for (const userId of new Set((memberIds ?? []).filter(Boolean))) {
    insert.run(chatId, userId, adminIds?.includes(userId) ? 1 : 0);
  }
});

async function createChat(chat) {
  db.prepare(
    `INSERT INTO chats (id, type, title, description, username, isPublic, avatarColor, avatarImage, ownerId, pinned, muted, archived, createdAt, linkedDiscussionChatId, restrictions, points, votes)
     VALUES (@id, @type, @title, @description, @username, @isPublic, @avatarColor, @avatarImage, @ownerId, @pinned, @muted, @archived, @createdAt, @linkedDiscussionChatId, @restrictions, @points, @votes)`
  ).run({
    id: chat.id,
    type: chat.type,
    title: chat.title ?? "",
    description: chat.description ?? null,
    username: chat.username ?? null,
    isPublic: chat.isPublic ? 1 : 0,
    avatarColor: chat.avatarColor ?? null,
    avatarImage: chat.avatarImage ?? null,
    ownerId: chat.ownerId ?? null,
    pinned: chat.pinned ? 1 : 0,
    muted: chat.muted ? 1 : 0,
    archived: chat.archived ? 1 : 0,
    createdAt: chat.createdAt,
    linkedDiscussionChatId: chat.linkedDiscussionChatId ?? null,
    restrictions: chat.restrictions ? JSON.stringify(chat.restrictions) : null,
    points: chat.points ?? 0,
    votes: chat.votes ? JSON.stringify(chat.votes) : null,
  });
  setMembers(chat.id, chat.memberIds ?? [], chat.adminIds ?? []);
  return getChat(chat.id);
}

const PATCHABLE_FIELDS = [
  "type", "title", "description", "username", "isPublic", "avatarColor", "avatarImage",
  "ownerId", "pinned", "muted", "archived", "createdAt", "linkedDiscussionChatId", "points",
  "autoDeleteSeconds",
];

async function updateChat(id, patch) {
  const existing = db.prepare("SELECT id FROM chats WHERE id = ?").get(id);
  if (!existing) return undefined;

  const fields = Object.keys(patch).filter((k) => PATCHABLE_FIELDS.includes(k));
  if (fields.length > 0) {
    const setClause = fields.map((f) => `${f} = @${f}`).join(", ");
    const values = {};
    for (const f of fields) {
      const v = patch[f];
      values[f] = typeof v === "boolean" ? (v ? 1 : 0) : v ?? null;
    }
    db.prepare(`UPDATE chats SET ${setClause} WHERE id = @id`).run({ ...values, id });
  }
  // memberIds/adminIds are patched together (see server/routes/chats.js —
  // every caller that changes membership passes both) so the join table can
  // just be replaced wholesale rather than diffed.
  if ("memberIds" in patch || "adminIds" in patch) {
    const current = rowToChat(db.prepare("SELECT * FROM chats WHERE id = ?").get(id));
    setMembers(id, patch.memberIds ?? current.memberIds, patch.adminIds ?? current.adminIds);
  }
  // A plain object, not a PATCHABLE_FIELDS scalar — stringified separately
  // rather than going through the generic loop above.
  if ("restrictions" in patch) {
    db.prepare("UPDATE chats SET restrictions = ? WHERE id = ?").run(JSON.stringify(patch.restrictions ?? {}), id);
  }
  if ("votes" in patch) {
    db.prepare("UPDATE chats SET votes = ? WHERE id = ?").run(JSON.stringify(patch.votes ?? {}), id);
  }
  return getChat(id);
}

async function deleteChat(id) {
  db.prepare("DELETE FROM chats WHERE id = ?").run(id);
}

module.exports = { listChats, listChatsForUser, getChat, updateChat, createChat, deleteChat, findChatByUsername, searchPublicChannels };
