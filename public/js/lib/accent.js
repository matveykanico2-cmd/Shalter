// Акцент интерфейса из настроек. Пустое значение — акцент самой темы из
// base.css (голубой в светлой, фиолетовый в тёмной, как в Telegram).
//
// #2E56D9 — прежний акцент по умолчанию: он сохранён в настройках почти у
// всех, кто ничего не выбирал сам, и без этой замены новая палитра у них
// просто не включилась бы.
const OLD_DEFAULT = "#2E56D9";

export function applyAccentSetting(hex) {
  const root = document.documentElement;
  if (!hex || String(hex).toUpperCase() === OLD_DEFAULT) root.style.removeProperty("--color-accent");
  else root.style.setProperty("--color-accent", hex);
}

export function isThemeAccent(hex) {
  return !hex || String(hex).toUpperCase() === OLD_DEFAULT;
}
