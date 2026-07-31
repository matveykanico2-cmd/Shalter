const db = require("../db");

function rowToCall(row) {
  if (!row) return undefined;
  const participantIds = db.prepare("SELECT userId FROM call_participants WHERE callId = ?").all(row.id).map((r) => r.userId);
  return {
    id: row.id,
    chatId: row.chatId,
    kind: row.kind,
    direction: row.direction ?? undefined,
    callerId: row.callerId,
    status: row.status,
    startedAt: row.startedAt,
    durationSec: row.durationSec,
    participantIds,
  };
}

async function listCalls(userId) {
  const rows = db
    .prepare("SELECT c.* FROM calls c JOIN call_participants p ON p.callId = c.id WHERE p.userId = ? ORDER BY c.startedAt DESC")
    .all(userId);
  return rows.map(rowToCall);
}

async function getCall(id) {
  return rowToCall(db.prepare("SELECT * FROM calls WHERE id = ?").get(id));
}

async function createCall(call) {
  db.prepare(
    `INSERT INTO calls (id, chatId, kind, direction, callerId, status, startedAt, durationSec)
     VALUES (@id, @chatId, @kind, @direction, @callerId, @status, @startedAt, @durationSec)`
  ).run({
    id: call.id,
    chatId: call.chatId,
    kind: call.kind,
    direction: call.direction ?? null,
    callerId: call.callerId,
    status: call.status,
    startedAt: call.startedAt,
    durationSec: call.durationSec ?? 0,
  });
  const insertParticipant = db.prepare("INSERT INTO call_participants (callId, userId) VALUES (?, ?)");
  for (const userId of call.participantIds ?? []) insertParticipant.run(call.id, userId);
  return getCall(call.id);
}

async function updateCall(id, patch) {
  const existing = db.prepare("SELECT id FROM calls WHERE id = ?").get(id);
  if (!existing) return undefined;
  const fields = ["chatId", "kind", "direction", "callerId", "status", "startedAt", "durationSec"].filter((k) => k in patch);
  if (fields.length > 0) {
    const setClause = fields.map((f) => `${f} = @${f}`).join(", ");
    db.prepare(`UPDATE calls SET ${setClause} WHERE id = @id`).run({ ...patch, id });
  }
  return getCall(id);
}

// Adds a participant to an ongoing call (mesh WebRTC grows to N peers client-side).
async function addParticipant(id, userId) {
  db.prepare("INSERT OR IGNORE INTO call_participants (callId, userId) VALUES (?, ?)").run(id, userId);
  return getCall(id);
}

module.exports = { listCalls, getCall, createCall, updateCall, addParticipant };
