const OLD_DEFAULT = "#2E56D9";

export function applyAccentSetting(hex) {
  const root = document.documentElement;
  if (!hex || String(hex).toUpperCase() === OLD_DEFAULT) root.style.removeProperty("--color-accent");
  else root.style.setProperty("--color-accent", hex);
}

export function isThemeAccent(hex) {
  return !hex || String(hex).toUpperCase() === OLD_DEFAULT;
}
