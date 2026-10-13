const db = require("../db");

const FILE_RE = /\/uploads\/([a-z0-9]+_[a-f0-9]{16}(?:\.[a-z0-9]{1,12})?)/g;

function registerAttachments(chatId, attachments) {
  if (!chatId || !attachments?.length) return;
  const insert = db.prepare("INSERT OR IGNORE INTO upload_access (filename, chatId) VALUES (?, ?)");
  for (const a of attachments) {
    for (const value of [a?.url, a?.thumbUrl, a?.poster, a?.posterUrl, a?.previewUrl, a?.originalUrl]) {
      for (const m of String(value ?? "").matchAll(FILE_RE)) insert.run(m[1], chatId);
    }
  }
}

function canAccessUpload(userId, filename) {
  if (!userId || !filename) return false;
  const owners = db.prepare("SELECT chatId FROM upload_access WHERE filename = ?").all(filename);
  if (!owners.length) return true;
  const holes = owners.map(() => "?").join(",");
  const row = db
    .prepare(`SELECT 1 AS ok FROM chat_members WHERE userId = ? AND chatId IN (${holes}) LIMIT 1`)
    .get(userId, ...owners.map((o) => o.chatId));
  if (row) return true;
  // Превью публичного канала/группы видят и не вступившие — медиа из ленты тоже.
  const pub = db
    .prepare(`SELECT 1 AS ok FROM chats WHERE id IN (${holes}) AND isPublic = 1 AND secret = 0 AND type IN ('channel', 'group') LIMIT 1`)
    .get(...owners.map((o) => o.chatId));
  return !!pub;
}

module.exports = { registerAttachments, canAccessUpload };
