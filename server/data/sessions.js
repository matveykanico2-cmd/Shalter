const db = require("../db");
const { genId } = require("../lib/genId");

async function listSessions(userId) {
  return db.prepare("SELECT * FROM sessions WHERE userId = ? AND revokedAt IS NULL ORDER BY lastActive DESC").all(userId);
}

async function getSession(userId, deviceId) {
  return db.prepare("SELECT * FROM sessions WHERE userId = ? AND deviceId = ?").get(userId, deviceId);
}

async function upsertSession({ userId, deviceId, device, location }) {
  const lastActive = new Date().toISOString();
  const existing = db.prepare("SELECT id FROM sessions WHERE userId = ? AND deviceId = ?").get(userId, deviceId);
  const id = existing?.id ?? genId("sess");
  db.prepare(
    `INSERT INTO sessions (id, userId, deviceId, device, location, lastActive, revokedAt) VALUES (@id, @userId, @deviceId, @device, @location, @lastActive, NULL)
     ON CONFLICT(userId, deviceId) DO UPDATE SET device = @device, location = @location, lastActive = @lastActive, revokedAt = NULL`
  ).run({ id, userId, deviceId, device, location, lastActive });
  return { session: db.prepare("SELECT * FROM sessions WHERE userId = ? AND deviceId = ?").get(userId, deviceId), isNewDevice: !existing };
}

// Синхронно: используется при каждом запросе, чтобы понять, чей это cookie.
function isSessionActive(userId, deviceId) {
  if (!userId || !deviceId) return false;
  return !!db.prepare("SELECT 1 FROM sessions WHERE userId = ? AND deviceId = ? AND revokedAt IS NULL").get(userId, deviceId);
}

function touchSession(userId, deviceId, location) {
  db.prepare(
    `UPDATE sessions SET lastActive = ?, location = COALESCE(NULLIF(?, ''), location)
       WHERE userId = ? AND deviceId = ? AND revokedAt IS NULL`
  ).run(new Date().toISOString(), location ?? "", userId, deviceId);
}

async function revokeSession(userId, deviceId) {
  db.prepare("UPDATE sessions SET revokedAt = ? WHERE userId = ? AND deviceId = ?").run(new Date().toISOString(), userId, deviceId);
}

async function revokeSessionById(userId, id) {
  return db.prepare("UPDATE sessions SET revokedAt = ? WHERE userId = ? AND id = ?").run(new Date().toISOString(), userId, id).changes > 0;
}

async function getSessionById(userId, id) {
  return db.prepare("SELECT * FROM sessions WHERE userId = ? AND id = ?").get(userId, id);
}

async function revokeOtherSessions(userId, exceptDeviceId) {
  db.prepare("UPDATE sessions SET revokedAt = ? WHERE userId = ? AND deviceId <> ?").run(new Date().toISOString(), userId, exceptDeviceId);
}

async function revokeAllSessions(userId) {
  db.prepare("UPDATE sessions SET revokedAt = ? WHERE userId = ?").run(new Date().toISOString(), userId);
}

async function removeAllSessionsForUser(userId) {
  db.prepare("DELETE FROM sessions WHERE userId = ?").run(userId);
}

module.exports = { listSessions, getSession, getSessionById, isSessionActive, upsertSession, touchSession, revokeSession, revokeSessionById, revokeOtherSessions, revokeAllSessions, removeAllSessionsForUser };
