const crypto = require("crypto");
const db = require("../db");

function rowToBot(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    userId: row.userId,
    ownerId: row.ownerId ?? undefined,
    description: row.description ?? "",
    commands: JSON.parse(row.commands),
    createdAt: row.createdAt ?? undefined,
    code: row.code ?? undefined,
  };
}

function generateToken() {
  // Not a JWT/signed token — just an opaque random secret, looked up
  // directly against the bots.token column (see idx_bots_token). Simpler
  // than the Telegram Bot API's "<bot_id>:<random>" shape since Shalter has
  // no need to parse the bot's id back out of the token itself.
  return crypto.randomBytes(24).toString("hex");
}

function listBots() {
  return db.prepare("SELECT * FROM bots").all().map(rowToBot);
}

async function listBotsByOwner(ownerId) {
  return db.prepare("SELECT * FROM bots WHERE ownerId = ? ORDER BY createdAt DESC").all(ownerId).map(rowToBot);
}

async function getBotByUserId(userId) {
  return rowToBot(db.prepare("SELECT * FROM bots WHERE userId = ?").get(userId));
}

async function getBotByToken(token) {
  return rowToBot(db.prepare("SELECT * FROM bots WHERE token = ?").get(token));
}

async function getBot(id) {
  return rowToBot(db.prepare("SELECT * FROM bots WHERE id = ?").get(id));
}

// The bot's `id` is the same as its `userId` — same convention as the
// Shalter system bot (server/data/systemBot.js): a bot is fundamentally a
// `users` row (isBot: true, holds the avatar/name shown in chat) plus this
// row of bot-specific metadata layered on top of it.
async function createBot({ userId, ownerId, description }) {
  const token = generateToken();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO bots (id, userId, ownerId, token, description, commands, createdAt)
     VALUES (@id, @userId, @ownerId, @token, @description, '[]', @createdAt)`
  ).run({ id: userId, userId, ownerId, token, description: description ?? "", createdAt });
  return { bot: await getBot(userId), token };
}

async function regenerateToken(id) {
  const token = generateToken();
  db.prepare("UPDATE bots SET token = ? WHERE id = ?").run(token, id);
  return token;
}

async function deleteBot(id) {
  db.prepare("DELETE FROM bots WHERE id = ?").run(id);
}

async function updateBotCommands(id, commands) {
  db.prepare("UPDATE bots SET commands = ? WHERE id = ?").run(JSON.stringify(commands ?? []), id);
  return getBot(id);
}

async function updateBotCode(id, code) {
  db.prepare("UPDATE bots SET code = ? WHERE id = ?").run(code ?? null, id);
  return getBot(id);
}

module.exports = {
  listBots,
  listBotsByOwner,
  getBot,
  getBotByUserId,
  getBotByToken,
  createBot,
  regenerateToken,
  deleteBot,
  updateBotCode,
  updateBotCommands,
};
