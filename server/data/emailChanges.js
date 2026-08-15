const crypto = require("crypto");

// A pending "change my e-mail to this address" request, waiting on the code
// that was sent to the *new* address.
//
// Why the code goes to the new address and not the old one: the whole point of
// the address is to receive a recovery code some day. An address that was never
// proved reachable is worse than no address at all — a typo would leave the
// account with a recovery route that silently goes nowhere, discovered on
// exactly the day it is needed.
//
// Same ephemeral in-memory shape as recoveryCodes.js: one pending change per
// account, replaced by asking again, gone on restart.
const TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const pending = new Map();

function start(userId, email) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  pending.set(userId, { code, email, expiresAt: Date.now() + TTL_MS, attempts: 0 });
  return code;
}

// Returns the address to switch to, or null. The address comes from here rather
// than from the request that confirms the code, so a caller cannot confirm a
// code sent to one address and have a different one saved.
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
