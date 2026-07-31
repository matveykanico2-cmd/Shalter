const db = require("../db");

function rowToBot(row) {
  if (!row) return undefined;
  return { id: row.id, userId: row.userId, description: row.description ?? "", commands: JSON.parse(row.commands) };
}

function listBots() {
  return db.prepare("SELECT * FROM bots").all().map(rowToBot);
}

async function getBotByUserId(userId) {
  return rowToBot(db.prepare("SELECT * FROM bots WHERE userId = ?").get(userId));
}

module.exports = { listBots, getBotByUserId };
