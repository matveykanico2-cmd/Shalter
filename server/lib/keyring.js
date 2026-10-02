const crypto = require("crypto");

const ROTATE_MS = Math.max(10, Number(process.env.KEY_ROTATION_SECONDS) || 120) * 1000;

let db = null;
const cache = new Map();
const current = new Map();

function init(database) {
  db = database;
  db.exec(`
    CREATE TABLE IF NOT EXISTS crypto_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purpose TEXT NOT NULL,
      wrapped TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_crypto_keys_purpose ON crypto_keys(purpose, id);
  `);
}

function database() {
  if (!db) init(require("../db"));
  return db;
}

function wrap(kek, purpose, id, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", kek, iv);
  cipher.setAAD(Buffer.from(`${purpose}:${id}`));
  const body = Buffer.concat([cipher.update(key), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64");
}

function unwrap(kek, purpose, id, wrapped) {
  const raw = Buffer.from(wrapped, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", kek, raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(`${purpose}:${id}`));
  decipher.setAuthTag(raw.subarray(raw.length - 16));
  return Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]);
}

function currentKey(purpose, kek) {
  const now = Date.now();
  const cur = current.get(purpose);
  if (cur && now - cur.createdMs < ROTATE_MS) return cur;

  const d = database();
  if (!cur) {
    const row = d.prepare("SELECT * FROM crypto_keys WHERE purpose = ? ORDER BY id DESC LIMIT 1").get(purpose);
    const createdMs = row ? Date.parse(row.createdAt) : 0;
    if (row && now - createdMs < ROTATE_MS) {
      const fresh = { id: row.id, key: unwrap(kek, purpose, row.id, row.wrapped), createdMs };
      cache.set(`${purpose}:${row.id}`, fresh.key);
      current.set(purpose, fresh);
      return fresh;
    }
  }

  const key = crypto.randomBytes(32);
  const createdAt = new Date(now).toISOString();
  const id = d.transaction(() => {
    const newId = Number(d.prepare("INSERT INTO crypto_keys (purpose, wrapped, createdAt) VALUES (?, '', ?)").run(purpose, createdAt).lastInsertRowid);
    d.prepare("UPDATE crypto_keys SET wrapped = ? WHERE id = ?").run(wrap(kek, purpose, newId, key), newId);
    return newId;
  })();
  const fresh = { id, key, createdMs: now };
  cache.set(`${purpose}:${id}`, key);
  current.set(purpose, fresh);
  return fresh;
}

function getKey(purpose, id, kek) {
  const cacheKey = `${purpose}:${id}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const row = database().prepare("SELECT * FROM crypto_keys WHERE id = ? AND purpose = ?").get(id, purpose);
  if (!row) throw new Error(`нет ключа ${cacheKey}`);
  const key = unwrap(kek, purpose, row.id, row.wrapped);
  cache.set(cacheKey, key);
  return key;
}

module.exports = { init, currentKey, getKey, ROTATE_MS };
