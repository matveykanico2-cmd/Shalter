const db = require("../db");

function rowToScheduled(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    chatId: row.chatId,
    senderId: row.senderId,
    text: row.text,
    attachments: row.attachments ? JSON.parse(row.attachments) : undefined,
    replyToId: row.replyToId ?? null,
    sendAt: row.sendAt,
    createdAt: row.createdAt,
  };
}

async function listScheduledFor(chatId, senderId) {
  return db
    .prepare("SELECT * FROM scheduled_messages WHERE chatId = ? AND senderId = ? ORDER BY sendAt ASC")
    .all(chatId, senderId)
    .map(rowToScheduled);
}

async function getScheduled(id) {
  return rowToScheduled(db.prepare("SELECT * FROM scheduled_messages WHERE id = ?").get(id));
}

async function addScheduled(msg) {
  db.prepare(
    `INSERT INTO scheduled_messages (id, chatId, senderId, text, attachments, replyToId, sendAt, createdAt)
     VALUES (@id, @chatId, @senderId, @text, @attachments, @replyToId, @sendAt, @createdAt)`
  ).run({
    id: msg.id,
    chatId: msg.chatId,
    senderId: msg.senderId,
    text: msg.text ?? "",
    attachments: msg.attachments ? JSON.stringify(msg.attachments) : null,
    replyToId: msg.replyToId ?? null,
    sendAt: msg.sendAt,
    createdAt: msg.createdAt,
  });
  return getScheduled(msg.id);
}

async function editScheduled(id, patch) {
  const existing = await getScheduled(id);
  if (!existing) return undefined;
  db.prepare("UPDATE scheduled_messages SET text = ?, sendAt = ? WHERE id = ?").run(
    patch.text ?? existing.text,
    patch.sendAt ?? existing.sendAt,
    id
  );
  return getScheduled(id);
}

async function deleteScheduled(id) {
  db.prepare("DELETE FROM scheduled_messages WHERE id = ?").run(id);
}

function listDue(nowIso) {
  return db.prepare("SELECT * FROM scheduled_messages WHERE sendAt <= ?").all(nowIso).map(rowToScheduled);
}

module.exports = { listScheduledFor, getScheduled, addScheduled, editScheduled, deleteScheduled, listDue };
