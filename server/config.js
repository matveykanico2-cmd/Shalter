const ADMIN_PHONE = process.env.PREMIUM_ADMIN_PHONE || "";

const EXTRA_ADMIN_PHONES = (process.env.PREMIUM_ADMIN_PHONES || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);
const ADMIN_PHONES = [...new Set([ADMIN_PHONE, ...EXTRA_ADMIN_PHONES])];

function isAdminPhone(phone) {
  return !!phone && ADMIN_PHONES.includes(phone);
}

const PREMIUM_GRANT_DAYS = 30;

const PREMIUM_PLANS = {
  "1m": { days: 30, priceRub: 99, label: "1 месяц" },
  "3m": { days: 90, priceRub: 249, label: "3 месяца" },
  "6m": { days: 180, priceRub: 449, label: "6 месяцев" },
  "12m": { days: 365, priceRub: 799, label: "12 месяцев" },
};
const DEFAULT_PREMIUM_PLAN = "1m";

const BUSINESS_GRANT_DAYS = 30;
const BUSINESS_PLANS = {
  "1m": { days: 30, priceRub: 299, label: "1 месяц" },
  "3m": { days: 90, priceRub: 799, label: "3 месяца" },
  "6m": { days: 180, priceRub: 1499, label: "6 месяцев" },
  "12m": { days: 365, priceRub: 2499, label: "12 месяцев" },
};
const DEFAULT_BUSINESS_PLAN = "1m";

const DONATIONALERTS_CLIENT_ID = process.env.DONATIONALERTS_CLIENT_ID || "";
const DONATIONALERTS_CLIENT_SECRET = process.env.DONATIONALERTS_CLIENT_SECRET || "";
const DONATIONALERTS_REDIRECT_URI = process.env.DONATIONALERTS_REDIRECT_URI || "";

const DONATEPAY_API_TOKEN = process.env.DONATEPAY_API_TOKEN || "";
const DONATEPAY_PAGE_URL = process.env.DONATEPAY_PAGE_URL || "";

const LANGUAGETOOL_URL = process.env.LANGUAGETOOL_URL || "https://api.languagetool.org/v2/check";

const HUGO_AI_ENABLED = !/^(0|off|false|no)$/i.test(process.env.HUGO_AI || "");
const HUGO_AI_URL = process.env.HUGO_AI_URL ?? "https://text.pollinations.ai/openai";
const HUGO_AI_MODEL = process.env.HUGO_AI_MODEL || "openai";
const HUGO_AI_GET_URL = process.env.HUGO_AI_GET_URL ?? "https://text.pollinations.ai/";
const HUGO_AI_TIMEOUT_MS = Number(process.env.HUGO_AI_TIMEOUT_MS) || 25000;
const OLLAMA_URL = (process.env.OLLAMA_URL || "").replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

// Server-side voice message transcription (fallback when the browser couldn't).
// Sends the recording's audio to this endpoint; VOICE_STT=off disables it.
const VOICE_STT_ENABLED = !/^(0|off|false|no)$/i.test(process.env.VOICE_STT || "");
const VOICE_STT_URL = process.env.VOICE_STT_URL || HUGO_AI_URL;
const VOICE_STT_MODEL = process.env.VOICE_STT_MODEL || "openai-audio";

module.exports = {
  VOICE_STT_ENABLED,
  VOICE_STT_URL,
  VOICE_STT_MODEL,
  LANGUAGETOOL_URL,
  HUGO_AI_ENABLED,
  HUGO_AI_URL,
  HUGO_AI_MODEL,
  HUGO_AI_GET_URL,
  HUGO_AI_TIMEOUT_MS,
  OLLAMA_URL,
  OLLAMA_MODEL,
  ADMIN_PHONE,
  ADMIN_PHONES,
  isAdminPhone,
  PREMIUM_GRANT_DAYS,
  PREMIUM_PLANS,
  DEFAULT_PREMIUM_PLAN,
  BUSINESS_GRANT_DAYS,
  BUSINESS_PLANS,
  DEFAULT_BUSINESS_PLAN,
  DONATIONALERTS_CLIENT_ID,
  DONATIONALERTS_CLIENT_SECRET,
  DONATIONALERTS_REDIRECT_URI,
  DONATEPAY_API_TOKEN,
  DONATEPAY_PAGE_URL,
};
