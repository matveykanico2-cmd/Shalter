// Цвет имени (Premium) — палитра peer colors из Telegram: светлая и тёмная темы.
export const NAME_COLORS = {
  red: { light: "#cc5049", dark: "#ff8e86", label: "Красный" },
  orange: { light: "#d67722", dark: "#ffa357", label: "Оранжевый" },
  violet: { light: "#955cdb", dark: "#b18fff", label: "Фиолетовый" },
  green: { light: "#40a920", dark: "#68d64f", label: "Зелёный" },
  cyan: { light: "#309eba", dark: "#40d8d0", label: "Бирюзовый" },
  blue: { light: "#368ad1", dark: "#52bfff", label: "Синий" },
  pink: { light: "#c7508b", dark: "#ff7dbb", label: "Розовый" },
};

function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function nameColorValue(key) {
  const c = NAME_COLORS[key];
  return c ? (isDark() ? c.dark : c.light) : null;
}
