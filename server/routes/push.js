const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getPublicKey } = require("../push");
const { isFcmConfigured } = require("../lib/fcm");
const { addSubscription, removeSubscriptionByEndpoint, listSubscriptionsForUser } = require("../data/pushSubscriptions");

const router = express.Router();

router.get(
  "/vapid-public-key",
  asyncRoute(async (req, res) => {
    res.json({ publicKey: getPublicKey() });
  })
);

router.use(requireUserId);

router.post(
  "/subscribe",
  asyncRoute(async (req, res) => {
    const { subscription } = req.body ?? {};
    if (!subscription?.endpoint) return res.status(400).json({ error: "invalid subscription" });
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
    await addSubscription(req.uid, { endpoint: `fcm:${token}`, fcmToken: token, platform: "android" });
    res.json({ ok: true, configured: isFcmConfigured() });
  })
);

router.post(
  "/unsubscribe",
  asyncRoute(async (req, res) => {
    const { endpoint } = req.body ?? {};
    if (endpoint) await removeSubscriptionByEndpoint(endpoint);
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
