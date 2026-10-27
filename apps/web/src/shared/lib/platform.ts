type NativeWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean };
  __TAURI_INTERNALS__?: unknown;
  shalterDesktop?: unknown;
};

/**
 * Запущено как установленное приложение (Android/iOS на Capacitor или десктоп на Tauri),
 * а не в браузере, — как public/js/lib/platform.js.
 */
export function isInstalledApp() {
  const w = window as NativeWindow;
  return !!(w.Capacitor?.isNativePlatform?.() || w.__TAURI_INTERNALS__ || w.shalterDesktop);
}
