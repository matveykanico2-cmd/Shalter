// Real Web Push (works even with the tab/browser fully closed), not just the
// foreground Notification API. VAPID keys are generated once and persisted
// in the vapid_keys table — a push subscription is bound to the server's
// public key, so regenerating them on every restart would silently break
// every subscription made so far.
const webpush = require("web-push");
const db = require("./db");
const { listSubscriptionsForUser, removeSubscriptionByEndpoint } = require("./data/pushSubscriptions");

let publicKey = null;

async function initPush() {
  let keys = db.prepare("SELECT publicKey, privateKey FROM vapid_keys WHERE id = 1").get();
  if (!keys?.publicKey || !keys?.privateKey) {
    keys = webpush.generateVAPIDKeys();
    db.prepare(
      `INSERT INTO vapid_keys (id, publicKey, privateKey) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET publicKey = excluded.publicKey, privateKey = excluded.privateKey`
    ).run(keys.publicKey, keys.privateKey);
  }
  publicKey = keys.publicKey;
  webpush.setVapidDetails("mailto:push@example.com", keys.publicKey, keys.privateKey);
}

function getPublicKey() {
  return publicKey;
}

// Sends to every subscription registered for this user (multiple
// devices/browsers), pruning any the push service reports as gone
// (404/410 — uninstalled browser, revoked permission, expired subscription)
// so they don't fail forever on every future send.
async function sendPushToUser(userId, payload) {
  const subs = await listSubscriptionsForUser(userId);
  if (subs.length === 0) return;
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, body);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await removeSubscriptionByEndpoint(row.subscription.endpoint);
        } else {
          console.error("push send failed:", err.statusCode, err.body || err.message);
        }
      }
    })
  );
}

module.exports = { initPush, getPublicKey, sendPushToUser };
