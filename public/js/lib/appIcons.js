// Иконка приложения, как в Telegram: стандартная («Морская») и варианты, часть — с Premium.
// Выбор — на этом устройстве: значок на рабочем столе (Android, iOS, компьютер),
// заставка при запуске и значок вкладки в браузере.
// Каталог общий с scripts/gen-app-icons.mjs, который рисует из него PNG для всех платформ:
// после правки здесь — `node scripts/gen-app-icons.mjs`.

export const APP_ICONS = [
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

export function findAppIcon(id) {
  return APP_ICONS.find((i) => i.id === id) ?? APP_ICONS[0];
}

// Знак Shalter в координатах 512×512 (как public/icons/icon.svg).
const GLYPH = (i) =>
  `<path fill="${i.body}" d="M65 186L397 131L357 333L77 336Z"/><path fill="${i.wing}" d="M397 131L250 235L357 333Z"/><path fill="${i.tail}" d="M134 336L214 340L138 437Z"/>`;

function background(i, shape, gradId) {
  const fill = i.bg.length > 1 ? `url(#${gradId})` : i.bg[0];
  const defs =
    i.bg.length > 1
      ? `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${i.bg[0]}"/><stop offset="1" stop-color="${i.bg[1]}"/></linearGradient></defs>`
      : "";
  const body = shape === "circle" ? `<circle cx="256" cy="256" r="256" fill="${fill}"/>` : `<rect width="512" height="512" fill="${fill}"/>`;
  return defs + body;
}

// shape: "circle" — как значок вкладки и заставка; "square" — во весь квадрат (iOS,
// фон адаптивной иконки Android; углы скругляет сама система).
// glyph: "auto" — знак как в icon.svg; "fit" — уменьшенный и по центру (для квадрата).
export function appIconSvg(icon, { shape = "circle", withGlyph = true, withBackground = true, glyphScale } = {}) {
  const i = typeof icon === "string" ? findAppIcon(icon) : icon;
  const gradId = `g-${i.id}`;
  // Центр знака (231, 284) — в центр холста; scale < 1 оставляет поля по краям.
  const k = glyphScale ?? (shape === "square" ? 0.82 : 1);
  const glyph = withGlyph
    ? k === 1
      ? GLYPH(i)
      : `<g transform="translate(${(256 - 231 * k).toFixed(2)} ${(256 - 284 * k).toFixed(2)}) scale(${k})">${GLYPH(i)}</g>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${withBackground ? background(i, shape, gradId) : ""}${glyph}</svg>`;
}

export function getAppIconId() {
  try {
    const id = localStorage.getItem(STORE_KEY);
    if (id && APP_ICONS.some((i) => i.id === id)) return id;
  } catch {}
  return DEFAULT_APP_ICON;
}

export function canUseAppIcon(id, user) {
  return !findAppIcon(id).premium || !!user?.isPremium;
}

// Значок вкладки: вместо стандартных (svg, 16, 32) — один PNG выбранной иконки.
function applyFavicon(id) {
  const head = document.head;
  if (!head) return;
  for (const link of head.querySelectorAll('link[rel="icon"]')) link.remove();
  const icon = document.createElement("link");
  icon.rel = "icon";
  icon.type = "image/png";
  icon.sizes = "32x32";
  icon.id = "shalter-favicon";
  icon.href = `/icons/app/${id}-32.png`;
  head.appendChild(icon);
  const touch = head.querySelector('link[rel="apple-touch-icon"]');
  if (touch) touch.href = `/icons/app/${id}-180.png`;
}

// Пульсирующая анимация фавикона при новом сообщении.
let faviconPulseTimer = null;
export function pulseFavicon(durationMs = 3000) {
  const favicon = document.getElementById("shalter-favicon");
  if (!favicon) return;
  const originalHref = favicon.href;
  const pulseIcon = document.createElement("link");
  pulseIcon.rel = "icon";
  pulseIcon.type = "image/png";
  pulseIcon.sizes = "32x32";
  pulseIcon.id = "shalter-favicon-pulse";
  // Используем ту же иконку, но с пульсацией через CSS
  pulseIcon.href = originalHref;
  document.head.appendChild(pulseIcon);
  favicon.remove();

  const style = document.createElement("style");
  style.textContent = `
    @keyframes favicon-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(1.1); }
    }
    #shalter-favicon-pulse {
      animation: favicon-pulse 800ms ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);

  clearTimeout(faviconPulseTimer);
  faviconPulseTimer = setTimeout(() => {
    const pulse = document.getElementById("shalter-favicon-pulse");
    const styleEl = document.querySelector('style:has(#shalter-favicon-pulse)') || document.querySelector("style:last-of-type");
    if (pulse) pulse.remove();
    if (styleEl) styleEl.remove();
    const original = document.createElement("link");
    original.rel = "icon";
    original.type = "image/png";
    original.sizes = "32x32";
    original.id = "shalter-favicon";
    original.href = `/icons/app/${getAppIconId()}-32.png`;
    document.head.appendChild(original);
  }, durationMs);
}

function nativeAppIcon() {
  const cap = window.Capacitor;
  return cap?.isNativePlatform?.() ? cap.Plugins?.AppIcon ?? null : null;
}

// Меняет иконку везде, где это умеет платформа. Ошибку нативной части (старый APK без
// плагина, iOS без альтернативных иконок) пробрасываем — настройки покажут её.
// remember — сохранить выбор в аккаунте: после обновления или переустановки
// приложения память телефона очищается, и без этого иконка становилась стандартной.
export async function setAppIcon(id, { remember = true } = {}) {
  const icon = findAppIcon(id);
  if (remember) {
    import("../api.js").then(({ api }) => api.patchSettings({ appIcon: icon.id })).catch(() => {});
  }
  try {
    localStorage.setItem(STORE_KEY, icon.id);
    if (icon.id === DEFAULT_APP_ICON) localStorage.removeItem(SPLASH_KEY);
    else localStorage.setItem(SPLASH_KEY, appIconSvg(icon));
  } catch {}
  applyFavicon(icon.id);
  const native = nativeAppIcon();
  if (native) await native.set({ name: icon.id });
  else if (window.shalterDesktop?.setIcon) await window.shalterDesktop.setIcon(icon.id);
}

// Где иконку на рабочем столе можно сменить из приложения.
export function appIconScope() {
  if (nativeAppIcon() || window.shalterDesktop?.setIcon) return "native";
  return "web";
}

// При запуске: значок вкладки — по выбору, а Premium-иконка без Premium возвращается
// к стандартной (подписка закончилась).
// fresh: false — пользователь из кэша, подписка в нём могла устареть: не откатываем.
export function syncAppIcon(user, { fresh = true } = {}) {
  const id = getAppIconId();
  if (fresh && !canUseAppIcon(id, user)) {
    setAppIcon(DEFAULT_APP_ICON).catch(() => {});
    return;
  }
  if (id !== DEFAULT_APP_ICON) applyFavicon(id);
}

// Иконка из аккаунта: после обновления/переустановки (память телефона пуста) —
// возвращаем выбранную, в том числе на рабочем столе. Выбор, сделанный до того,
// как иконка стала храниться в аккаунте, сохраняем туда при первом запуске.
let restored = false;
export function syncAppIconFromSettings(settings, user) {
  if (!settings || restored) return;
  restored = true;
  const local = getAppIconId();
  const saved = settings.appIcon && APP_ICONS.some((i) => i.id === settings.appIcon) ? settings.appIcon : null;
  if (saved && saved !== local) {
    if (canUseAppIcon(saved, user)) setAppIcon(saved, { remember: false }).catch(() => {});
  } else if (!saved && local !== DEFAULT_APP_ICON) {
    import("../api.js").then(({ api }) => api.patchSettings({ appIcon: local })).catch(() => {});
  }
}
