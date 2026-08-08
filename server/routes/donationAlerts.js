const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { ADMIN_PHONE } = require("../config");
const { getUser } = require("../data/users");
const {
  isConfigured,
  isConnected,
  loadAuth,
  getAuthorizeUrl,
  exchangeCodeForTokens,
} = require("../lib/donationAlerts");

const router = express.Router();
router.use(requireUserId);

function requireAdmin(req, res) {
  return getUser(req.uid).then((me) => {
    if (me.phone !== ADMIN_PHONE) {
      res.status(403).json({ error: "Недостаточно прав" });
      return null;
    }
    return me;
  });
}

// Settings → whatever admin-only DonationAlerts panel — whether it's set up
// at all (env vars present) and, if so, connected (has tokens) yet.
router.get(
  "/status",
  asyncRoute(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const auth = loadAuth();
    res.json({ configured: isConfigured(), connected: isConnected(), username: auth?.username ?? null });
  })
);

// Kicks off the OAuth dance — the admin's browser gets redirected to
// DonationAlerts to log in and approve, which then bounces back to /callback
// below. Not JSON: this route itself IS the redirect (window.location.href
// straight here from Settings, not fetch()).
router.get(
  "/connect",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (me.phone !== ADMIN_PHONE) return res.status(403).send("Недостаточно прав");
    if (!isConfigured()) return res.status(503).send("DonationAlerts не настроен на сервере (нет client id/secret)");
    res.redirect(getAuthorizeUrl());
  })
);

// Must exactly match DONATIONALERTS_REDIRECT_URI (also the value registered
// on the DonationAlerts app itself) — see server/config.js.
router.get(
  "/callback",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    if (me.phone !== ADMIN_PHONE) return res.status(403).send("Недостаточно прав");
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
