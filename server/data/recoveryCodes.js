const crypto = require("crypto");

// One-time codes for password recovery, e-mailed to the address on the account.
//
// Same ephemeral in-memory shape as codeLogins.js and twoFactorTickets.js: one
// pending code per account, replaced by asking again, gone on restart. Losing
// them on restart is correct — a code nobody used within fifteen minutes should
// not survive anyway.
const TTL_MS = 15 * 60 * 1000;
// A six-digit code with no ceiling is a million-guess piñata. Five wrong tries
// burns it and the owner simply asks for another.
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

module.exports = { createCode, verify, TTL_MS, MAX_ATTEMPTS };
