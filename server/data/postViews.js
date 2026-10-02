const db = require("../db");

function recordView(postId, userId) {
  const res = db
    .prepare("INSERT OR IGNORE INTO post_views (postId, userId, viewedAt) VALUES (?, ?, ?)")
    .run(postId, userId, new Date().toISOString());
  return res.changes > 0;
}

function countViewers(postId) {
  return db.prepare("SELECT COUNT(*) AS n FROM post_views WHERE postId = ?").get(postId).n;
}

module.exports = { recordView, countViewers };
