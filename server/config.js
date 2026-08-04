// Whoever holds this phone number on their account is the Shalter
// administrator/developer — see server/routes/premium.js and
// server/data/sanitize.js (the "Разработчик" badge). Overridable via env so
// a deployment doesn't have to hardcode a real phone number in source.
const ADMIN_PHONE = process.env.PREMIUM_ADMIN_PHONE || "+79781827502";

// Default Premium grant length — the referral bonus and the plain "Купить
// Premium — 10₽" purchase both use this. Longer/shorter durations are also
// available individually through the Gifts catalog (server/data/gifts.js).
const PREMIUM_GRANT_DAYS = 30;

module.exports = { ADMIN_PHONE, PREMIUM_GRANT_DAYS };
