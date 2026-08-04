// Ephemeral QR-login handshake state — same "in-memory, no persistence"
// pattern as typing.js: entries are short-lived (90s) and single-process by
// nature (the waiting browser polls the same process it started on), so a
// Map is enough. Not a session store — see server/middleware/auth.js for that.
const crypto = require("crypto");

const TTL_MS = 90 * 1000;
const pending = new Map();

function createToken(deviceId) {
  const token = crypto.randomBytes(20).toString("hex");
  pending.set(token, { deviceId, confirmedUserId: null, expiresAt: Date.now() + TTL_MS });
  return token;
}

function getEntry(token) {
  const entry = pending.get(token);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    pending.delete(token);
    return undefined;
  }
  return entry;
}

// Called by the already-authenticated device that scanned the code.
function confirm(token, userId) {
  const entry = getEntry(token);
  if (!entry) return "expired";
  if (entry.confirmedUserId) return "already-used";
  entry.confirmedUserId = userId;
  return "ok";
}

// Called by the waiting browser's poll loop once it's picked up the
// confirmation — one-time read, so the same code can't be replayed.
function consume(token) {
  const entry = getEntry(token);
  if (!entry || !entry.confirmedUserId) return undefined;
  pending.delete(token);
  return entry;
}

module.exports = { createToken, getEntry, confirm, consume };
