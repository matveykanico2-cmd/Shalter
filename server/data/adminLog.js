// Журнал действий администраторов группы или канала («Недавние действия» в
// Telegram): кто кого удалил, заблокировал, повысил, что поменял. Хранится 30
// дней.
const db = require("../db");

const KEEP_DAYS = 30;

function logAdminAction(chatId, actorId, action, { targetId = null, details = null } = {}) {
  try {
    db.prepare("INSERT INTO chat_admin_log (chatId, actorId, action, targetId, details, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(
      chatId,
      actorId,
      action,
      targetId,
      details ? JSON.stringify(details) : null,
      new Date().toISOString()
    );
  } catch {
    // Журнал — вспомогательный: из-за него действие не должно падать.
  }
}

function listAdminLog(chatId, { limit = 100, beforeId = null } = {}) {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400_000).toISOString();
  db.prepare("DELETE FROM chat_admin_log WHERE chatId = ? AND createdAt < ?").run(chatId, cutoff);
  const rows = beforeId
    ? db.prepare("SELECT * FROM chat_admin_log WHERE chatId = ? AND id < ? ORDER BY id DESC LIMIT ?").all(chatId, beforeId, limit)
    : db.prepare("SELECT * FROM chat_admin_log WHERE chatId = ? ORDER BY id DESC LIMIT ?").all(chatId, limit);
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actorId,
    action: r.action,
    targetId: r.targetId ?? undefined,
    details: r.details ? JSON.parse(r.details) : undefined,
    createdAt: r.createdAt,
  }));
}

module.exports = { logAdminAction, listAdminLog };
