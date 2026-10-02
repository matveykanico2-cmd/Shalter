const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE, isAdminPhone } = require("../config");
const { hasAdminSection } = require("../lib/adminAccess");
const { getUser } = require("../data/users");
const {
  isConfigured,
  isConnected,
  loadAuth,
  getAuthorizeUrl,
  exchangeCodeForTokens,
} = require("../lib/donationAlerts");
const { isConfigured: isDonatePayConfigured } = require("../lib/donatePay");

const router = express.Router();
router.use(requireUserId);

function requireAdmin(req, res) {
  return getUser(req.uid).then((me) => {
    if (!hasAdminSection(me, "donations")) {
      res.status(403).json({ error: "Недостаточно прав" });
      return null;
    }
    return me;
  });
}

router.get(
  "/status",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const auth = loadAuth();
    res.json({
      configured: isConfigured(),
      connected: isConnected(),
      username: auth?.username ?? null,
      donatePayConfigured: isDonatePayConfigured(),
    });
  })
);

router.get(
  "/connect",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (!hasAdminSection(me, "donations")) return res.status(403).send("Недостаточно прав");
    if (!isConfigured()) return res.status(503).send("DonationAlerts не настроен на сервере (нет client id/secret)");
    res.redirect(getAuthorizeUrl());
  })
);

router.get(
  "/callback",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (!hasAdminSection(me, "donations")) return res.status(403).send("Недостаточно прав");
    const { code, error } = req.query;
    if (error || !code) return res.redirect("/settings/donations?error=1");
    try {
      await exchangeCodeForTokens(String(code));
      res.redirect("/settings/donations?connected=1");
    } catch (err) {
      console.error("DonationAlerts callback failed:", err);
      res.redirect("/settings/donations?error=1");
    }
  })
);

module.exports = router;
