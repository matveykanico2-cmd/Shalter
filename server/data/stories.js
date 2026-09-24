const db = require("../db");

const TTL_MS = 24 * 60 * 60 * 1000;

// Кадры истории. items появился позже kind/url, поэтому у старых записей его
// нет — там кадр ровно один, и он собирается из этих двух полей. kind и url
// продолжают отдаваться (это первый кадр): по ним рисуется обложка, и ломать
// всё, что их читает, ради нового поля незачем.
function itemsOf(row) {
  try {
    const parsed = row.items ? JSON.parse(row.items) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    // Битый JSON — не причина потерять историю целиком.
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
  // Expiry is filter-on-read (same approach as listMessages' chatClears
  // overlay), not a cleanup job — nothing else in this app runs on a timer,
  // and a story that's 25h old is equally "gone" whether or not a sweep
  // has gotten to it yet.
  const nowIso = new Date().toISOString();
  return db.prepare("SELECT * FROM stories WHERE expiresAt > ?").all(nowIso).map(rowToStory);
}

async function listStoriesForUsers(userIds) {
  const all = await listAllStories();
  return all.filter((s) => userIds.includes(s.userId));
}

// Архив: все истории человека, включая те, чьи сутки вышли.
//
// Отдельная функция, а не флаг у listAllStories: срок жизни истории — это её
// суть, и место, где он не действует, должно быть ровно одно и называться так,
// чтобы случайно им не воспользоваться. В ленте на «Чатах» и в кружках
// по-прежнему только живые истории.
//
// Работает это только потому, что истёкшие истории физически остаются в базе:
// срок проверяется при чтении, уборщика нет (см. listAllStories выше). То есть
// архив ничего не сохраняет дополнительно — он показывает то, что и так лежит.
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

// Удаляется история целиком — со всеми кадрами: они лежат в той же записи, и
// «удалить один снимок из пяти» здесь просто нет как действия.
async function deleteStory(id, userId) {
  const result = db.prepare("DELETE FROM stories WHERE id = ? AND userId = ?").run(id, userId);
  return result.changes > 0;
}

// Toggle, not set — the route doesn't know the current state, the button
// just says "переключить лайк на этой истории для этого зрителя".
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
  return { id: row.id, storyId: row.storyId, userId: row.userId, text: row.text, createdAt: row.createdAt, editedAt: row.editedAt ?? undefined };
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
  db.prepare("INSERT INTO story_comments (id, storyId, userId, text, createdAt) VALUES (?, ?, ?, ?, ?)").run(
    comment.id,
    comment.storyId,
    comment.userId,
    comment.text,
    comment.createdAt
  );
  return rowToComment(db.prepare("SELECT * FROM story_comments WHERE id = ?").get(comment.id));
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
  getComment,
  editComment,
  deleteComment,
};
