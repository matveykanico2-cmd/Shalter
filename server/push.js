const { sendFcm } = require("./lib/fcm");
const { assertPublicUrl } = require("./lib/linkPreview");
const webpush = require("web-push");
const http2 = require("http2");
const crypto = require("crypto");
const db = require("./db");
const { listSubscriptionsForUser, removeSubscriptionByEndpoint } = require("./data/pushSubscriptions");

let publicKey = null;
let apnsJwt = null;

function apnsConfig() {
  const key = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!key || !process.env.APNS_KEY_ID || !process.env.APNS_TEAM_ID || !process.env.APNS_BUNDLE_ID) return null;
  return {
    key,
    keyId: process.env.APNS_KEY_ID,
    teamId: process.env.APNS_TEAM_ID,
    bundleId: process.env.APNS_BUNDLE_ID,
    host: process.env.APNS_PRODUCTION === "0" ? "api.sandbox.push.apple.com" : "api.push.apple.com",
  };
}

function apnsAccessToken(config) {
  if (apnsJwt && apnsJwt.expiresAt > Date.now() + 60_000) return apnsJwt.value;
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: config.keyId })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ iss: config.teamId, iat: Math.floor(Date.now() / 1000) })).toString("base64url");
  const input = `${header}.${body}`;
  const signature = crypto.sign("sha256", Buffer.from(input), { key: config.key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  apnsJwt = { value: `${input}.${signature}`, expiresAt: Date.now() + 50 * 60 * 1000 };
  return apnsJwt.value;
}

async function sendApns(token, payload, options = {}) {
  const config = apnsConfig();
  if (!config) {
    console.error("[push] APNs is not configured; set APNS_PRIVATE_KEY, APNS_KEY_ID, APNS_TEAM_ID and APNS_BUNDLE_ID");
    return "skipped";
  }
  const isCall = payload?.kind === "call";
  const aps = payload?.kind === "call-cancelled"
    ? { "content-available": 1 }
    : {
        alert: { title: String(payload?.title || "Shalter").slice(0, 200), body: String(payload?.body || "").slice(0, 1000) },
        sound: payload?.silent ? undefined : "default",
        ...(isCall ? { category: "INCOMING_CALL", "interruption-level": "time-sensitive" } : {}),
      };
  const body = { aps, ...Object.fromEntries(Object.entries(payload || {}).filter(([key]) => key !== "title" && key !== "body")) };
  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${config.host}`);
    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${apnsAccessToken(config)}`,
      "apns-topic": config.bundleId,
      "apns-priority": isCall ? "10" : "5",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + Number(options.TTL || 86400)),
      "content-type": "application/json",
    });
    let response = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { response += chunk; });
    request.on("error", reject);
    request.on("response", (headers) => {
      request.on("end", () => {
        client.close();
        const status = Number(headers[":status"] || 500);
        if (status === 200) return resolve("sent");
        if (status === 400 || status === 410) return resolve("gone");
        reject(new Error(`APNs ${status}: ${response || "ошибка"}`));
      });
    });
    request.end(JSON.stringify(body));
  });
}

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
      const subscription = row.subscription;
      if (!subscription || typeof subscription !== "object") return;
      if (typeof subscription.fcmToken === "string" && subscription.fcmToken.startsWith("apns:")) {
        try {
          const result = await sendApns(subscription.fcmToken.slice(6), payload, options);
          if (result === "gone") await removeSubscriptionByEndpoint(subscription.endpoint);
        } catch (err) {
          console.error("apns send failed:", err.message);
        }
        return;
      }
      if (subscription.fcmToken) {
        try {
          const result = await sendFcm(subscription.fcmToken, payload, { ttlSeconds: options.TTL, callUi: !!subscription.callUi });
          if (result === "gone") await removeSubscriptionByEndpoint(subscription.endpoint);
        } catch (err) {
          console.error("fcm send failed:", err.message);
        }
        return;
      }
      try {
        // Повторная проверка перед отправкой: подписки, сохранённые до проверки при
        // подписке, и хосты, чей DNS с тех пор стал указывать во внутреннюю сеть.
        const target = await assertPublicUrl(subscription.endpoint).catch(() => null);
        if (!target || target.protocol !== "https:") return;
        await webpush.sendNotification(subscription, body, options);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await removeSubscriptionByEndpoint(subscription.endpoint);
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
