// Иконка приложения, как public/js/lib/appIcons.js: стандартная («Морская») и варианты, часть —
// с Premium. Выбор — на этом устройстве (значок вкладки, заставка, значок на рабочем столе
// в приложениях) и в настройках аккаунта, чтобы пережить переустановку.
import { http } from "../api";

export type AppIcon = { id: string; label: string; premium?: boolean; bg: string[]; body: string; wing: string; tail: string };

export const APP_ICONS: readonly AppIcon[] = [
  { id: "classic", label: "Морская", bg: ["#3d6df0"], body: "#ffffff", wing: "#a9c4fb", tail: "#d3e0fd" },
  { id: "night", label: "Ночная", bg: ["#1c2333"], body: "#ffffff", wing: "#6f8fe0", tail: "#9fb3e6" },
  { id: "mint", label: "Мятная", bg: ["#12b886"], body: "#ffffff", wing: "#a6ead4", tail: "#cff5e8" },
  { id: "sunset", label: "Закат", bg: ["#ff7a45"], body: "#ffffff", wing: "#ffc2a6", tail: "#ffe0d1" },
  { id: "light", label: "Светлая", bg: ["#ffffff"], body: "#3d6df0", wing: "#a9c4fb", tail: "#7fa0f5" },
  { id: "premium", label: "Premium", premium: true, bg: ["#7b5cff", "#e352d6"], body: "#ffffff", wing: "#e6c9ff", tail: "#f3dcff" },
  { id: "gold", label: "Золотая", premium: true, bg: ["#f7c948", "#e08e0b"], body: "#ffffff", wing: "#ffe7a3", tail: "#fff2cc" },
  { id: "aurora", label: "Аврора", premium: true, bg: ["#00c6a7", "#1e4ed8"], body: "#ffffff", wing: "#9debdc", tail: "#c6f3ea" },
  { id: "cosmos", label: "Космос", premium: true, bg: ["#1a1446", "#5b2bd6"], body: "#ffffff", wing: "#b9a5ff", tail: "#ffd166" },
  { id: "neon", label: "Неон", premium: true, bg: ["#0b0b14"], body: "#ff3ea5", wing: "#25e0ff", tail: "#a35bff" },
];

export const DEFAULT_APP_ICON = "classic";

const STORE_KEY = "shalter.appIcon";
// Готовая разметка заставки для index.html: там она нужна до загрузки модулей.
const SPLASH_KEY = "shalter.appIcon.splash";

const CLASSIC: AppIcon = { id: "classic", label: "Морская", bg: ["#3d6df0"], body: "#ffffff", wing: "#a9c4fb", tail: "#d3e0fd" };
export const findAppIcon = (id: string | null | undefined): AppIcon => APP_ICONS.find((i) => i.id === id) ?? APP_ICONS[0] ?? CLASSIC;

// Знак Shalter в координатах 512×512 (как public/icons/icon.svg).
const glyph = (i: AppIcon) =>
  `<path fill="${i.body}" d="M65 186L397 131L357 333L77 336Z"/><path fill="${i.wing}" d="M397 131L250 235L357 333Z"/><path fill="${i.tail}" d="M134 336L214 340L138 437Z"/>`;

function background(i: AppIcon, shape: "circle" | "square", gradId: string) {
  const [from, to] = i.bg;
  const fill = to ? `url(#${gradId})` : from;
  const defs = to
    ? `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>`
    : "";
  return defs + (shape === "circle" ? `<circle cx="256" cy="256" r="256" fill="${fill}"/>` : `<rect width="512" height="512" fill="${fill}"/>`);
}

type SvgOptions = { shape?: "circle" | "square"; withGlyph?: boolean; withBackground?: boolean; glyphScale?: number };

/** SVG иконки: circle — как значок вкладки и заставка; square — во весь квадрат (iOS, Android). */
export function appIconSvg(icon: string | AppIcon, options: SvgOptions | "circle" | "square" = {}) {
  const { shape = "circle", withGlyph = true, withBackground = true, glyphScale } = typeof options === "string" ? { shape: options } : options;
  const i = typeof icon === "string" ? findAppIcon(icon) : icon;
  // Центр знака (231, 284) — в центр холста; масштаб < 1 оставляет поля по краям.
  const k = glyphScale ?? (shape === "square" ? 0.82 : 1);
  const g = withGlyph
    ? k === 1
      ? glyph(i)
      : `<g transform="translate(${(256 - 231 * k).toFixed(2)} ${(256 - 284 * k).toFixed(2)}) scale(${k})">${glyph(i)}</g>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${withBackground ? background(i, shape, `g-${i.id}`) : ""}${g}</svg>`;
}

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
