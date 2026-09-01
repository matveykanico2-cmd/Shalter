import { api } from "../api.js";

export function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
}

// VAPID public key comes as base64url from the server; PushManager wants it
// as a raw Uint8Array.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Registers the service worker (idempotent — a second call just returns the
// existing registration) and makes sure there's a live push subscription
// registered with the server.
// Последняя причина, по которой подписка не получилась, — чтобы настройки
// могли сказать это словами вместо «уведомления разрешены» при неработающих
// уведомлениях. Раньше все отказы здесь молча проглатывались вызывающей
// стороной (`.catch(() => {})` в app.js), и понять, почему не приходят пуши,
// было нельзя ни пользователю, ни по логам.
let lastError = null;

export function getPushError() {
  return lastError;
}

async function subscribeNow() {
  lastError = null;
  // Push работает только в защищённом контексте. На http:// (по адресу вида
  // http://192.168.1.10:3000) браузер не отдаёт ни serviceWorker, ни
  // PushManager — и это самая частая причина «не приходят совсем»: приложение
  // открыто не по https.
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
      // Отказ службы доставки: чаще всего запрещены уведомления на уровне
      // системы или браузер не может достучаться до своего push-сервиса.
      lastError = `Браузер не смог оформить подписку: ${err.message || err.name}`;
      throw err;
    }
  }
  await api.subscribePush(subscription.toJSON());
  return subscription;
}

// Что на самом деле происходит с уведомлениями на этом устройстве — для экрана
// настроек. Все три ответа разные, и раньше показывался только первый: человек
// видел «разрешены» при полностью нерабочих уведомлениях.
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

// Принудительно пересобрать подписку — кнопка «Проверить уведомления».
// Нужна ровно для случая «разрешение есть, а пуши не идут»: старая подписка
// могла протухнуть (браузер их отзывает), а сама по себе она не обновится.
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

// Called unconditionally on every app boot to re-subscribe silently if
// permission was already granted in an earlier session. Relies on reading
// the ambient Notification.permission — unlike requestPushPermission below,
// there's no fresher signal available here.
export async function ensurePushSubscribed() {
  if (!isPushSupported()) return;
  if (Notification.permission !== "granted") return;
  await subscribeNow();
}

// Explicit permission request (Settings → "Разрешить уведомления", or the
// one-time auto-prompt in incomingCallWatcher.js): request permission, then
// subscribe using the *fresh* result directly, rather than immediately
// re-reading Notification.permission — some environments don't reflect a
// just-granted permission in that property synchronously, so trust the
// value requestPermission() itself just resolved with.
export async function requestPushPermission() {
  if (!isPushSupported()) return false;
  const result = await Notification.requestPermission();
  if (result === "granted") await subscribeNow();
  return result === "granted";
}
