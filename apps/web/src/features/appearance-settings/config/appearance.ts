// Наборы для «Внешнего вида» — из renderAppearance (public/js/views/settings/index.js) и lib/accent.js.

export const THEMES = [
  { id: "light", label: "Светлая" },
  { id: "dark", label: "Тёмная" },
  { id: "system", label: "Системная" },
] as const;

/** "" — цвет из темы. */
export const ACCENTS = [
  "",
  "#3390EC", "#E53935", "#4FAE4E", "#E39D2B", "#8774E1", "#1C9BD9", "#D9822E",
  "#00A99D", "#8BC34A", "#E56B3B", "#E0507A", "#C2185B", "#7C6FD6", "#5C6BC0", "#607D8B",
] as const;

// Акцент по умолчанию из прошлых версий — тоже «как в теме».
const OLD_DEFAULT_ACCENT = "#2E56D9";
export const isThemeAccent = (hex: string | undefined) => !hex || hex.toUpperCase() === OLD_DEFAULT_ACCENT;

export const FONT_MIN = 12;
export const FONT_MAX = 20;
// 15 — старое значение по умолчанию, при нём размер из темы (16px, как в tweb).
const OLD_DEFAULT_FONT = 15;
const DEFAULT_FONT_SIZE = 16;
export const effectiveFontSize = (size: number | undefined) => (!size || size === OLD_DEFAULT_FONT ? DEFAULT_FONT_SIZE : size);

export const UNSUPPORTED_LANGUAGE_NOTE = "Украинский язык не поддерживается в нашем мессенджере.";

export const LANGUAGES = [
  { id: "ru", label: "Русский" },
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "zh-CN", label: "中文" },
  { id: "hi", label: "हिन्दी" },
  { id: "ar", label: "العربية" },
  { id: "pt", label: "Português" },
  { id: "fr", label: "Français" },
  { id: "de", label: "Deutsch" },
  { id: "ja", label: "日本語" },
  { id: "ko", label: "한국어" },
  { id: "tr", label: "Türkçe" },
  { id: "it", label: "Italiano" },
  { id: "pl", label: "Polski" },
  { id: "vi", label: "Tiếng Việt" },
  { id: "th", label: "ไทย" },
  { id: "id", label: "Bahasa Indonesia" },
  { id: "fa", label: "فارسی" },
  { id: "kk", label: "Қазақша" },
] as const;
