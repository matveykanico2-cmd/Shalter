const { readCollection, updateCollection } = require("./store");

const FILE = "pushSubscriptions";

function listAllSubscriptions() {
  return readCollection(FILE);
}

async function listSubscriptionsForUser(userId) {
  const subs = await listAllSubscriptions();
  return subs.filter((s) => s.userId === userId);
}

// Re-subscribing with the same endpoint (browser re-registers the same
// service worker) replaces the old row rather than piling up duplicates.
async function addSubscription(userId, subscription) {
  const row = { id: `ps_${Date.now()}`, userId, subscription };
  await updateCollection(FILE, (subs) => [...subs.filter((s) => s.subscription.endpoint !== subscription.endpoint), row]);
  return row;
}

async function removeSubscriptionByEndpoint(endpoint) {
  await updateCollection(FILE, (subs) => subs.filter((s) => s.subscription.endpoint !== endpoint));
}

module.exports = { listSubscriptionsForUser, addSubscription, removeSubscriptionByEndpoint };
