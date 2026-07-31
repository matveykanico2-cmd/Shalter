const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getPublicKey } = require("../push");
const { addSubscription, removeSubscriptionByEndpoint } = require("../data/pushSubscriptions");

const router = express.Router();

// No auth needed — this is public by design, the same way a site's own
// domain is public. It's not a secret, just the key the browser needs to
// create a subscription tied to this server.
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

router.post(
  "/unsubscribe",
  asyncRoute(async (req, res) => {
    const { endpoint } = req.body ?? {};
    if (endpoint) await removeSubscriptionByEndpoint(endpoint);
    res.json({ ok: true });
  })
);

module.exports = router;
