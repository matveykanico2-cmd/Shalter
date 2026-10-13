// Обновление самого приложения (APK, iOS, десктоп). Интерфейс приходит с сервера и
// обновляется сам (lib/appVersion.js), а нативная оболочка — плагины, иконки, мост —
// только переустановкой. Как в Telegram: вышла новая сборка — предлагаем обновиться.
// Версию оболочки сообщают: Android/iOS — в User-Agent «ShalterNative/<версия>»
// (scripts/apply-native-resources.js), десктоп — window.shalterDesktop.version.
import { api } from "../api.js";
import { askConfirm } from "../components/confirmDialog.js";

const SNOOZE_KEY = "shalter.nativeUpdate.snooze";
const SNOOZE_MS = 24 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

function installed() {
  const desktop = window.shalterDesktop;
  if (desktop) {
    // Linux: установленным из .deb предлагаем .deb, AppImage — AppImage.
    const platform = desktop.platform === "linux" && desktop.packaging === "deb" ? "linux-deb" : { win32: "windows", linux: "linux", darwin: "macos-arm64" }[desktop.platform];
    // Сборки до этой версии моста версию не сообщали — значит, они старые.
    return platform ? { platform, version: desktop.version || "0" } : null;
  }
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  const platform = cap.getPlatform?.();
  if (platform !== "android" && platform !== "ios") return null;
  return { platform, version: navigator.userAgent.match(/ShalterNative\/([\d.]+)/)?.[1] ?? "0" };
}

function newer(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

function snoozed(version) {
  try {
    const s = JSON.parse(localStorage.getItem(SNOOZE_KEY) || "null");
    return s?.version === version && Date.now() < s.until;
  } catch {
    return false;
  }
}

function snooze(version) {
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify({ version, until: Date.now() + SNOOZE_MS }));
  } catch {}
}

let asking = false;

async function check() {
  const app = installed();
  if (!app || asking || document.visibilityState !== "visible") return;
  let latest;
  try {
    latest = await api.getNativeLatest(app.platform);
  } catch {
    return;
  }
  if (!latest?.version || !newer(latest.version, app.version) || snoozed(latest.version)) return;
  // Не перебиваем звонок и открытые окна — спросим при следующей проверке.
  if (document.querySelector(".call-screen, .incoming-call-screen, .modal-overlay")) return;
  const url = latest.url ? new URL(latest.url, location.origin).href : app.platform === "ios" ? null : new URL(latest.page || "/download", location.origin).href;
  if (!url) return;
  asking = true;
  try {
    const ok = await askConfirm(
      `Доступна новая версия Shalter ${latest.version}\n\nВ ней исправления и новые возможности. Установите обновление — чаты и настройки сохранятся.`,
      { okLabel: "Обновить", cancelLabel: "Позже", danger: false }
    );
    if (!ok) snooze(latest.version);
    else if (window.shalterDesktop?.installUpdate && latest.url) {
      // Приложение для компьютера обновляется само: скачивает сборку и ставит её поверх.
      const { showToast } = await import("../components/toast.js");
      const sizeMb = latest.size ? ` (${Math.round(latest.size / 1048576)} МБ)` : "";
      showToast(`Скачиваем обновление${sizeMb}… Shalter перезапустится сам`, { duration: 8000 });
      try {
        const result = await window.shalterDesktop.installUpdate(url);
        if (result === "external") showToast("Откройте скачанный пакет, чтобы установить обновление");
      } catch (err) {
        showToast(`Не удалось обновить автоматически: ${err?.message || err}. Открываем страницу загрузки`);
        window.open(new URL("/download", location.origin).href, "_blank", "noopener");
      }
    } else window.open(url, "_blank", "noopener");
  } finally {
    asking = false;
  }
}

export function startNativeUpdateCheck() {
  if (!installed()) return;
  setTimeout(check, 15000);
  setInterval(check, CHECK_EVERY_MS);
}
