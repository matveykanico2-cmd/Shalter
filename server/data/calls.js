const { readCollection, updateCollection } = require("./store");

const FILE = "calls";

async function listCalls(userId) {
  const calls = await readCollection(FILE);
  return calls.filter((c) => c.participantIds.includes(userId)).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

async function getCall(id) {
  const calls = await readCollection(FILE);
  return calls.find((c) => c.id === id);
}

async function createCall(call) {
  await updateCollection(FILE, (calls) => [...calls, call]);
  return call;
}

async function updateCall(id, patch) {
  let updated;
  await updateCollection(FILE, (calls) =>
    calls.map((c) => {
      if (c.id !== id) return c;
      updated = { ...c, ...patch };
      return updated;
    })
  );
  return updated;
}

// Adds a participant to an ongoing call (mesh WebRTC grows to N peers client-side).
async function addParticipant(id, userId) {
  let updated;
  await updateCollection(FILE, (calls) =>
    calls.map((c) => {
      if (c.id !== id) return c;
      if (c.participantIds.includes(userId)) {
        updated = c;
        return c;
      }
      updated = { ...c, participantIds: [...c.participantIds, userId] };
      return updated;
    })
  );
  return updated;
}

module.exports = { listCalls, getCall, createCall, updateCall, addParticipant };
