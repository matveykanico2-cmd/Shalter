const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getPublicKey } = require("../push");
const { isFcmConfigured } = require("../lib/fcm");
const { assertPublicUrl } = require("../lib/linkPreview");
const { addSubscription, removeUserSubscriptionByEndpoint, listSubscriptionsForUser } = require("../data/pushSubscriptions");

const router = express.Router();

router.get(
  "/vapid-public-key",
  asyncRoute(async (req, res) => {
    res.json({ publicKey: getPublicKey() });
  })
);

router.use(requireUserId);

// Сервер сам POST'ит на endpoint подписки, поэтому произвольный адрес — это SSRF
// (запрос на 127.0.0.1, во внутреннюю сеть, к метаданным облака). Принимаем только
// то, что выдаёт браузерный PushManager: https на стандартном порту, публичный
// хост (та же проверка, что у превью ссылок), и ключи шифрования p256dh/auth.
async function isValidWebSubscription(subscription) {
  if (!subscription || typeof subscription !== "object") return false;
  const { endpoint, keys } = subscription;
  if (typeof endpoint !== "string" || !endpoint || endpoint.length > 2048) return false;
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string" || !keys.p256dh || !keys.auth) return false;
  if (keys.p256dh.length > 256 || keys.auth.length > 256) return false;
  try {
    const url = await assertPublicUrl(endpoint);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

router.post(
  "/subscribe",
  asyncRoute(async (req, res) => {
    const { subscription } = req.body ?? {};
    if (!(await isValidWebSubscription(subscription))) return res.status(400).json({ error: "invalid subscription" });
    await addSubscription(req.uid, subscription);
    res.json({ ok: true });
  })
);

// Android-приложение (Capacitor): токен устройства FCM. Храним в той же таблице, что
// и веб-подписки, — с endpoint «fcm:<токен>», так что вся отправка идёт через sendPushToUser.
router.post(
  "/subscribe-native",
  asyncRoute(async (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (!token || token.length > 4096) return res.status(400).json({ error: "invalid token" });
    await addSubscription(req.uid, { endpoint: `fcm:${token}`, fcmToken: token, platform: "android", callUi: req.body?.callUi === true });
    res.json({ ok: true, configured: isFcmConfigured() });
  })
);

router.post(
  "/unsubscribe",
  asyncRoute(async (req, res) => {
    const { endpoint } = req.body ?? {};
    // Только своя подписка: иначе, узнав чужой endpoint (или токен FCM), можно
    // отключить человеку уведомления.
    if (typeof endpoint === "string" && endpoint) await removeUserSubscriptionByEndpoint(req.uid, endpoint);
    res.json({ ok: true });
  })
);

router.get(
  "/endpoints",
  asyncRoute(async (req, res) => {
    const subs = await listSubscriptionsForUser(req.uid);
    res.json({ endpoints: subs.map((s) => s.subscription?.endpoint).filter(Boolean) });
  })
);

module.exports = router;
