const { readCollection, updateCollection } = require("./store");

const FILE = "sessions";

async function listSessions(userId) {
  const sessions = await readCollection(FILE);
  return sessions.filter((s) => s.userId === userId);
}

async function removeSession(id) {
  await updateCollection(FILE, (sessions) => sessions.filter((s) => s.id !== id));
}

async function removeOtherSessions(userId) {
  await updateCollection(FILE, (sessions) => sessions.filter((s) => s.userId !== userId || s.current));
}

module.exports = { listSessions, removeSession, removeOtherSessions };
