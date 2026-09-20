// Backing store for /remind (server/lib/helperBot/utility.js), delivered by
// server/lib/reminderSweep.js.
const db = require("../db");

function addReminder({ id, userId, chatId, text, dueAt, createdAt }) {
  db.prepare(
    "INSERT INTO reminders (id, userId, chatId, text, dueAt, sent, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?)"
  ).run(id, userId, chatId, text, dueAt, createdAt);
}

function listDueReminders(nowIso) {
  return db.prepare("SELECT * FROM reminders WHERE sent = 0 AND dueAt <= ?").all(nowIso);
}

function markReminderSent(id) {
  db.prepare("UPDATE reminders SET sent = 1 WHERE id = ?").run(id);
}

module.exports = { addReminder, listDueReminders, markReminderSent };
