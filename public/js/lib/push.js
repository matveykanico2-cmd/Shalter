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
async function subscribeNow() {
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const { publicKey } = await api.getVapidPublicKey();
    if (!publicKey) return; // server-side push init failed — nothing to subscribe to
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  await api.subscribePush(subscription.toJSON());
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
