import { api } from "../api.js";

export function isPushSupported() {
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

export async function pushDiagnostics() {
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
  if (!isPushSupported()) return;
  if (Notification.permission !== "granted") return;
  await subscribeNow();
}

export async function requestPushPermission() {
  if (!isPushSupported()) return false;
  const result = await Notification.requestPermission();
  if (result === "granted") await subscribeNow();
  return result === "granted";
}
