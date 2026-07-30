const { readCollection, updateCollection } = require("./store");

const FILE = "signals";

async function addSignal(input) {
  let signal;
  await updateCollection(FILE, (all) => {
    const seq = all.reduce((max, s) => Math.max(max, s.seq), 0) + 1;
    signal = {
      ...input,
      id: `sig_${Date.now()}_${seq}`,
      seq,
      createdAt: new Date().toISOString(),
    };
    const next = [...all, signal];
    // Signaling is transient — trim old entries so signals.json doesn't grow unbounded.
    return next.length > 500 ? next.slice(next.length - 500) : next;
  });
  return signal;
}

async function listSignalsFor(callId, forUserId, after) {
  const all = await readCollection(FILE);
  return all
    .filter((s) => s.callId === callId && s.toUserId === forUserId && s.seq > after)
    .sort((a, b) => a.seq - b.seq);
}

module.exports = { addSignal, listSignalsFor };
