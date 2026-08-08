// Whoever holds this phone number on their account is the Shalter
// administrator/developer — see server/routes/premium.js and
// server/data/sanitize.js (the "Разработчик" badge). Overridable via env so
// a deployment doesn't have to hardcode a real phone number in source.
const ADMIN_PHONE = process.env.PREMIUM_ADMIN_PHONE || "+79781827502";

// Default Premium grant length — the referral bonus and the plain "Купить
// Premium — 10₽" purchase both use this. Longer/shorter durations are also
// available individually through the Gifts catalog (server/data/gifts.js).
const PREMIUM_GRANT_DAYS = 30;

// Powers bot.ai() (server/lib/ai.js) — lets bot owners' code call a real LLM
// without each of them needing their own API key. Unset by default: a
// self-hosted deployment that doesn't want to pay for bot AI calls just
// doesn't set this, and bot.ai() fails with a clear error instead of the
// server silently having no way to make the call.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

// DonationAlerts OAuth app credentials (server/lib/donationAlerts.js) — from
// https://www.donationalerts.com/application/clients, registered by whoever
// holds ADMIN_PHONE. Unset by default: without these, Premium/Реклама/Gift
// purchases fall back to the old "message the admin, they confirm by hand"
// flow instead of real automatic payment — see the isConfigured() check
// premium.js/ads.js/gifts.js's /request routes make before offering it.
const DONATIONALERTS_CLIENT_ID = process.env.DONATIONALERTS_CLIENT_ID || "";
const DONATIONALERTS_CLIENT_SECRET = process.env.DONATIONALERTS_CLIENT_SECRET || "";
// Must exactly match a redirect URI registered on the DonationAlerts app —
// e.g. https://your-domain.example/api/donation-alerts/callback.
const DONATIONALERTS_REDIRECT_URI = process.env.DONATIONALERTS_REDIRECT_URI || "";

module.exports = {
  ADMIN_PHONE,
  PREMIUM_GRANT_DAYS,
  ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL,
  DONATIONALERTS_CLIENT_ID,
  DONATIONALERTS_CLIENT_SECRET,
  DONATIONALERTS_REDIRECT_URI,
};
