const crypto = require("crypto");
const db = require("../db");

// "Войти через Shalter" — third-party apps, registered by any account
// (self-service, no admin approval — same shape as a bot in data/bots.js).
// A registered app gets a clientId (public, goes in the login link) and a
// clientSecret (bearer credential, shown once at creation, same convention
// as a bot's token — plain text in the DB, not hashed, for the same reason
// bots.js gives: it has to be handed back to the owner verbatim later, and
// this app has no secrets-manager layer to justify the extra complexity).

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
  return row; // includes clientSecret — the one time it's shown
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

// Deleting the app immediately invalidates every token it issued — a
// dangling token that still worked after its app was "removed" would be a
// silent backdoor, not a real deletion.
async function deleteOAuthApp(id, ownerId) {
  const row = db.prepare("SELECT clientId FROM oauth_apps WHERE id = ? AND ownerId = ?").get(id, ownerId);
  if (!row) return false;
  db.prepare("DELETE FROM oauth_apps WHERE id = ?").run(id);
  db.prepare("DELETE FROM oauth_tokens WHERE clientId = ?").run(row.clientId);
  db.prepare("DELETE FROM oauth_codes WHERE clientId = ?").run(row.clientId);
  return true;
}

// The secret is shown once and never stored anywhere the owner can read it
// back (see the header comment) — losing it means starting over with a new
// one, the same way a bot's token or an API key on most platforms works.
// Regenerating keeps the same clientId/redirect_uri (so a third-party's
// login link stays valid), only the secret changes.
async function regenerateOAuthAppSecret(id, ownerId) {
  const row = db.prepare("SELECT id FROM oauth_apps WHERE id = ? AND ownerId = ?").get(id, ownerId);
  if (!row) return undefined;
  const clientSecret = randomId(24);
  db.prepare("UPDATE oauth_apps SET clientSecret = ? WHERE id = ?").run(clientSecret, id);
  return { ...(await getOAuthApp(id)), clientSecret };
}

const CODE_TTL_MS = 5 * 60 * 1000; // 5 минут — только чтобы долететь до /token, не для хранения

function createAuthCode({ clientId, userId, redirectUri }) {
  const code = randomId(24);
  db.prepare(
    `INSERT INTO oauth_codes (code, clientId, userId, redirectUri, expiresAt) VALUES (?, ?, ?, ?, ?)`
  ).run(code, clientId, userId, redirectUri, new Date(Date.now() + CODE_TTL_MS).toISOString());
  return code;
}

// Redeeming a code is transactional and marks it used in the same step —
// two concurrent /token calls with the same leaked code must not both
// succeed, only the first.
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

// Показать секрет владельцу ещё раз — как «Показать токен» у бота
// (data/bots.js's getBotToken). Секрет лежит в базе открытым текстом, поэтому
// его можно вернуть; отдаём только владельцу приложения.
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
