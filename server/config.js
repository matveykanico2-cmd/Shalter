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

// Default Premium grant length — the referral bonus uses this directly, and
// it's also the "1m" tariff's length below. Longer/shorter one-off durations
// are also available individually through the Gifts catalog
// (server/data/gifts.js), which is unrelated to these fixed purchase tiers.
const PREMIUM_GRANT_DAYS = 30;

// Purchase tiers offered on the Settings → Premium screen (server/routes/
// premium.js's /request, /me). Same "message the admin / DonationAlerts"
// payment flow as before — this just gives the buyer a choice of length
// instead of a single fixed 30 days, the way Telegram Premium's own purchase
// screen offers a short/discounted-longer spread rather than one price.
const PREMIUM_PLANS = {
  "1m": { days: 30, priceRub: 99, label: "1 месяц" },
  "3m": { days: 90, priceRub: 249, label: "3 месяца" },
  "12m": { days: 365, priceRub: 799, label: "12 месяцев" },
};
const DEFAULT_PREMIUM_PLAN = "1m";

// Тарифы облачного хранилища (Настройки → Хранилище, server/routes/
// storage.js) — сетка как у Google One: несколько объёмов, помесячно или на
// год со скидкой в два месяца. Лимита по умолчанию нет, и тариф ничего не
// ограничивает: загрузка работает одинаково с ним и без него, тариф — это
// поддержка проекта и отметка объёма в профиле.
//
// Оплата — тем же путём, что Premium (lib/autoPayment.js или перевод
// администрации), и заказ находится обратно по цене (lib/fulfillOrder.js),
// поэтому все priceRub здесь обязаны быть разными.
const STORAGE_PLANS = {
  "100gb-1m": { gb: 100, days: 30, priceRub: 149, label: "100 ГБ", period: "month" },
  "200gb-1m": { gb: 200, days: 30, priceRub: 249, label: "200 ГБ", period: "month" },
  "2tb-1m": { gb: 2048, days: 30, priceRub: 699, label: "2 ТБ", period: "month" },
  "100gb-12m": { gb: 100, days: 365, priceRub: 1490, label: "100 ГБ", period: "year" },
  "200gb-12m": { gb: 200, days: 365, priceRub: 2490, label: "200 ГБ", period: "year" },
  "2tb-12m": { gb: 2048, days: 365, priceRub: 6990, label: "2 ТБ", period: "year" },
};
const DEFAULT_STORAGE_PLAN = "100gb-1m";

// "Shalter для бизнеса" (Настройки → Shalter для бизнеса, server/routes/
// business.js) — часы работы, приветствие/автоответ, быстрые ответы,
// геолокация офиса. Отдельная, более дорогая подписка поверх Premium (как
// Telegram Business поверх Premium), не входит в обычный Premium.
const BUSINESS_GRANT_DAYS = 30;
const BUSINESS_PLANS = {
  "1m": { days: 30, priceRub: 299, label: "1 месяц" },
  "3m": { days: 90, priceRub: 799, label: "3 месяца" },
  "12m": { days: 365, priceRub: 2499, label: "12 месяцев" },
};
const DEFAULT_BUSINESS_PLAN = "1m";

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
  PREMIUM_PLANS,
  DEFAULT_PREMIUM_PLAN,
  STORAGE_PLANS,
  DEFAULT_STORAGE_PLAN,
  BUSINESS_GRANT_DAYS,
  BUSINESS_PLANS,
  DEFAULT_BUSINESS_PLAN,
  DONATIONALERTS_CLIENT_ID,
  DONATIONALERTS_CLIENT_SECRET,
  DONATIONALERTS_REDIRECT_URI,
  DONATEPAY_API_TOKEN,
  DONATEPAY_PAGE_URL,
};
