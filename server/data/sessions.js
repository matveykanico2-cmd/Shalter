const { readCollection, updateCollection } = require("./store");

const FILE = "sessions";

async function listSessions(userId) {
  const sessions = await readCollection(FILE);
  return sessions.filter((s) => s.userId === userId);
}

// One row per (userId, deviceId) — logging in again from the same browser
// refreshes the existing row (device label + lastActive) instead of piling
// up duplicates every time.
async function upsertSession({ userId, deviceId, device, location }) {
  let saved;
  await updateCollection(FILE, (sessions) => {
    const idx = sessions.findIndex((s) => s.userId === userId && s.deviceId === deviceId);
    const lastActive = new Date().toISOString();
    if (idx === -1) {
      saved = { id: `sess_${Date.now()}`, userId, deviceId, device, location, lastActive };
      return [...sessions, saved];
    }
    saved = { ...sessions[idx], device, location, lastActive };
    return sessions.map((s, i) => (i === idx ? saved : s));
  });
  return saved;
}

async function removeSession(id) {
  await updateCollection(FILE, (sessions) => sessions.filter((s) => s.id !== id));
}

module.exports = { listSessions, upsertSession, removeSession };
