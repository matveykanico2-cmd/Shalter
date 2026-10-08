import { api } from "../api.js";
import { navigate } from "../router.js";

// ---------- Android-приложение (Capacitor): уведомления через FCM ----------
// Веб-push в WebView приложения не работает: там плагин PushNotifications выдаёт
// токен устройства, а сервер шлёт на него через Firebase (server/lib/fcm.js).

function nativePushPlugin() {
  const cap = window.Capacitor;
  return cap?.isNativePlatform?.() ? cap.Plugins?.PushNotifications ?? null : null;
}

export function isNativeApp() {
  return !!window.Capacitor?.isNativePlatform?.();
}

let nativeReady = null;
let nativeToken = null;
function setupNativePush(plugin) {
  nativeReady ??= (async () => {
    // Свои каналы: звонки громче и поверх всего, сообщения — обычные с звуком.
    await plugin.createChannel?.({ id: "messages", name: "Сообщения", importance: 4, visibility: 1, vibration: true }).catch(() => {});
    await plugin.createChannel?.({ id: "calls", name: "Звонки", importance: 5, visibility: 1, vibration: true }).catch(() => {});
    await plugin.addListener("registration", ({ value }) => {
      nativeToken = value;
      api.subscribeNativePush(value).catch(() => {});
    });
    await plugin.addListener("registrationError", (err) => {
      lastError = `Не удалось получить токен уведомлений: ${err?.error || "ошибка"}`;
    });
    // Нажали на уведомление — открываем тот чат/звонок, о котором оно.
    await plugin.addListener("pushNotificationActionPerformed", ({ notification }) => {
      const url = notification?.data?.url;
      if (!url) return;
      try {
        const u = new URL(url, location.origin);
        if (u.origin === location.origin) navigate(u.pathname + u.search);
      } catch {}
    });
  })();
  return nativeReady;
}

async function registerNative({ prompt }) {
  const plugin = nativePushPlugin();
  if (!plugin) return false;
  await setupNativePush(plugin);
  let { receive } = await plugin.checkPermissions();
  if (receive !== "granted" && prompt) ({ receive } = await plugin.requestPermissions());
  if (receive !== "granted") {
    lastError = "Уведомления запрещены в настройках Android для Shalter.";
    return false;
  }
  await plugin.register();
  return true;
}

export function isPushSupported() {
  if (nativePushPlugin()) return true;
  return "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

let lastError = null;

export function getPushError() {
  return lastError;
}

async function subscribeNow() {
  lastError = null;
  if (!window.isSecureContext) {
    lastError = "Уведомления работают только по https. Откройте приложение по защищённому адресу.";
    throw new Error(lastError);
  }
  if (!isPushSupported()) {
    lastError = "Этот браузер не умеет push-уведомления.";
    throw new Error(lastError);
  }
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const { publicKey } = await api.getVapidPublicKey().catch(() => ({}));
    if (!publicKey) {
      lastError = "Сервер не выдал ключ для уведомлений — push на нём не настроен.";
      throw new Error(lastError);
    }
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    } catch (err) {
      lastError = `Браузер не смог оформить подписку: ${err.message || err.name}`;
      throw err;
    }
  }
  await api.subscribePush(subscription.toJSON());
  return subscription;
}

// iPhone/iPad only grant Web Push to a site installed on the Home Screen
// (iOS 16.4+); in a plain Safari tab PushManager simply doesn't exist.
export function iosNeedsHomeScreen() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches;
  return ios && !standalone;
}

export async function pushDiagnostics() {
  const plugin = nativePushPlugin();
  if (plugin) {
    const { receive } = await plugin.checkPermissions().catch(() => ({ receive: "нет" }));
    const { endpoints } = await api.listPushEndpoints().catch(() => ({ endpoints: [] }));
    return {
      защищённыйАдрес: true,
      поддержка: true,
      разрешение: receive,
      подпискаВБраузере: !!nativeToken,
      подпискаНаСервере: !!nativeToken && (endpoints ?? []).includes(`fcm:${nativeToken}`),
      ошибка: lastError,
    };
  }
  const out = {
    защищённыйАдрес: typeof window !== "undefined" && window.isSecureContext,
    поддержка: isPushSupported(),
    разрешение: typeof Notification !== "undefined" ? Notification.permission : "нет",
    подпискаВБраузере: false,
    подпискаНаСервере: false,
    ошибка: lastError,
  };
  if (!out.поддержка) return out;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    out.подпискаВБраузере = !!sub;
    if (sub) {
      const { endpoints } = await api.listPushEndpoints().catch(() => ({ endpoints: [] }));
      out.подпискаНаСервере = (endpoints ?? []).includes(sub.endpoint);
    }
  } catch (err) {
    out.ошибка = out.ошибка ?? err.message;
  }
  return out;
}

export async function resubscribePush() {
  lastError = null;
  if (nativePushPlugin()) {
    const ok = await registerNative({ prompt: true }).catch((err) => ((lastError = err.message), false));
    return ok ? { ok: true } : { ok: false, ошибка: lastError ?? "Не получилось" };
  }
  if (!isPushSupported()) return { ok: false, ошибка: "Браузер не умеет push-уведомления." };
  try {
    if (Notification.permission !== "granted") {
      const res = await Notification.requestPermission();
      if (res !== "granted") return { ok: false, ошибка: "Уведомления запрещены в браузере." };
    }
    const reg = await navigator.serviceWorker.getRegistration();
    const old = reg ? await reg.pushManager.getSubscription() : null;
    if (old) {
      await api.unsubscribePush(old.endpoint).catch(() => {});
      await old.unsubscribe().catch(() => {});
    }
    await subscribeNow();
    return { ok: true };
  } catch (err) {
    return { ok: false, ошибка: lastError ?? err.message ?? "Не получилось" };
  }
}

export async function ensurePushSubscribed() {
  // В приложении спрашиваем разрешение сразу при запуске — как любой мессенджер.
  if (nativePushPlugin()) return void (await registerNative({ prompt: true }));
  if (!isPushSupported()) return;
  if (Notification.permission !== "granted") return;
  await subscribeNow();
}

export async function requestPushPermission() {
  if (nativePushPlugin()) return registerNative({ prompt: true });
  if (!isPushSupported()) return false;
  const result = await Notification.requestPermission();
  if (result === "granted") await subscribeNow();
  return result === "granted";
}
