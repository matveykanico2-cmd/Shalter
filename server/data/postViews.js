const db = require("../db");

// Кто уже засчитан в просмотрах поста.
//
// Смысл всего файла — в одном свойстве: повторный просмотр тем же человеком не
// должен увеличивать счётчик. Раньше эту роль играл readByIds на самом
// сообщении, и это оказалось неверно: чат помечает сообщения прочитанными при
// открытии, целиком и сразу, поэтому к моменту, когда пост доезжает до экрана,
// читатель уже «прочитал» его — и просмотр не засчитывался никогда.
function recordView(postId, userId) {
  // INSERT OR IGNORE + changes: одна операция вместо «проверить и вставить»,
  // которую двое читателей могли бы выполнить одновременно и оба посчитать
  // себя первыми.
  const res = db
    .prepare("INSERT OR IGNORE INTO post_views (postId, userId, viewedAt) VALUES (?, ?, ?)")
    .run(postId, userId, new Date().toISOString());
  return res.changes > 0;
}

function countViewers(postId) {
  return db.prepare("SELECT COUNT(*) AS n FROM post_views WHERE postId = ?").get(postId).n;
}

module.exports = { recordView, countViewers };
