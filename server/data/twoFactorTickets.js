const crypto = require("crypto");

// The short-lived handle for "first factor passed, second factor still owed".
//
// A login that hits an account with 2FA on must NOT get a session cookie yet —
// otherwise the second factor is decoration, since the cookie is the thing that
// grants access. So the first step returns one of these tickets instead, and the
// session is only created once /2fa/login trades a valid ticket plus a valid
// code for it.
//
// Same ephemeral in-memory pattern (and same single-process assumption — see
// AGENTS.md) as data/qrLogins.js and data/codeLogins.js. Losing these on restart
// is fine: the worst case is someone mid-login starting over.
const TTL_MS = 5 * 60 * 1000;
// A 6-digit code is 1,000,000 possibilities and the ticket lives for 5 minutes,
// so the guess budget is what actually keeps it safe. Five attempts and the
// ticket is burnt — the user starts the login again, an attacker gets nowhere.
const MAX_ATTEMPTS = 5;

const tickets = new Map();

function sweep() {
  const now = Date.now();
  for (const [id, entry] of tickets) if (entry.expiresAt < now) tickets.delete(id);
}

function create(userId) {
  sweep();
  const id = crypto.randomBytes(24).toString("base64url");
  tickets.set(id, { userId, expiresAt: Date.now() + TTL_MS, attempts: 0 });
  return { ticket: id, expiresInSec: TTL_MS / 1000 };
}

function peek(ticket) {
  const entry = tickets.get(String(ticket ?? ""));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    tickets.delete(String(ticket));
    return null;
  }
  return entry;
}

// Counts a wrong code against the ticket and discards it once the budget is
// spent. Returns the attempts left, so the client can say how many remain
// instead of silently failing until the ticket vanishes.
function countFailure(ticket) {
  const entry = peek(ticket);
  if (!entry) return 0;
  entry.attempts += 1;
  const left = MAX_ATTEMPTS - entry.attempts;
  if (left <= 0) {
    tickets.delete(String(ticket));
    return 0;
  }
  return left;
}

function consume(ticket) {
  const entry = peek(ticket);
  if (!entry) return null;
  tickets.delete(String(ticket));
  return entry;
}

module.exports = { create, peek, countFailure, consume, MAX_ATTEMPTS };
