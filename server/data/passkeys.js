// Ключи доступа (passkeys) для входа без пароля и кода. Храним только
// открытый ключ — секрет остаётся на устройстве пользователя.
const db = require("../db");

const MAX_PER_USER = 10;

function rowToPasskey(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    userId: row.userId,
    publicKey: JSON.parse(row.publicKey),
    signCount: row.signCount,
    name: row.name ?? "Ключ доступа",
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt ?? undefined,
  };
}

function getPasskey(id) {
  return rowToPasskey(db.prepare("SELECT * FROM passkeys WHERE id = ?").get(id));
}

function listPasskeys(userId) {
  return db.prepare("SELECT * FROM passkeys WHERE userId = ? ORDER BY createdAt ASC").all(userId).map(rowToPasskey);
}

function addPasskey({ id, userId, publicKey, signCount, name }) {
  if (getPasskey(id)) return null;
  db.prepare("INSERT INTO passkeys (id, userId, publicKey, signCount, name, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    userId,
    JSON.stringify(publicKey),
    signCount ?? 0,
    name || null,
    new Date().toISOString()
  );
  return getPasskey(id);
}

function touchPasskey(id, signCount) {
  db.prepare("UPDATE passkeys SET signCount = ?, lastUsedAt = ? WHERE id = ?").run(signCount, new Date().toISOString(), id);
}

function deletePasskey(userId, id) {
  return db.prepare("DELETE FROM passkeys WHERE id = ? AND userId = ?").run(id, userId).changes > 0;
}

module.exports = { MAX_PER_USER, getPasskey, listPasskeys, addPasskey, touchPasskey, deletePasskey };
