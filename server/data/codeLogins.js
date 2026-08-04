// Numeric login codes delivered through the in-app Shalter service chat
// (see server/lib/systemChat.js) instead of SMS — this app has no SMS
// gateway, so like the QR flow, this only works when the account already
// has at least one other logged-in device to actually read the message on.
// Same ephemeral in-memory pattern as qrLogins.js, keyed by userId (only one
// pending code per account at a time — starting a new one replaces it).
const crypto = require("crypto");

const TTL_MS = 5 * 60 * 1000;
const pending = new Map();

function createCode(userId) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  pending.set(userId, { code, expiresAt: Date.now() + TTL_MS });
  return code;
}

// One-time check: correct code consumes it immediately so it can't be reused.
function verify(userId, code) {
  const entry = pending.get(userId);
  if (!entry || entry.expiresAt < Date.now()) return false;
  if (entry.code !== code) return false;
  pending.delete(userId);
  return true;
}

module.exports = { createCode, verify };
