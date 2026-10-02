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
    appUrl: row.appUrl ?? null,
    appName: row.appName || null,
    appCode: row.appCode ?? null,
  };
}

function generateToken() {
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

function countBotAudience(botUserId) {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT m.userId) AS n
         FROM chat_members m
        WHERE m.userId <> ?
          AND m.chatId IN (SELECT chatId FROM chat_members WHERE userId = ?)`
    )
    .get(botUserId, botUserId);
  return row?.n ?? 0;
}

function getBotToken(id) {
  return db.prepare("SELECT token FROM bots WHERE id = ?").get(id)?.token ?? null;
}

async function getBotByToken(token) {
  return rowToBot(db.prepare("SELECT * FROM bots WHERE token = ?").get(token));
}

async function getBot(id) {
  return rowToBot(db.prepare("SELECT * FROM bots WHERE id = ?").get(id));
}

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

async function updateBotDescription(id, description) {
  db.prepare("UPDATE bots SET description = ? WHERE id = ?").run(description ?? null, id);
  return getBot(id);
}

async function updateBotCommands(id, commands) {
  db.prepare("UPDATE bots SET commands = ? WHERE id = ?").run(JSON.stringify(commands ?? []), id);
  return getBot(id);
}

async function updateBotApp(id, { appUrl, appName }) {
  db.prepare("UPDATE bots SET appUrl = ?, appCode = NULL, appName = ? WHERE id = ?").run(appUrl || null, appName || null, id);
  return getBot(id);
}

async function updateBotAppCode(id, { appCode, appName }) {
  db.prepare("UPDATE bots SET appCode = ?, appUrl = NULL, appName = ? WHERE id = ?").run(appCode || null, appName || null, id);
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
  getBotToken,
  countBotAudience,
  createBot,
  regenerateToken,
  deleteBot,
  updateBotApp,
  updateBotAppCode,
  updateBotCode,
  updateBotCommands,
  updateBotDescription,
};
