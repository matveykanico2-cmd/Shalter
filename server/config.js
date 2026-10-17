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
const HUGO_AI_MODEL = process.env.HUGO_AI_MODEL || "openai-fast"; // без ключа Pollinations отдаёт только эту модель
const HUGO_AI_GET_URL = process.env.HUGO_AI_GET_URL ?? "https://text.pollinations.ai/";
const HUGO_AI_TIMEOUT_MS = Number(process.env.HUGO_AI_TIMEOUT_MS) || 50000;
const OLLAMA_URL = (process.env.OLLAMA_URL || "").replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

// Shalter AI (lib/shalterAi.js): GigaChat (Сбер, бесплатный пакет для физлиц, работает
// из России) — если задан ключ; иначе Pollinations (без ключа — только текст).
const SHALTER_AI_ENABLED = !/^(0|off|false|no)$/i.test(process.env.SHALTER_AI || "");
const GIGACHAT_AUTH_KEY = process.env.GIGACHAT_AUTH_KEY || "";
const GIGACHAT_SCOPE = process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";
const GIGACHAT_MODEL = process.env.GIGACHAT_MODEL || "GigaChat-2";
const GIGACHAT_VISION_MODEL = process.env.GIGACHAT_VISION_MODEL || "GigaChat-2-Max";
const POLLINATIONS_TOKEN = process.env.POLLINATIONS_TOKEN || "";
// Бесплатные нейросети, которые видят фото и видео (кадрами) и доступны из России:
// OpenRouter — бесплатные модели «:free» (Gemma и др.), ключ на openrouter.ai/keys;
// Hugging Face — бесплатный месячный пакет, токен на huggingface.co/settings/tokens.
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "";
const HF_TOKEN = process.env.HF_TOKEN || "";
const HF_MODEL = process.env.HF_MODEL || "google/gemma-3-12b-it";
// Бесплатная распознавание фото/видео без ключа — публичное Gradio‑пространство Qwen2-VL на
// Hugging Face (см. lib/hfSpaces.js describeImageRemote). Доступно без токена, токен лишь
// повышает квоту. HF_VISION_KEYLESS=off — выключить (например, если пространство недоступно).
const HF_VISION_KEYLESS = !/^(0|off|false|no)$/i.test(process.env.HF_VISION_KEYLESS || "");
const SHALTER_AI_RATE_PER_MIN = Number(process.env.SHALTER_AI_RATE_PER_MIN) || 30;
const SHALTER_AI_IMAGES_PER_MIN = Number(process.env.SHALTER_AI_IMAGES_PER_MIN) || 10;

module.exports = {
  LANGUAGETOOL_URL,
  HUGO_AI_ENABLED,
  HUGO_AI_URL,
  HUGO_AI_MODEL,
  HUGO_AI_GET_URL,
  HUGO_AI_TIMEOUT_MS,
  OLLAMA_URL,
  OLLAMA_MODEL,
  SHALTER_AI_ENABLED,
  GIGACHAT_AUTH_KEY,
  GIGACHAT_SCOPE,
  GIGACHAT_MODEL,
  GIGACHAT_VISION_MODEL,
  POLLINATIONS_TOKEN,
  OPENROUTER_API_KEY,
  OPENROUTER_MODEL,
  HF_TOKEN,
  HF_MODEL,
  HF_VISION_KEYLESS,
  SHALTER_AI_RATE_PER_MIN,
  SHALTER_AI_IMAGES_PER_MIN,
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
