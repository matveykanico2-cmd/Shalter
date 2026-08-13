// Numeric login codes delivered through the in-app Shalter service chat
// (see server/lib/systemChat.js) instead of SMS — this app has no SMS
// gateway, so like the QR flow, this only works when the account already
// has at least one other logged-in device to actually read the message on.
// Same ephemeral in-memory pattern as qrLogins.js, keyed by userId (only one
// pending code per account at a time — starting a new one replaces it).
const crypto = require("crypto");

const TTL_MS = 5 * 60 * 1000;
// A 6-digit code with no attempt ceiling is a 1,000,000-guess piñata that only
// the global rate limiter was slowing down — and the whole point of this flow is
// that knowing someone's phone number must not be enough to get in. Five wrong
// guesses burns the code; the account owner just requests a new one.
const MAX_ATTEMPTS = 5;
const pending = new Map();

function createCode(userId) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  pending.set(userId, { code, expiresAt: Date.now() + TTL_MS, attempts: 0 });
  return code;
}

// One-time check: a correct code is consumed immediately so it can't be reused,
// and a wrong one costs an attempt.
function verify(userId, code) {
  const entry = pending.get(userId);
  if (!entry || entry.expiresAt < Date.now()) {
    pending.delete(userId);
    return false;
  }
  if (entry.code !== String(code ?? "").trim()) {
    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) pending.delete(userId);
    return false;
  }
  pending.delete(userId);
  return true;
}

module.exports = { createCode, verify, MAX_ATTEMPTS };
