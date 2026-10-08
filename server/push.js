const { sendFcm } = require("./lib/fcm");
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
  // Apple's push service (iPhone/Safari) answers 403 BadJwtToken to a VAPID
  // subject on a placeholder domain like example.com — every iOS push was
  // silently dropped. It has to be a real contact address or https URL.
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@shalter.ru", keys.publicKey, keys.privateKey);
}

function getPublicKey() {
  return publicKey;
}

async function sendPushToUser(userId, payload, options = {}) {
  const subs = await listSubscriptionsForUser(userId);
  if (subs.length === 0) return;
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (row) => {
      // Android-приложение: токен FCM вместо веб-подписки (см. lib/fcm.js).
      if (row.subscription.fcmToken) {
        try {
          const result = await sendFcm(row.subscription.fcmToken, payload, { ttlSeconds: options.TTL });
          if (result === "gone") await removeSubscriptionByEndpoint(row.subscription.endpoint);
        } catch (err) {
          console.error("fcm send failed:", err.message);
        }
        return;
      }
      try {
        await webpush.sendNotification(row.subscription, body, options);
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

const CALL_PUSH = { urgency: "high", TTL: 45 };
const CALL_CANCEL_PUSH = { urgency: "high", TTL: 30 };
// "high": с "normal" Android в режиме сна и iOS откладывают пуш, пока телефон
// не проснётся сам (или пока не откроют приложение) — уведомления «опаздывали».
const MESSAGE_PUSH = { urgency: "high", TTL: 24 * 60 * 60 };

function pushAvatar(entity, fallbackName = "", { hideImage = false } = {}) {
  if (!entity) return {};
  const image = !hideImage && typeof entity.avatarImage === "string" && !entity.avatarImage.startsWith("data:") && entity.avatarImage.length < 1024 ? entity.avatarImage : null;
  return {
    avatar: {
      url: image,
      color: typeof entity.avatarColor === "string" ? entity.avatarColor.slice(0, 64) : null,
      name: String(entity.title ?? entity.name ?? fallbackName).slice(0, 64),
    },
  };
}

async function userPushAvatar(user, viewerId) {
  if (!user) return {};
  if (user.id === viewerId) return pushAvatar(user);
  const { allowsUser } = require("./lib/privacyRules");
  let hideImage = (user.blockedUserIds ?? []).includes(viewerId);
  if (!hideImage) {
    try {
      hideImage = !(await allowsUser(user.id, "photo", viewerId));
    } catch {
      hideImage = true;
    }
  }
  return pushAvatar(user, "", { hideImage });
}

module.exports = { initPush, getPublicKey, sendPushToUser, pushAvatar, userPushAvatar, CALL_PUSH, CALL_CANCEL_PUSH, MESSAGE_PUSH };
