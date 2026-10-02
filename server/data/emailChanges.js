const crypto = require("crypto");

const TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const pending = new Map();

function start(userId, email) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  pending.set(userId, { code, email, expiresAt: Date.now() + TTL_MS, attempts: 0 });
  return code;
}

function confirm(userId, code) {
  const entry = pending.get(userId);
  if (!entry || entry.expiresAt < Date.now()) {
    pending.delete(userId);
    return null;
  }
  if (entry.code !== String(code ?? "").trim()) {
    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) pending.delete(userId);
    return null;
  }
  pending.delete(userId);
  return entry.email;
}

function pendingEmail(userId) {
  const entry = pending.get(userId);
  return entry && entry.expiresAt > Date.now() ? entry.email : null;
}

module.exports = { start, confirm, pendingEmail, TTL_MS, MAX_ATTEMPTS };
