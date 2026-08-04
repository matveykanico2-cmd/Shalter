const db = require("../db");

async function listSessions(userId) {
  return db.prepare("SELECT * FROM sessions WHERE userId = ?").all(userId);
}

async function getSession(userId, deviceId) {
  return db.prepare("SELECT * FROM sessions WHERE userId = ? AND deviceId = ?").get(userId, deviceId);
}

// One row per (userId, deviceId) — logging in again from the same browser
// refreshes the existing row (device label + lastActive) instead of piling
// up duplicates every time. Also doubles as this account's *actual* list of
// valid sessions (see server/middleware/auth.js's requireUserId) — deleting
// a row here now really does log that device out, not just tidy up a list.
async function upsertSession({ userId, deviceId, device, location }) {
  const lastActive = new Date().toISOString();
  const existing = db.prepare("SELECT id FROM sessions WHERE userId = ? AND deviceId = ?").get(userId, deviceId);
  const id = existing?.id ?? `sess_${Date.now()}`;
  db.prepare(
    `INSERT INTO sessions (id, userId, deviceId, device, location, lastActive) VALUES (@id, @userId, @deviceId, @device, @location, @lastActive)
     ON CONFLICT(userId, deviceId) DO UPDATE SET device = @device, location = @location, lastActive = @lastActive`
  ).run({ id, userId, deviceId, device, location, lastActive });
  return { session: db.prepare("SELECT * FROM sessions WHERE userId = ? AND deviceId = ?").get(userId, deviceId), isNewDevice: !existing };
}

async function removeSession(id) {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

module.exports = { listSessions, getSession, upsertSession, removeSession };
