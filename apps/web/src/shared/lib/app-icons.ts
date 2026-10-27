// Иконка приложения, как public/js/lib/appIcons.js: стандартная («Морская») и варианты, часть —
// с Premium. Выбор — на этом устройстве (значок вкладки, заставка, значок на рабочем столе
// в приложениях) и в настройках аккаунта, чтобы пережить переустановку.
import { http } from "../api";

import { APP_ICONS, type AppIcon, appIconSvg, DEFAULT_APP_ICON, findAppIcon } from "./app-icons-catalog";

export { APP_ICONS, type AppIcon, appIconSvg, DEFAULT_APP_ICON, findAppIcon };

const STORE_KEY = "shalter.appIcon";
// Готовая разметка заставки для index.html: там она нужна до загрузки модулей.
const SPLASH_KEY = "shalter.appIcon.splash";


export function getAppIconId() {
  try {
    const id = localStorage.getItem(STORE_KEY);
    if (id && APP_ICONS.some((i) => i.id === id)) return id;
  } catch {
    // Хранилище недоступно — стандартная.
  }
  return DEFAULT_APP_ICON;
}

export const canUseAppIcon = (id: string, user: { isPremium?: boolean } | null | undefined) => !findAppIcon(id).premium || !!user?.isPremium;

// Значок вкладки: вместо стандартных (svg, 16, 32) — один PNG выбранной иконки.
function applyFavicon(id: string) {
  const head = document.head;
  for (const link of head.querySelectorAll('link[rel="icon"]')) link.remove();
  const icon = document.createElement("link");
  icon.rel = "icon";
  icon.type = "image/png";
  icon.sizes = "32x32";
  icon.id = "shalter-favicon";
  icon.href = `/icons/app/${id}-32.png`;
  head.appendChild(icon);
  const touch = head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (touch) touch.href = `/icons/app/${id}-180.png`;
}

type IconWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { AppIcon?: { set: (o: { name: string }) => Promise<void> } } };
  shalterDesktop?: { setIcon?: (id: string) => Promise<void> };
};
const win = () => window as IconWindow;
const nativeAppIcon = () => (win().Capacitor?.isNativePlatform?.() ? (win().Capacitor?.Plugins?.AppIcon ?? null) : null);

/** Где иконку на рабочем столе можно сменить из приложения. */
export const appIconScope = () => (nativeAppIcon() || win().shalterDesktop?.setIcon ? "native" : "web");

/**
 * Сменить иконку везде, где умеет платформа. Ошибку нативной части пробрасываем — настройки
 * покажут её. remember — сохранить выбор в аккаунте.
 */
export async function setAppIcon(id: string, { remember = true } = {}) {
  const icon = findAppIcon(id);
  if (remember) http.patch("/api/settings", { appIcon: icon.id }).catch(() => {});
  try {
    localStorage.setItem(STORE_KEY, icon.id);
    if (icon.id === DEFAULT_APP_ICON) localStorage.removeItem(SPLASH_KEY);
    else localStorage.setItem(SPLASH_KEY, appIconSvg(icon));
  } catch {
    // Хранилище недоступно — выбор останется в аккаунте.
  }
  applyFavicon(icon.id);
  const native = nativeAppIcon();
  if (native) await native.set({ name: icon.id });
  else await win().shalterDesktop?.setIcon?.(icon.id);
}

/**
 * При запуске: значок вкладки — по выбору, а Premium-иконка без Premium возвращается к
 * стандартной (подписка закончилась).
 */
export function syncAppIcon(user: { isPremium?: boolean }) {
  const id = getAppIconId();
  if (!canUseAppIcon(id, user)) return void setAppIcon(DEFAULT_APP_ICON).catch(() => {});
  if (id !== DEFAULT_APP_ICON) applyFavicon(id);
}

/**
 * Иконка из аккаунта: после переустановки (память пуста) — возвращаем выбранную; выбор,
 * сделанный до того, как иконка хранилась в аккаунте, сохраняем туда.
 */
export function syncAppIconFromSettings(saved: string | undefined, user: { isPremium?: boolean }) {
  const local = getAppIconId();
  const known = saved && APP_ICONS.some((i) => i.id === saved) ? saved : null;
  if (known && known !== local) {
    if (canUseAppIcon(known, user)) setAppIcon(known, { remember: false }).catch(() => {});
  } else if (!known && local !== DEFAULT_APP_ICON) {
    http.patch("/api/settings", { appIcon: local }).catch(() => {});
  }
}

let pulseTimer: ReturnType<typeof setTimeout> | undefined;

/** Значок вкладки мигает при новом сообщении (pulseFavicon): видно, даже когда вкладка в фоне. */
export function pulseFavicon(durationMs = 3000) {
  const favicon = document.getElementById("shalter-favicon");
  if (!favicon) return;
  // Сам <link> анимировать нельзя — вкладка мигает сменой значка: пустой и обратно.
  clearTimeout(pulseTimer);
  const href = `/icons/app/${getAppIconId()}-32.png`;
  let on = false;
  const blink = setInterval(() => {
    on = !on;
    favicon.setAttribute("href", on ? "data:," : href);
  }, 400);
  pulseTimer = setTimeout(() => {
    clearInterval(blink);
    favicon.setAttribute("href", href);
  }, durationMs);
}
