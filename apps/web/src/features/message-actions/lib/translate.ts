// Языки и перевод текста — как public/js/components/translatePopup.js: сначала сервер,
// без него — переводчик браузера; готовые переводы помним до перезагрузки.
import { translateLocally } from "@/shared/lib/local-translate";

import { translateText } from "../api/message-actions";

export type TranslateLanguage = { id: string; label: string; from: string; to: string };

export const TRANSLATE_LANGUAGES: readonly TranslateLanguage[] = [
  { id: "ru", label: "Русский", from: "русского", to: "русский" },
  { id: "en", label: "English", from: "английского", to: "английский" },
  { id: "es", label: "Español", from: "испанского", to: "испанский" },
  { id: "zh-CN", label: "中文", from: "китайского", to: "китайский" },
  { id: "hi", label: "हिन्दी", from: "хинди", to: "хинди" },
  { id: "ar", label: "العربية", from: "арабского", to: "арабский" },
  { id: "pt", label: "Português", from: "португальского", to: "португальский" },
  { id: "fr", label: "Français", from: "французского", to: "французский" },
  { id: "de", label: "Deutsch", from: "немецкого", to: "немецкий" },
  { id: "ja", label: "日本語", from: "японского", to: "японский" },
  { id: "ko", label: "한국어", from: "корейского", to: "корейский" },
  { id: "tr", label: "Türkçe", from: "турецкого", to: "турецкий" },
  { id: "it", label: "Italiano", from: "итальянского", to: "итальянский" },
  { id: "pl", label: "Polski", from: "польского", to: "польский" },
  { id: "uk", label: "Українська", from: "украинского", to: "украинский" },
  { id: "vi", label: "Tiếng Việt", from: "вьетнамского", to: "вьетнамский" },
  { id: "th", label: "ไทย", from: "тайского", to: "тайский" },
  { id: "id", label: "Bahasa Indonesia", from: "индонезийского", to: "индонезийский" },
  { id: "fa", label: "فارسی", from: "персидского", to: "персидский" },
  { id: "kk", label: "Қазақша", from: "казахского", to: "казахский" },
];

const base = (id: string | null | undefined) => String(id ?? "").split("-")[0];

/** Язык по коду; «zh» найдёт «zh-CN». */
export const languageOf = (id: string | null | undefined) => (id ? TRANSLATE_LANGUAGES.find((l) => l.id === id || base(l.id) === base(id)) : undefined);

export type Translation = { text: string; detected: string | null };

const cache = new Map<string, Translation>();

export async function translate(text: string, lang: string): Promise<Translation> {
  const key = `${lang}\n${text}`;
  const cached = cache.get(key);
  if (cached) return cached;
  // Сначала сервер: встроенный переводчик Chrome путается на коротких и смешанных текстах.
  let result: Translation | null = await translateText(text, lang)
    .then((r) => ({ text: r.translated, detected: r.detectedLang ?? null }))
    .catch(() => null);
  if (!result?.text) {
    const local = await translateLocally(text, lang).catch(() => null);
    result = local ? { text: local, detected: null } : null;
  }
  if (!result?.text) throw new Error("no translation");
  cache.set(key, result);
  return result;
}
