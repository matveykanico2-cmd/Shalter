// Whoever holds this phone number on their account is the Shalter
// administrator/developer — see server/routes/premium.js and
// server/data/sanitize.js (the "Разработчик" badge). Overridable via env so
// a deployment doesn't have to hardcode a real phone number in source.
const ADMIN_PHONE = process.env.PREMIUM_ADMIN_PHONE || "+79781827502";

// Администраторов может быть несколько.
//
// ADMIN_PHONE остаётся «главным»: на него переводят деньги, от его имени идёт
// чат администрации, его ищет findUserByPhone. А права — у любого номера из
// списка, поэтому проверки прав идут через isAdminPhone, а не через сравнение
// с одной строкой.
//
// Дополнительные номера задаются через PREMIUM_ADMIN_PHONES (через запятую);
// без переменной берётся зашитый список.
const EXTRA_ADMIN_PHONES = (process.env.PREMIUM_ADMIN_PHONES || "+79781824352")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);
const ADMIN_PHONES = [...new Set([ADMIN_PHONE, ...EXTRA_ADMIN_PHONES])];

function isAdminPhone(phone) {
  return !!phone && ADMIN_PHONES.includes(phone);
}

// Default Premium grant length — the referral bonus and the plain "Купить
// Premium — 10₽" purchase both use this. Longer/shorter durations are also
// available individually through the Gifts catalog (server/data/gifts.js).
const PREMIUM_GRANT_DAYS = 30;

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

// "Hugo", the composer's writing checker (server/routes/hugo.js). Points at
// LanguageTool. The public instance is the default so the feature works out of
// the box; set this to a self-hosted container (e.g. the official
// erikvl87/languagetool image) to keep draft text inside your own deployment —
// nothing else has to change.
const LANGUAGETOOL_URL = process.env.LANGUAGETOOL_URL || "https://api.languagetool.org/v2/check";

module.exports = {
  LANGUAGETOOL_URL,
  ADMIN_PHONE,
  ADMIN_PHONES,
  isAdminPhone,
  PREMIUM_GRANT_DAYS,
  DONATIONALERTS_CLIENT_ID,
  DONATIONALERTS_CLIENT_SECRET,
  DONATIONALERTS_REDIRECT_URI,
};
