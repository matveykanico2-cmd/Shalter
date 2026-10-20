const db = require("../db");

const FILE_RE = /\/uploads\/([a-z0-9]+_[a-f0-9]{16}(?:\.[a-z0-9]{1,12})?)/g;
const FILENAME_RE = /^[a-z0-9]+_[a-f0-9]{16}(\.[a-z0-9]{1,12})?$/;
const UPLOAD_URL_RE = /^\/uploads\/([a-z0-9]+_[a-f0-9]{16}(?:\.[a-z0-9]{1,12})?)$/;

function filenamesOf(attachments) {
  const out = new Set();
  for (const a of attachments ?? []) {
    for (const value of [a?.url, a?.thumbUrl, a?.poster, a?.posterUrl, a?.previewUrl, a?.originalUrl]) {
      for (const m of String(value ?? "").matchAll(FILE_RE)) out.add(m[1]);
    }
  }
  return out;
}

// Файлы вложений привязываются к чату — их скачивают участники. С `by` привязываются
// только файлы, к которым у отправителя уже есть доступ: иначе, зная чужой адрес,
// можно было бы прикрепить чужую неприкреплённую загрузку к своему чату и скачать её.
function registerAttachments(chatId, attachments, { by } = {}) {
  if (!chatId || !attachments?.length) return;
  const insert = db.prepare("INSERT OR IGNORE INTO upload_access (filename, chatId) VALUES (?, ?)");
  for (const filename of filenamesOf(attachments)) {
    if (by && !canAccessUpload(by, filename)) continue;
    insert.run(filename, chatId);
  }
}

// Сообщение удалено у всех: файлы, на которые в этом чате больше не ссылается ни одно
// сообщение, перестают быть доступны его участникам (загрузившему — остаются).
function revokeAttachments(chatId, attachments) {
  if (!chatId || !attachments?.length) return;
  const stillUsed = db.prepare(
    "SELECT 1 AS ok FROM messages WHERE chatId = ? AND (instr(attachments, ?) > 0 OR instr(sticker, ?) > 0) LIMIT 1"
  );
  const remove = db.prepare("DELETE FROM upload_access WHERE filename = ? AND chatId = ?");
  for (const filename of filenamesOf(attachments)) {
    const ref = `/uploads/${filename}`;
    if (!stillUsed.get(chatId, ref, ref)) remove.run(filename, chatId);
  }
}

function recordUploader(filename, userId) {
  if (!filename || !userId) return;
  db.prepare("INSERT OR IGNORE INTO upload_uploaders (filename, userId, createdAt) VALUES (?, ?, ?)").run(
    filename,
    userId,
    new Date().toISOString()
  );
}

function isUploader(userId, filename) {
  return !!db.prepare("SELECT 1 AS ok FROM upload_uploaders WHERE filename = ? AND userId = ?").get(filename, userId);
}

// Ссылка /uploads/… на файл, который этот пользователь сам загрузил (аватарка, баннер,
// музыка профиля). Чужие, выдуманные и с «..» — нет.
async function isOwnUploadUrl(userId, url) {
  const m = typeof url === "string" ? url.match(UPLOAD_URL_RE) : null;
  if (!m || !userId || !isUploader(userId, m[1])) return false;
  return !!(await require("./storage").exists(m[1]).catch(() => false));
}

// Платный пост: настоящие файлы — участнику чата, если он автор, админ канала или купил.
function paidAccess(userId, filename) {
  const rows = db
    .prepare(
      `SELECT p.messageId, p.chatId, m.senderId, c.type, c.ownerId
         FROM paid_media p
         JOIN messages m ON m.id = p.messageId
         JOIN chats c ON c.id = p.chatId
        WHERE instr(p.attachments, ?) > 0`
    )
    .all(`/uploads/${filename}`);
  if (!rows.length) return { found: false, ok: false };
  const member = db.prepare("SELECT isAdmin, isModerator, isOwner FROM chat_members WHERE chatId = ? AND userId = ?");
  const bought = db.prepare("SELECT 1 AS ok FROM paid_media_buyers WHERE messageId = ? AND userId = ?");
  for (const r of rows) {
    const me = member.get(r.chatId, userId);
    if (!me) continue;
    const staff = r.type === "channel" && (r.ownerId === userId || me.isAdmin || me.isModerator || me.isOwner);
    if (r.senderId === userId || staff || bought.get(r.messageId, userId)) return { found: true, ok: true };
  }
  return { found: true, ok: false };
}

// Где ссылка на файл делает его общедоступным (для вошедших): аватарки, истории,
// стикер-паки, подарки, обои и т. п. Только колонки с медиа, которые маршруты проверяют
// через isOwnUploadUrl/usesForeignUpload: в любое другое текстовое поле (заметка к
// контакту, правила чата, короткая ссылка…) можно вписать чужой адрес, и файл не должен
// от этого открываться всем. Новая колонка с медиа — добавить сюда и в проверку маршрута.
const REFERENCE_COLUMNS = {
  users: ["avatarImage", "avatarImages", "profileBanner", "adAttachments", "giftsReceived", "statusItems", "profileTrack"],
  chats: ["avatarImage", "wallpaper"],
  settings: ["data"],
  bots: ["code", "appUrl", "appCode"],
  stories: ["url", "items"],
  sticker_packs: ["stickers"],
  gift_catalog: ["mediaUrl", "scene"],
  games: ["code"],
  ad_campaigns: ["url", "imageUrl"],
  communities: ["avatarImage"],
  profile_statuses: ["image"],
};
let referenceColumns = null;
function listReferenceColumns() {
  if (referenceColumns) return referenceColumns;
  const out = [];
  for (const [table, names] of Object.entries(REFERENCE_COLUMNS)) {
    let existing = new Set();
    try {
      existing = new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name));
    } catch {
      continue;
    }
    for (const name of names) {
      if (!existing.has(name)) continue;
      out.push(db.prepare(`SELECT 1 AS ok FROM "${table}" WHERE instr("${name}", ?) > 0 LIMIT 1`));
    }
  }
  referenceColumns = out;
  return out;
}

const publicCache = new Set();
function isReferencedOutsideChats(filename) {
  if (publicCache.has(filename)) return true;
  const ref = `/uploads/${filename}`;
  for (const stmt of listReferenceColumns()) {
    try {
      if (stmt.get(ref)) {
        if (publicCache.size > 5000) publicCache.clear();
        publicCache.add(filename);
        return true;
      }
    } catch {
    }
  }
  return false;
}

function canAccessUpload(userId, filename) {
  if (!userId || !filename || !FILENAME_RE.test(filename)) return false;
  // У загрузившего байты и так есть.
  if (isUploader(userId, filename)) return true;
  const owners = db.prepare("SELECT chatId FROM upload_access WHERE filename = ?").all(filename);
  if (owners.length) {
    const holes = owners.map(() => "?").join(",");
    const row = db
      .prepare(`SELECT 1 AS ok FROM chat_members WHERE userId = ? AND chatId IN (${holes}) LIMIT 1`)
      .get(userId, ...owners.map((o) => o.chatId));
    if (row) return true;
    // Превью публичного канала/группы видят и не вступившие — медиа из ленты тоже.
    const pub = db
      .prepare(`SELECT 1 AS ok FROM chats WHERE id IN (${holes}) AND isPublic = 1 AND secret = 0 AND type IN ('channel', 'group') LIMIT 1`)
      .get(...owners.map((o) => o.chatId));
    if (pub) return true;
  }
  const paid = paidAccess(userId, filename);
  if (paid.ok) return true;
  if (owners.length || paid.found) return false;
  // Ни к одному чату не прикреплён: аватарки, истории, стикеры и т. п. — всем вошедшим;
  // просто загруженный (или файл удалённого у всех сообщения) — только загрузившему.
  return isReferencedOutsideChats(filename);
}

// Все /uploads/… внутри значения (ссылка, объект, список) — как их найдёт
// isReferencedOutsideChats, т.е. в любом месте строки.
function uploadNamesIn(value) {
  const out = new Set();
  if (value === undefined || value === null) return out;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const m of String(text ?? "").matchAll(FILE_RE)) out.add(m[1]);
  return out;
}

// Ссылка на файл в аватарке чата, стикере, истории, обоях и т. п. делает его доступным
// всем вошедшим. Поэтому туда можно ставить только свои загрузки или файлы, которые
// пользователь и так может скачать; файлы из прежнего значения (`previous`) — всегда,
// чтобы повторное сохранение без изменений не ломалось.
function usesForeignUpload(userId, value, previous) {
  const before = uploadNamesIn(previous);
  for (const name of uploadNamesIn(value)) {
    if (before.has(name)) continue;
    if (!canAccessUpload(userId, name)) return true;
  }
  return false;
}

// Раньше настоящие файлы платных постов привязывались к чату — их скачивал любой
// участник по прямой ссылке. Снимаем такие привязки, если обычные сообщения чата
// на файл не ссылаются.
function dropPaidChatAccess() {
  try {
    const rows = db.prepare("SELECT chatId, attachments FROM paid_media").all();
    const tx = db.transaction(() => {
      for (const row of rows) {
        let list = [];
        try {
          list = JSON.parse(row.attachments || "[]");
        } catch {
          continue;
        }
        revokeAttachments(row.chatId, list);
      }
    });
    tx();
  } catch (err) {
    console.error("[uploads] не удалось снять доступ к платным файлам:", err.message);
  }
}
dropPaidChatAccess();

module.exports = { registerAttachments, revokeAttachments, recordUploader, isOwnUploadUrl, canAccessUpload, usesForeignUpload };
