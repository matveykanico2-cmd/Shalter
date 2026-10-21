const db = require("../db");

// Удалённые объекты S3 помнятся час: столько может длиться перешифровка одного файла.
// Запись в базе, а не в памяти — её видит и скрипт переноса в другом процессе.
const KEEP_MS = 60 * 60 * 1000;

function recordDeletion(filename, at = Date.now()) {
  db.prepare("INSERT INTO upload_deletions (filename, deletedAt) VALUES (?, ?) ON CONFLICT(filename) DO UPDATE SET deletedAt = excluded.deletedAt").run(
    filename,
    at
  );
  db.prepare("DELETE FROM upload_deletions WHERE deletedAt < ?").run(at - KEEP_MS);
}

function deletedSince(filename, since) {
  const row = db.prepare("SELECT deletedAt FROM upload_deletions WHERE filename = ?").get(filename);
  return !!row && row.deletedAt >= since;
}

module.exports = { recordDeletion, deletedSince };
