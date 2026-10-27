import type { endpointsBody, vapidKeyBody } from "@shalter/shared/schemas/push";
import type { z } from "zod";

import { http } from "../api";

// Push-уведомления — порт public/js/lib/push.js: веб-push через service worker; в
// Android-приложении с Firebase — токен устройства (плагин PushNotifications), на него сервер
// шлёт через FCM (server/lib/fcm.js); без Firebase и на десктопе уведомления показывает само
// приложение (use-native-notify), здесь — только проверка их разрешения.

type PermissionState = "granted" | "denied" | "default" | string;

type CapPlugin = {
  checkPermissions: () => Promise<Record<string, string>>;
  requestPermissions: () => Promise<Record<string, string>>;
};
type NativePushPlugin = CapPlugin & {
  register: () => Promise<void>;
  createChannel?: (channel: { id: string; name: string; importance: number; visibility: number; vibration: boolean }) => Promise<void>;
  addListener: (event: string, cb: (data: never) => void) => Promise<unknown>;
};
type PushWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { PushNotifications?: NativePushPlugin; LocalNotifications?: CapPlugin; IncomingCall?: unknown } };
  shalterDesktop?: { notify?: unknown };
  __shalterOpen?: (path: string) => void;
};

const win = () => window as PushWindow;
const nativePlugin = (): NativePushPlugin | null => (win().Capacitor?.isNativePlatform?.() ? (win().Capacitor?.Plugins?.PushNotifications ?? null) : null);
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

let nativeReady: Promise<void> | null = null;
let nativeToken: string | null = null;

/** Каналы, токен и нажатие на уведомление — один раз за запуск (setupNativePush в push.js). */
function setupNativePush(plugin: NativePushPlugin) {
  nativeReady ??= (async () => {
    // Свои каналы: звонки громче и поверх всего, сообщения — обычные со звуком.
    await plugin.createChannel?.({ id: "messages", name: "Сообщения", importance: 4, visibility: 1, vibration: true }).catch(() => {});
    await plugin.createChannel?.({ id: "calls", name: "Звонки", importance: 5, visibility: 1, vibration: true }).catch(() => {});
    await plugin.addListener("registration", ({ value }: { value: string }) => {
      nativeToken = value;
      // callUi: сборка умеет сама показывать экран звонка — сервер шлёт звонок data-сообщением.
      void http.post("/api/push/subscribe-native", { token: value, callUi: !!win().Capacitor?.Plugins?.IncomingCall }).catch(() => {});
    });
    await plugin.addListener("registrationError", (err: { error?: string }) => {
      lastError = `Не удалось получить токен уведомлений: ${err?.error || "ошибка"}`;
    });
    // Нажали на уведомление — открываем тот чат или звонок, о котором оно.
    await plugin.addListener("pushNotificationActionPerformed", ({ notification }: { notification?: { data?: { url?: string } } }) => {
      const url = notification?.data?.url;
      if (!url) return;
      try {
        const u = new URL(url, location.origin);
        if (u.origin !== location.origin) return;
        const path = u.pathname + u.search;
        if (win().__shalterOpen) win().__shalterOpen!(path);
        else location.href = path;
      } catch {
        // Битый адрес в уведомлении — просто остаёмся на месте.
      }
    });
  })();
  return nativeReady;
}

async function registerNative(prompt: boolean) {
  const plugin = nativePlugin();
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
    const { endpoints } = await listEndpoints();
    return {
      защищённыйАдрес: true,
      поддержка: true,
      разрешение: receive ?? "нет",
      подпискаВБраузере: !!nativeToken,
      подпискаНаСервере: !!nativeToken && endpoints.includes(`fcm:${nativeToken}`),
      ошибка: lastError,
    };
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
  const local = localPlugin();
  if (local) return (await requestPlugin(local, "display")) ? { ok: true } : { ok: false, ошибка: lastError ?? "Не получилось" };
  if (nativePlugin()) {
    const ok = await registerNative(true).catch((err: Error) => ((lastError = err.message), false));
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
  if (isDesktopShell() || localPlugin()) return;
  // В приложении спрашиваем разрешение сразу при запуске — как любой мессенджер.
  if (nativePlugin()) return void (await registerNative(true));
  if (!isPushSupported() || Notification.permission !== "granted") return;
  await subscribeNow();
}

/** «Включить уведомления»: спросить разрешение и подписаться. */
export async function requestPushPermission() {
  if (isDesktopShell()) return true;
  const local = localPlugin();
  if (local) return requestPlugin(local, "display");
  if (nativePlugin()) return registerNative(true);
  if (!isPushSupported()) return false;
  const result = await Notification.requestPermission();
  if (result === "granted") await subscribeNow();
  return result === "granted";
}
