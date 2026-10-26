import type { endpointsBody, vapidKeyBody } from "@shalter/shared/schemas/push";
import type { z } from "zod";

import { http } from "../api";

// Push-уведомления — порт public/js/lib/push.js: веб-push через service worker, а в
// установленных приложениях уведомления показывает само приложение. Нативную подписку
// Android (FCM) и локальные уведомления включает оболочка приложения, а не этот клиент:
// здесь — только проверка их разрешения для экрана «Уведомления».

type PermissionState = "granted" | "denied" | "default" | string;

type CapPlugin = {
  checkPermissions: () => Promise<Record<string, string>>;
  requestPermissions: () => Promise<Record<string, string>>;
};
type PushWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { PushNotifications?: CapPlugin; LocalNotifications?: CapPlugin } };
  shalterDesktop?: { notify?: unknown };
};

const win = () => window as PushWindow;
const nativePlugin = (): CapPlugin | null => (win().Capacitor?.isNativePlatform?.() ? (win().Capacitor?.Plugins?.PushNotifications ?? null) : null);
const localPlugin = (): CapPlugin | null => {
  const cap = win().Capacitor;
  if (!cap?.isNativePlatform?.() || nativePlugin()) return null;
  return cap.Plugins?.LocalNotifications ?? null;
};
// Десктоп (Tauri) показывает уведомления сам — веб-push там не нужен.
const isDesktopShell = () => !!win().shalterDesktop?.notify;

export function isPushSupported() {
  if (nativePlugin() || localPlugin() || isDesktopShell()) return true;
  return "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
}

let lastError: string | null = null;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const raw = atob((base64String + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const listEndpoints = () => http.get<z.infer<typeof endpointsBody>>("/api/push/endpoints").catch(() => ({ endpoints: [] as string[] }));

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
    const { publicKey } = await http.get<z.infer<typeof vapidKeyBody>>("/api/push/vapid-public-key").catch(() => ({ publicKey: "" }));
    if (!publicKey) {
      lastError = "Сервер не выдал ключ для уведомлений — push на нём не настроен.";
      throw new Error(lastError);
    }
    try {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    } catch (err) {
      const e = err as Error;
      lastError = `Браузер не смог оформить подписку: ${e.message || e.name}`;
      throw err;
    }
  }
  await http.post("/api/push/subscribe", { subscription: subscription.toJSON() });
  return subscription;
}

/** iPhone/iPad дают веб-push только сайту, добавленному на экран «Домой» (iOS 16.4+). */
export function iosNeedsHomeScreen() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || !!window.matchMedia?.("(display-mode: standalone)").matches;
  return ios && !standalone;
}

export type PushDiagnostics = {
  защищённыйАдрес: boolean;
  поддержка: boolean;
  разрешение: PermissionState;
  подпискаВБраузере: boolean;
  подпискаНаСервере: boolean;
  ошибка: string | null;
};

/** Цепочка проверок для экрана «Уведомления»: https → поддержка → разрешение → подписка → сервер. */
export async function pushDiagnostics(): Promise<PushDiagnostics> {
  const local = localPlugin();
  if (local) {
    const { display } = await local.checkPermissions().catch(() => ({ display: "denied" }));
    const granted = display === "granted";
    // prompt/prompt-with-rationale — «ещё не спрашивали», как Notification.permission "default".
    return { защищённыйАдрес: true, поддержка: true, разрешение: granted ? "granted" : display === "denied" ? "denied" : "default", подпискаВБраузере: granted, подпискаНаСервере: granted, ошибка: lastError };
  }
  if (isDesktopShell()) return { защищённыйАдрес: true, поддержка: true, разрешение: "granted", подпискаВБраузере: true, подпискаНаСервере: true, ошибка: null };
  const native = nativePlugin();
  if (native) {
    const { receive } = await native.checkPermissions().catch(() => ({ receive: "нет" }));
    return { защищённыйАдрес: true, поддержка: true, разрешение: receive ?? "нет", подпискаВБраузере: receive === "granted", подпискаНаСервере: receive === "granted", ошибка: lastError };
  }
  const out: PushDiagnostics = {
    защищённыйАдрес: window.isSecureContext,
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
    if (sub) out.подпискаНаСервере = (await listEndpoints()).endpoints.includes(sub.endpoint);
  } catch (err) {
    out.ошибка = out.ошибка ?? (err as Error).message;
  }
  return out;
}

async function requestPlugin(plugin: CapPlugin, field: "display" | "receive") {
  let state = (await plugin.checkPermissions().catch(() => ({ [field]: "denied" })))[field];
  if (state !== "granted") state = (await plugin.requestPermissions().catch(() => ({ [field]: "denied" })))[field];
  if (state === "granted") return true;
  lastError = "Уведомления запрещены в настройках Android для Shalter.";
  return false;
}

/** «Переподключить уведомления»: снять старую подписку и оформить заново. */
export async function resubscribePush(): Promise<{ ok: true } | { ok: false; ошибка: string }> {
  lastError = null;
  if (isDesktopShell()) return { ok: true };
  const plugin = localPlugin() ?? nativePlugin();
  if (plugin) return (await requestPlugin(plugin, localPlugin() ? "display" : "receive")) ? { ok: true } : { ok: false, ошибка: lastError ?? "Не получилось" };
  if (!isPushSupported()) return { ok: false, ошибка: "Браузер не умеет push-уведомления." };
  try {
    if (Notification.permission !== "granted") {
      const res = await Notification.requestPermission();
      if (res !== "granted") return { ok: false, ошибка: "Уведомления запрещены в браузере." };
    }
    const reg = await navigator.serviceWorker.getRegistration();
    const old = reg ? await reg.pushManager.getSubscription() : null;
    if (old) {
      await http.post("/api/push/unsubscribe", { endpoint: old.endpoint }).catch(() => {});
      await old.unsubscribe().catch(() => {});
    }
    await subscribeNow();
    return { ok: true };
  } catch (err) {
    return { ok: false, ошибка: lastError ?? (err as Error).message ?? "Не получилось" };
  }
}

/** Уже разрешено — подписать это устройство (при входе в приложение). */
export async function ensurePushSubscribed() {
  if (isDesktopShell() || localPlugin() || nativePlugin()) return;
  if (!isPushSupported() || Notification.permission !== "granted") return;
  await subscribeNow();
}

/** «Включить уведомления»: спросить разрешение и подписаться. */
export async function requestPushPermission() {
  if (isDesktopShell()) return true;
  const plugin = localPlugin() ?? nativePlugin();
  if (plugin) return requestPlugin(plugin, localPlugin() ? "display" : "receive");
  if (!isPushSupported()) return false;
  const result = await Notification.requestPermission();
  if (result === "granted") await subscribeNow();
  return result === "granted";
}
