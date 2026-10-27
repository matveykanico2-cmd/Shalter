type SplashWindow = Window & { __splashStart?: number; __splashExit?: (done: () => void) => void };

/**
 * Убрать заставку из index.html, когда понятно, кто вошёл, — removeSplash в public/js/app.js:
 * в первый раз за сессию заставка держится хотя бы 0,6 с и буквы разлетаются.
 */
export function hideBootSplash() {
  const splash = document.getElementById("boot-splash");
  if (!splash || splash.dataset.hiding) return;
  splash.dataset.hiding = "1";
  let first = false;
  try {
    first = !sessionStorage.getItem("shalter.splashShown");
    sessionStorage.setItem("shalter.splashShown", "1");
  } catch {
    // Хранилище недоступно — без задержки.
  }
  const w = window as SplashWindow;
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = first && !reduced ? Math.max(0, 600 - (Date.now() - (w.__splashStart ?? Date.now()))) : 0;
  const hide = () => {
    splash.style.opacity = "0";
    setTimeout(() => splash.remove(), 300);
  };
  setTimeout(() => (first && w.__splashExit ? w.__splashExit(hide) : hide()), wait);
}
