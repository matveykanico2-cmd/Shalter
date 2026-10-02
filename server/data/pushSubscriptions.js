const db = require("../db");
const { genId } = require("../lib/genId");

function rowToRow(row) {
  if (!row) return undefined;
  return { id: row.id, userId: row.userId, subscription: JSON.parse(row.subscription) };
}

async function listSubscriptionsForUser(userId) {
  return db.prepare("SELECT * FROM push_subscriptions WHERE userId = ?").all(userId).map(rowToRow);
}

async function addSubscription(userId, subscription) {
  const id = genId("ps");
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
