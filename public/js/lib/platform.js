// Запущено как установленное приложение (Android/iOS на Capacitor или десктоп на
// Tauri), а не в браузере. Внутри приложения, например, незачем «Скачать приложение».
export function isInstalledApp() {
  return !!(window.Capacitor?.isNativePlatform?.() || window.__TAURI_INTERNALS__ || window.shalterDesktop);
}
