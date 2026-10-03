const OLD_DEFAULT = "#2E56D9";

export function applyAccentSetting(hex) {
  const root = document.documentElement;
  if (!hex || String(hex).toUpperCase() === OLD_DEFAULT) root.style.removeProperty("--color-accent");
  else root.style.setProperty("--color-accent", hex);
}

export function isThemeAccent(hex) {
  return !hex || String(hex).toUpperCase() === OLD_DEFAULT;
}

// Размер текста сообщений (Настройки → Внешний вид). 15 — старое значение по умолчанию,
// при нём оставляем размер из темы (16px, как в tweb).
const OLD_DEFAULT_FONT = 15;
export const DEFAULT_FONT_SIZE = 16;

export function effectiveFontSize(size) {
  const n = Number(size);
  return !n || n === OLD_DEFAULT_FONT ? DEFAULT_FONT_SIZE : n;
}

export function applyFontSizeSetting(size) {
  const root = document.documentElement;
  const n = effectiveFontSize(size);
  if (n === DEFAULT_FONT_SIZE) root.style.removeProperty("--tw-messages-text");
  else root.style.setProperty("--tw-messages-text", `${n}px`);
}
