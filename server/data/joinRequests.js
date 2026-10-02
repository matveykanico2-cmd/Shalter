const db = require("../db");

function listRequests(chatId) {
  return db.prepare("SELECT * FROM join_requests WHERE chatId = ? ORDER BY createdAt ASC").all(chatId);
}

function hasRequest(chatId, userId) {
  return !!db.prepare("SELECT 1 FROM join_requests WHERE chatId = ? AND userId = ?").get(chatId, userId);
}

function addRequest(chatId, userId) {
  db.prepare("INSERT OR IGNORE INTO join_requests (chatId, userId, createdAt) VALUES (?, ?, ?)").run(
    chatId,
    userId,
    new Date().toISOString()
  );
}

function removeRequest(chatId, userId) {
  db.prepare("DELETE FROM join_requests WHERE chatId = ? AND userId = ?").run(chatId, userId);
}

module.exports = { listRequests, hasRequest, addRequest, removeRequest };
