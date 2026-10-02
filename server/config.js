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

// Тарифы и цены — server/data/pricing.js (админ меняет их в Настройки → Цены).

const BUSINESS_GRANT_DAYS = 30;

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

module.exports = {
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
  BUSINESS_GRANT_DAYS,
  DONATIONALERTS_CLIENT_ID,
  DONATIONALERTS_CLIENT_SECRET,
  DONATIONALERTS_REDIRECT_URI,
  DONATEPAY_API_TOKEN,
  DONATEPAY_PAGE_URL,
};
