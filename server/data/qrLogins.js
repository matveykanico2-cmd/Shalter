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

function confirm(token, userId) {
  const entry = getEntry(token);
  if (!entry) return "expired";
  if (entry.confirmedUserId) return "already-used";
  entry.confirmedUserId = userId;
  return "ok";
}

function consume(token) {
  const entry = getEntry(token);
  if (!entry || !entry.confirmedUserId) return undefined;
  pending.delete(token);
  return entry;
}

module.exports = { createToken, getEntry, confirm, consume };
