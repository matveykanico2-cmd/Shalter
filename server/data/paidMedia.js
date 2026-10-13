const db = require("../db");

function savePaidMedia(messageId, chatId, stars, attachments) {
  db.prepare("INSERT OR REPLACE INTO paid_media (messageId, chatId, stars, attachments, createdAt) VALUES (?, ?, ?, ?, ?)").run(
    messageId,
    chatId,
    stars,
    JSON.stringify(attachments ?? []),
    new Date().toISOString()
  );
}

function getPaidMedia(messageId) {
  const row = db.prepare("SELECT * FROM paid_media WHERE messageId = ?").get(messageId);
  if (!row) return null;
  return { ...row, attachments: JSON.parse(row.attachments || "[]") };
}

function hasBought(messageId, userId) {
  return !!db.prepare("SELECT 1 FROM paid_media_buyers WHERE messageId = ? AND userId = ?").get(messageId, userId);
}

function recordPurchase(messageId, userId) {
  db.prepare("INSERT OR IGNORE INTO paid_media_buyers (messageId, userId, createdAt) VALUES (?, ?, ?)").run(messageId, userId, new Date().toISOString());
}

function buyersCount(messageId) {
  return db.prepare("SELECT count(*) AS c FROM paid_media_buyers WHERE messageId = ?").get(messageId)?.c ?? 0;
}

module.exports = { savePaidMedia, getPaidMedia, hasBought, recordPurchase, buyersCount };
