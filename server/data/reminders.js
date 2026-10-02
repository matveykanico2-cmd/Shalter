const db = require("../db");
const { encryptText, decryptText } = require("../lib/textCrypto");

const aad = (id) => `remind:${id}`;

function addReminder({ id, userId, chatId, text, dueAt, createdAt }) {
  db.prepare(
    "INSERT INTO reminders (id, userId, chatId, text, dueAt, sent, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?)"
  ).run(id, userId, chatId, encryptText(aad(id), text), dueAt, createdAt);
}

function listDueReminders(nowIso) {
  return db
    .prepare("SELECT * FROM reminders WHERE sent = 0 AND dueAt <= ?")
    .all(nowIso)
    .map((r) => ({ ...r, text: decryptText(aad(r.id), r.text) }));
}

function markReminderSent(id) {
  db.prepare("UPDATE reminders SET sent = 1 WHERE id = ?").run(id);
}

module.exports = { addReminder, listDueReminders, markReminderSent };
