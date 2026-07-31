const db = require("../db");

function rowToRow(row) {
  if (!row) return undefined;
  return { id: row.id, userId: row.userId, subscription: JSON.parse(row.subscription) };
}

async function listSubscriptionsForUser(userId) {
  return db.prepare("SELECT * FROM push_subscriptions WHERE userId = ?").all(userId).map(rowToRow);
}

// Re-subscribing with the same endpoint (browser re-registers the same
// service worker) replaces the old row rather than piling up duplicates.
async function addSubscription(userId, subscription) {
  const id = `ps_${Date.now()}`;
  db.prepare(
    `INSERT INTO push_subscriptions (id, userId, endpoint, subscription) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET userId = excluded.userId, subscription = excluded.subscription`
  ).run(id, userId, subscription.endpoint, JSON.stringify(subscription));
  return { id, userId, subscription };
}

async function removeSubscriptionByEndpoint(endpoint) {
  db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}

module.exports = { listSubscriptionsForUser, addSubscription, removeSubscriptionByEndpoint };
