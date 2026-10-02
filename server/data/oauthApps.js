const crypto = require("crypto");
const db = require("../db");

function rowToApp(row) {
  if (!row) return undefined;
  return { id: row.id, name: row.name, clientId: row.clientId, redirectUri: row.redirectUri, ownerId: row.ownerId, createdAt: row.createdAt };
}

function randomId(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

async function createOAuthApp({ ownerId, name, redirectUri }) {
  const row = {
    id: `oa_${Date.now().toString(36)}_${randomId(4)}`,
    name: String(name ?? "").trim().slice(0, 60),
    clientId: randomId(12),
    clientSecret: randomId(24),
    redirectUri: String(redirectUri ?? "").trim(),
    ownerId,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO oauth_apps (id, name, clientId, clientSecret, redirectUri, ownerId, createdAt)
     VALUES (@id, @name, @clientId, @clientSecret, @redirectUri, @ownerId, @createdAt)`
  ).run(row);
  return row;
}

async function listOAuthAppsByOwner(ownerId) {
  return db.prepare("SELECT * FROM oauth_apps WHERE ownerId = ? ORDER BY createdAt DESC").all(ownerId).map(rowToApp);
}

function getOAuthAppByClientId(clientId) {
  return db.prepare("SELECT * FROM oauth_apps WHERE clientId = ?").get(clientId);
}

async function getOAuthApp(id) {
  return rowToApp(db.prepare("SELECT * FROM oauth_apps WHERE id = ?").get(id));
}

async function deleteOAuthApp(id, ownerId) {
  const row = db.prepare("SELECT clientId FROM oauth_apps WHERE id = ? AND ownerId = ?").get(id, ownerId);
  if (!row) return false;
  db.prepare("DELETE FROM oauth_apps WHERE id = ?").run(id);
  db.prepare("DELETE FROM oauth_tokens WHERE clientId = ?").run(row.clientId);
  db.prepare("DELETE FROM oauth_codes WHERE clientId = ?").run(row.clientId);
  return true;
}

async function regenerateOAuthAppSecret(id, ownerId) {
  const row = db.prepare("SELECT id FROM oauth_apps WHERE id = ? AND ownerId = ?").get(id, ownerId);
  if (!row) return undefined;
  const clientSecret = randomId(24);
  db.prepare("UPDATE oauth_apps SET clientSecret = ? WHERE id = ?").run(clientSecret, id);
  return { ...(await getOAuthApp(id)), clientSecret };
}

const CODE_TTL_MS = 5 * 60 * 1000;

function createAuthCode({ clientId, userId, redirectUri }) {
  const code = randomId(24);
  db.prepare(
    `INSERT INTO oauth_codes (code, clientId, userId, redirectUri, expiresAt) VALUES (?, ?, ?, ?, ?)`
  ).run(code, clientId, userId, redirectUri, new Date(Date.now() + CODE_TTL_MS).toISOString());
  return code;
}

const redeemAuthCode = db.transaction((code, clientId, redirectUri) => {
  const row = db.prepare("SELECT * FROM oauth_codes WHERE code = ?").get(code);
  if (!row) return null;
  if (row.usedAt) return null;
  if (row.clientId !== clientId) return null;
  if (row.redirectUri !== redirectUri) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) return null;
  db.prepare("UPDATE oauth_codes SET usedAt = ? WHERE code = ?").run(new Date().toISOString(), code);
  return { userId: row.userId };
});

function issueAccessToken({ clientId, userId }) {
  const token = randomId(32);
  db.prepare("INSERT INTO oauth_tokens (token, clientId, userId, createdAt) VALUES (?, ?, ?, ?)").run(
    token,
    clientId,
    userId,
    new Date().toISOString()
  );
  return token;
}

function getTokenOwner(token) {
  return db.prepare("SELECT userId, clientId FROM oauth_tokens WHERE token = ?").get(token);
}

async function getOAuthAppSecret(id, ownerId) {
  const row = db.prepare("SELECT clientId, clientSecret FROM oauth_apps WHERE id = ? AND ownerId = ?").get(id, ownerId);
  return row ? { clientId: row.clientId, clientSecret: row.clientSecret } : undefined;
}

module.exports = {
  createOAuthApp,
  listOAuthAppsByOwner,
  getOAuthAppByClientId,
  getOAuthApp,
  getOAuthAppSecret,
  deleteOAuthApp,
  regenerateOAuthAppSecret,
  createAuthCode,
  redeemAuthCode,
  issueAccessToken,
  getTokenOwner,
};
