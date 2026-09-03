const db = require("../db");

// Право скачать вложение.
//
// Вложение принадлежит чату (или нескольким — после пересылки), и скачать его
// может тот, кто в этом чате состоит. Файлы, которые ни к какому чату не
// привязаны — аватары, фотографии объявлений, обложки, кадры историй, — видны
// всем вошедшим: они и так показываются кому угодно в приложении.
const FILE_RE = /\/uploads\/([a-z0-9]+_[a-f0-9]{16}(?:\.[a-z0-9]{1,12})?)/g;

// Записать связь при отправке сообщения. Вызывается на доставке — то есть
// ровно тогда, когда вложение впервые появляется в чате.
function registerAttachments(chatId, attachments) {
  if (!chatId || !attachments?.length) return;
  const insert = db.prepare("INSERT OR IGNORE INTO upload_access (filename, chatId) VALUES (?, ?)");
  for (const a of attachments) {
    // И сам файл, и его эскиз: эскиз тоже часть переписки и не должен быть
    // доступнее её.
    for (const value of [a?.url, a?.thumbUrl, a?.poster]) {
      for (const m of String(value ?? "").matchAll(FILE_RE)) insert.run(m[1], chatId);
    }
  }
}

// Можно ли этому человеку отдать этот файл.
function canAccessUpload(userId, filename) {
  if (!userId || !filename) return false;
  const owners = db.prepare("SELECT chatId FROM upload_access WHERE filename = ?").all(filename);
  // Ничей файл — общедоступная картинка (аватар, объявление, история).
  if (!owners.length) return true;
  const holes = owners.map(() => "?").join(",");
  const row = db
    .prepare(`SELECT 1 AS ok FROM chat_members WHERE userId = ? AND chatId IN (${holes}) LIMIT 1`)
    .get(userId, ...owners.map((o) => o.chatId));
  return !!row;
}

module.exports = { registerAttachments, canAccessUpload };
