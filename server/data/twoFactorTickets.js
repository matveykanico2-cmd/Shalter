const crypto = require("crypto");

const TTL_MS = 5 * 60 * 1000;
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
