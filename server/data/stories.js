const db = require("../db");

const TTL_MS = 24 * 60 * 60 * 1000;

function itemsOf(row) {
  try {
    const parsed = row.items ? JSON.parse(row.items) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
  }
  return [{ kind: row.kind, url: row.url }];
}

function rowToStory(row) {
  if (!row) return undefined;
  const items = itemsOf(row);
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    url: row.url,
    items,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    viewedByIds: JSON.parse(row.viewedByIds),
    likedByIds: JSON.parse(row.likedByIds ?? "[]"),
  };
}

async function listAllStories() {
  const nowIso = new Date().toISOString();
  return db.prepare("SELECT * FROM stories WHERE expiresAt > ?").all(nowIso).map(rowToStory);
}

async function listStoriesForUsers(userIds) {
  const all = await listAllStories();
  return all.filter((s) => userIds.includes(s.userId));
}

async function listArchivedStoriesFor(userId) {
  return db
    .prepare("SELECT * FROM stories WHERE userId = ? ORDER BY createdAt DESC")
    .all(userId)
    .map(rowToStory);
}

async function addStory(story) {
  const items = story.items?.length ? story.items : [{ kind: story.kind, url: story.url }];
  db.prepare(
    "INSERT INTO stories (id, userId, kind, url, items, createdAt, expiresAt, viewedByIds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    story.id,
    story.userId,
    items[0].kind,
    items[0].url,
    JSON.stringify(items),
    story.createdAt,
    story.expiresAt,
    JSON.stringify(story.viewedByIds ?? [])
  );
  return rowToStory(db.prepare("SELECT * FROM stories WHERE id = ?").get(story.id));
}

async function getStoryById(id) {
  return rowToStory(db.prepare("SELECT * FROM stories WHERE id = ?").get(id));
}

async function markViewed(id, viewerId) {
  const row = db.prepare("SELECT viewedByIds FROM stories WHERE id = ?").get(id);
  if (!row) return undefined;
  const viewedByIds = JSON.parse(row.viewedByIds);
  if (!viewedByIds.includes(viewerId)) {
    viewedByIds.push(viewerId);
    db.prepare("UPDATE stories SET viewedByIds = ? WHERE id = ?").run(JSON.stringify(viewedByIds), id);
  }
  return rowToStory(db.prepare("SELECT * FROM stories WHERE id = ?").get(id));
}

async function deleteStory(id, userId) {
  const result = db.prepare("DELETE FROM stories WHERE id = ? AND userId = ?").run(id, userId);
  return result.changes > 0;
}

async function toggleLike(id, userId) {
  const row = db.prepare("SELECT likedByIds FROM stories WHERE id = ?").get(id);
  if (!row) return undefined;
  const likedByIds = JSON.parse(row.likedByIds ?? "[]");
  const index = likedByIds.indexOf(userId);
  if (index === -1) likedByIds.push(userId);
  else likedByIds.splice(index, 1);
  db.prepare("UPDATE stories SET likedByIds = ? WHERE id = ?").run(JSON.stringify(likedByIds), id);
  return rowToStory(db.prepare("SELECT * FROM stories WHERE id = ?").get(id));
}

function rowToComment(row) {
  if (!row) return undefined;
  const likedByIds = JSON.parse(row.likedByIds ?? "[]");
  return {
    id: row.id,
    storyId: row.storyId,
    userId: row.userId,
    text: row.text,
    createdAt: row.createdAt,
    editedAt: row.editedAt ?? undefined,
    parentId: row.parentId ?? null,
    likedByIds,
    likeCount: likedByIds.length,
  };
}

async function getComment(id) {
  return rowToComment(db.prepare("SELECT * FROM story_comments WHERE id = ?").get(id));
}

async function editComment(id, text) {
  db.prepare("UPDATE story_comments SET text = ?, editedAt = ? WHERE id = ?").run(text, new Date().toISOString(), id);
  return getComment(id);
}

async function deleteComment(id) {
  db.prepare("DELETE FROM story_comments WHERE id = ?").run(id);
}

async function listComments(storyId) {
  return db
    .prepare("SELECT * FROM story_comments WHERE storyId = ? ORDER BY createdAt ASC")
    .all(storyId)
    .map(rowToComment);
}

async function addComment(comment) {
  db.prepare("INSERT INTO story_comments (id, storyId, userId, text, createdAt, parentId) VALUES (?, ?, ?, ?, ?, ?)").run(
    comment.id,
    comment.storyId,
    comment.userId,
    comment.text,
    comment.createdAt,
    comment.parentId ?? null
  );
  return rowToComment(db.prepare("SELECT * FROM story_comments WHERE id = ?").get(comment.id));
}

async function toggleCommentLike(id, userId) {
  const row = db.prepare("SELECT likedByIds FROM story_comments WHERE id = ?").get(id);
  if (!row) return undefined;
  const likedByIds = JSON.parse(row.likedByIds ?? "[]");
  const i = likedByIds.indexOf(userId);
  if (i === -1) likedByIds.push(userId);
  else likedByIds.splice(i, 1);
  db.prepare("UPDATE story_comments SET likedByIds = ? WHERE id = ?").run(JSON.stringify(likedByIds), id);
  return getComment(id);
}

module.exports = {
  TTL_MS,
  listAllStories,
  listStoriesForUsers,
  listArchivedStoriesFor,
  addStory,
  getStoryById,
  markViewed,
  deleteStory,
  toggleLike,
  listComments,
  addComment,
  toggleCommentLike,
  getComment,
  editComment,
  deleteComment,
};
