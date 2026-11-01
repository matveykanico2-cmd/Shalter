// Язык интерфейса по стране (ISO 3166-1 alpha-2) и по заголовку Accept-Language.
// Коды языков — те, что понимает перевод интерфейса (Google Translate) и выбор языка в клиенте
// (китайский — "zh-CN"/"zh-TW", остальные — двухбуквенные).

/** Основной язык страны. Страны, которых нет в списке, — неизвестны (дальше Accept-Language). */
export const COUNTRY_LANGUAGE: Readonly<Record<string, string>> = {
  // Русский
  RU: "ru", BY: "ru", KZ: "ru", KG: "ru", TJ: "ru", TM: "ru", MD: "ru",
  // Украина: украинский не поддерживается — значит, дальше по цепочке (Accept-Language, русский).
  UA: "uk",
  // Английский
  US: "en", GB: "en", AU: "en", CA: "en", NZ: "en", IE: "en", ZA: "en", NG: "en", KE: "en", GH: "en",
  SG: "en", PH: "en", JM: "en", MT: "en",
  // Немецкий
  DE: "de", AT: "de", CH: "de", LI: "de", LU: "de",
  // Французский
  FR: "fr", BE: "fr", MC: "fr", SN: "fr", CI: "fr", CM: "fr", MA: "fr", DZ: "fr", TN: "fr",
  // Испанский
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es", EC: "es", GT: "es", CU: "es",
  BO: "es", DO: "es", HN: "es", PY: "es", SV: "es", NI: "es", CR: "es", PA: "es", UY: "es", PR: "es",
  // Португальский
  BR: "pt", PT: "pt", AO: "pt", MZ: "pt",
  IT: "it", SM: "it",
  TR: "tr",
  PL: "pl",
  CN: "zh-CN", TW: "zh-TW", HK: "zh-TW", MO: "zh-TW",
  JP: "ja",
  KR: "ko",
  IN: "hi",
  ID: "id",
  UZ: "uz",
  AZ: "az",
  AM: "hy",
  GE: "ka",
  IL: "he",
  // Арабский
  SA: "ar", AE: "ar", EG: "ar", IQ: "ar", JO: "ar", KW: "ar", QA: "ar", BH: "ar", OM: "ar", LB: "ar",
  SY: "ar", YE: "ar", LY: "ar", SD: "ar",
  IR: "fa", AF: "fa",
  VN: "vi",
  TH: "th",
  NL: "nl",
  SE: "sv",
  NO: "no",
  DK: "da",
  FI: "fi",
  CZ: "cs",
  SK: "sk",
  HU: "hu",
  RO: "ro",
  BG: "bg",
  GR: "el", CY: "el",
  RS: "sr",
  HR: "hr",
  SI: "sl",
  LT: "lt",
  LV: "lv",
  EE: "et",
  MN: "mn",
  MY: "ms",
  BD: "bn",
  PK: "ur",
};

/** Языки, которые можно взять из Accept-Language: все языки стран выше. */
const KNOWN_LANGUAGES = new Set(Object.values(COUNTRY_LANGUAGE).concat(["kk"]));

/** Код языка к виду, принятому в настройках: "en-US" → "en", "zh-Hans-CN" → "zh-CN", "zh-TW" → "zh-TW". */
export function normalizeLanguage(tag: string): string | null {
  const parts = tag.trim().toLowerCase().split(/[-_]/);
  const primary = parts[0] ?? "";
  if (!/^[a-z]{2,3}$/.test(primary)) return null;
  if (primary === "zh") {
    const rest = parts.slice(1);
    return rest.some((p) => p === "tw" || p === "hk" || p === "mo" || p === "hant") ? "zh-TW" : "zh-CN";
  }
  if (primary === "iw") return "he";
  if (primary === "nb" || primary === "nn") return "no";
  return KNOWN_LANGUAGES.has(primary) ? primary : null;
}

/** Язык страны или null (страна неизвестна или язык не поддерживается мессенджером). */
export function languageForCountry(country: string | null | undefined, isUnsupported: (code: string) => boolean): string | null {
  const lang = country ? COUNTRY_LANGUAGE[country.toUpperCase()] : undefined;
  return lang && !isUnsupported(lang) ? lang : null;
}

/** Первый подходящий язык из Accept-Language по убыванию q; "*" и неподдерживаемые пропускаются. */
export function languageFromAcceptHeader(header: string | null | undefined, isUnsupported: (code: string) => boolean): string | null {
  if (!header) return null;
  const ranked = String(header)
    .slice(0, 500)
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((r) => r.tag && r.tag !== "*" && r.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { tag } of ranked) {
    const lang = normalizeLanguage(tag);
    if (lang && !isUnsupported(lang)) return lang;
  }
  return null;
}
