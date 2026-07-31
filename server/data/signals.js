const db = require("../db");

async function addSignal(input) {
  const seqRow = db.prepare("SELECT MAX(seq) AS maxSeq FROM signals").get();
  const seq = (seqRow.maxSeq ?? 0) + 1;
  const signal = {
    ...input,
    id: `sig_${Date.now()}_${seq}`,
    seq,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO signals (id, seq, callId, fromUserId, toUserId, kind, data, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(signal.id, seq, signal.callId, signal.fromUserId, signal.toUserId, signal.kind, JSON.stringify(signal.data ?? null), signal.createdAt);

  // Signaling is transient — trim old entries so the table doesn't grow
  // unbounded (mirrors the old JSON store's "keep last 500" behavior).
  db.prepare(
    "DELETE FROM signals WHERE id NOT IN (SELECT id FROM signals ORDER BY seq DESC LIMIT 500)"
  ).run();

  return signal;
}

async function listSignalsFor(callId, forUserId, after) {
  const rows = db
    .prepare("SELECT * FROM signals WHERE callId = ? AND toUserId = ? AND seq > ? ORDER BY seq ASC")
    .all(callId, forUserId, after);
  return rows.map((r) => ({ ...r, data: r.data ? JSON.parse(r.data) : null }));
}

module.exports = { addSignal, listSignalsFor };
