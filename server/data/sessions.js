const db = require("../db");

async function listSessions(userId) {
  return db.prepare("SELECT * FROM sessions WHERE userId = ?").all(userId);
}

// One row per (userId, deviceId) — logging in again from the same browser
// refreshes the existing row (device label + lastActive) instead of piling
// up duplicates every time.
async function upsertSession({ userId, deviceId, device, location }) {
  const lastActive = new Date().toISOString();
  const existing = db.prepare("SELECT id FROM sessions WHERE userId = ? AND deviceId = ?").get(userId, deviceId);
  const id = existing?.id ?? `sess_${Date.now()}`;
  db.prepare(
    `INSERT INTO sessions (id, userId, deviceId, device, location, lastActive) VALUES (@id, @userId, @deviceId, @device, @location, @lastActive)
     ON CONFLICT(userId, deviceId) DO UPDATE SET device = @device, location = @location, lastActive = @lastActive`
  ).run({ id, userId, deviceId, device, location, lastActive });
  return db.prepare("SELECT * FROM sessions WHERE userId = ? AND deviceId = ?").get(userId, deviceId);
}

async function removeSession(id) {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

module.exports = { listSessions, upsertSession, removeSession };
