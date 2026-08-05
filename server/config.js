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

module.exports = { ADMIN_PHONE, PREMIUM_GRANT_DAYS, ANTHROPIC_API_KEY, ANTHROPIC_MODEL };
