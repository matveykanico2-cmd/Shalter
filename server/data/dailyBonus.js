// Backing store for /daily (server/lib/helperBot/economy.js) — one row per
// user, "claimed in the last 24h" is a single comparison against
// lastClaimAt rather than a growing claim log.
const db = require("../db");

const CLAIM_INTERVAL_MS = 24 * 60 * 60 * 1000;

function msUntilNextClaim(userId) {
  const row = db.prepare("SELECT lastClaimAt FROM daily_claims WHERE userId = ?").get(userId);
  if (!row) return 0;
  const elapsed = Date.now() - new Date(row.lastClaimAt).getTime();
  return Math.max(0, CLAIM_INTERVAL_MS - elapsed);
}

function recordClaim(userId) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO daily_claims (userId, lastClaimAt) VALUES (?, ?)
     ON CONFLICT(userId) DO UPDATE SET lastClaimAt = excluded.lastClaimAt`
  ).run(userId, now);
}

module.exports = { msUntilNextClaim, recordClaim };
