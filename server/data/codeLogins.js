const crypto = require("crypto");

const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const pending = new Map();

function createCode(userId) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  pending.set(userId, { code, expiresAt: Date.now() + TTL_MS, attempts: 0 });
  return code;
}

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
