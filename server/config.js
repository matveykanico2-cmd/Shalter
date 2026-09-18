// Whoever holds this phone number on their account is the Shalter
// administrator/developer — see server/routes/premium.js and
// server/data/sanitize.js (the "Разработчик" badge).
//
// No hardcoded fallback on purpose — this used to default to a real phone
// number baked into source, which meant anyone who forked or bought this
// codebase inherited the previous owner's number as the admin identity until
// they noticed and overrode it. Now it comes only from .env (see
// .env.example) — nothing personal ships in the code itself.
const ADMIN_PHONE = process.env.PREMIUM_ADMIN_PHONE || "";

// Администраторов может быть несколько.
//
// ADMIN_PHONE остаётся «главным»: на него переводят деньги, от его имени идёт
// чат администрации, его ищет findUserByPhone. А права — у любого номера из
// списка, поэтому проверки прав идут через isAdminPhone, а не через сравнение
// с одной строкой.
//
// Дополнительные номера задаются через PREMIUM_ADMIN_PHONES (через запятую) —
// см. .env.example. Без переменной список пуст, а не зашит в код.
const EXTRA_ADMIN_PHONES = (process.env.PREMIUM_ADMIN_PHONES || "")
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

// DonatePay (server/lib/donatePay.js) — no OAuth app here, just a static API
// token from the account's own API page (donatepay.ru — "Настройки → API"
// or similar, the exact wording moves around on their site). Same
// "unset means fall back to manual transfer" story as DonationAlerts above,
// and the two can be configured independently or both at once.
const DONATEPAY_API_TOKEN = process.env.DONATEPAY_API_TOKEN || "";
// DonatePay's API has no endpoint that returns the account's public donation
// page — unlike DonationAlerts' /user/oauth, whose `code` field builds
// donationalerts.com/r/<code> automatically (see donationAlerts.js). So this
// has to be typed in once: whatever page a donor actually pays through,
// e.g. https://donatepay.ru/YOUR-PAGE-NAME.
const DONATEPAY_PAGE_URL = process.env.DONATEPAY_PAGE_URL || "";

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
  DONATEPAY_API_TOKEN,
  DONATEPAY_PAGE_URL,
};
