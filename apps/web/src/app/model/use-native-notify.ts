import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

import { chatQueries, isChatMuted } from "@/entities/chat";
import { messagePreview } from "@/entities/message";
import { settingsQueries } from "@/entities/settings";

import { http, ws } from "@/shared/api";
import { NATIVE_NOTIFY_ALLOWED } from "@/shared/lib/push";

// Уведомления в приложениях, как public/js/lib/nativeNotify.js. Android без Firebase держит себя
// живым фоновой службой и показывает локальные уведомления сам; приложение для компьютера (Tauri)
// показывает системные через мост shalterDesktop.notify, пока окно свёрнуто или не в фокусе.

type Notification = { id: number; title: string; body: string; channelId?: string; smallIcon?: string; group?: string; actionTypeId?: string; extra?: Record<string, string> };
type LocalNotifications = {
  checkPermissions: () => Promise<{ display: string }>;
  requestPermissions: () => Promise<{ display: string }>;
  createChannel?: (o: object) => Promise<void>;
  registerActionTypes?: (o: object) => Promise<void>;
  addListener: (event: string, fn: (e: { actionId: string; inputValue?: string; notification?: { extra?: Record<string, string> } }) => void) => unknown;
  schedule: (o: { notifications: Notification[] }) => Promise<void>;
  cancel: (o: { notifications: { id: number }[] }) => Promise<void>;
};
type ForegroundService = {
  createNotificationChannel: (o: object) => Promise<void>;
  startForegroundService: (o: object) => Promise<void>;
};
type IncomingCallUi = { show: (o: object) => Promise<void>; hide: (o: object) => Promise<void> };
type NativeWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    Plugins?: { PushNotifications?: unknown; LocalNotifications?: LocalNotifications; ForegroundService?: ForegroundService; IncomingCall?: IncomingCallUi };
  };
  shalterDesktop?: { notify?: (title: string, body: string, url: string) => void; focus?: () => void };
};

const SERVICE_ID = 1;
// FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING: у dataSync на Android 15 лимит 6 часов в сутки.
const SERVICE_TYPE_REMOTE_MESSAGING = 512;
const SMALL_ICON = "ic_stat_shalter";

function androidPlugins() {
  const cap = (window as NativeWindow).Capacitor;
  if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== "android") return null;
  const p = cap.Plugins ?? {};
  // С Firebase уведомления шлёт сервер — иначе пришли бы дубли.
  if (p.PushNotifications || !p.LocalNotifications) return null;
  return { local: p.LocalNotifications, service: p.ForegroundService ?? null, callUi: p.IncomingCall ?? null };
}

/** Один чат — одно уведомление (новое заменяет старое): id — число из ключа. */
function numericId(key: string) {
  let h = 0;
  for (const ch of key) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return Math.abs(h % 2_000_000_000) + 10;
}

const chatOf = (client: QueryClient, chatId: string) => client.getQueryData(chatQueries.list().queryKey)?.find((c) => c.id === chatId);
const chatName = (client: QueryClient, chatId: string) => {
  const chat = chatOf(client, chatId);
  return chat?.otherUser?.name ?? chat?.title ?? "Shalter";
};

async function startAndroid(p: NonNullable<ReturnType<typeof androidPlugins>>, meId: string, client: QueryClient, open: (path: string) => void) {
  const { local, service, callUi } = p;
  let { display } = await local.checkPermissions().catch(() => ({ display: "denied" }));
  if (display !== "granted") ({ display } = await local.requestPermissions().catch(() => ({ display: "denied" })));
  // Запретили — не запускаем; разрешат позже в настройках — запустит событие NATIVE_NOTIFY_ALLOWED.
  if (display !== "granted") return null;

  await local.createChannel?.({ id: "messages", name: "Сообщения", importance: 4, visibility: 1, vibration: true }).catch(() => {});
  await local.createChannel?.({ id: "calls", name: "Звонки", importance: 5, visibility: 1, vibration: true }).catch(() => {});
  if (service) {
    await service
      .createNotificationChannel({ id: "service", name: "Работа в фоне", description: "Чтобы сообщения приходили, пока приложение закрыто", importance: 2 })
      .catch(() => {});
    await service
      .startForegroundService({
        id: SERVICE_ID,
        title: "Shalter работает",
        body: "Получаем новые сообщения",
        smallIcon: SMALL_ICON,
        notificationChannelId: "service",
        serviceType: SERVICE_TYPE_REMOTE_MESSAGING,
        silent: true,
      })
      .catch(() => {});
  }
  // Кнопки уведомления о сообщении: ответить (с полем ввода), прочитано, удалить.
  await local
    .registerActionTypes?.({
      types: [
        {
          id: "message",
          actions: [
            { id: "reply", title: "Ответить", input: true, inputButtonTitle: "Отправить", inputPlaceholder: "Сообщение…" },
            { id: "read", title: "Прочитано" },
            { id: "delete", title: "Удалить", destructive: true },
          ],
        },
      ],
    })
    .catch(() => {});

  local.addListener("localNotificationActionPerformed", ({ actionId, inputValue, notification }) => {
    const { url, chatId, messageId } = notification?.extra ?? {};
    if (actionId === "read" && chatId) return void http.post(`/api/chats/${chatId}/read`).catch(() => {});
    if (actionId === "delete" && chatId && messageId) return void http.delete(`/api/chats/${chatId}/messages/${messageId}`, { forEveryone: false }).catch(() => {});
    if (actionId === "reply" && chatId) {
      const text = (inputValue ?? "").trim();
      if (text) {
        const clientId = `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        http.post(`/api/chats/${chatId}/messages`, { text, replyToId: messageId || undefined, clientId }).then(
          () => void http.post(`/api/chats/${chatId}/read`).catch(() => {}),
          () => open(`/chat/${chatId}${messageId ? `?reply=${encodeURIComponent(messageId)}` : ""}`)
        );
        return;
      }
      return open(`/chat/${chatId}`);
    }
    if (url) open(url);
  });

  const offs = [
    ws.on("message:new", ({ chatId, message, silent }) => {
      if (silent || message.senderId === meId) return;
      if (document.visibilityState === "visible" && location.pathname === `/chat/${chatId}`) return;
      const chat = chatOf(client, chatId);
      if (chat && isChatMuted(chat)) return;
      const body = messagePreview(message) || "Новое сообщение";
      local
        .schedule({
          notifications: [
            {
              id: numericId(chatId),
              title: chatName(client, chatId),
              body: body.length > 200 ? `${body.slice(0, 200)}…` : body,
              channelId: "messages",
              smallIcon: SMALL_ICON,
              group: chatId,
              actionTypeId: "message",
              extra: { url: `/chat/${chatId}`, chatId, messageId: message.id },
            },
          ],
        })
        .catch(() => {});
    }),
    // Входящий звонок, пока приложение свёрнуто: экран звонка на весь экран (или уведомление).
    ws.on("call:incoming", ({ call }) => {
      if (document.visibilityState === "visible") return;
      const caller = call.otherUser?.name ?? "Входящий звонок";
      if (callUi) return void callUi.show({ callId: call.id, name: caller, video: call.kind === "video" }).catch(() => {});
      local
        .schedule({
          notifications: [
            {
              id: numericId(`call:${call.id}`),
              title: caller,
              body: call.kind === "video" ? "📹 Видеозвонок" : "📞 Звонок",
              channelId: "calls",
              smallIcon: SMALL_ICON,
              extra: { url: `/call/${call.id}` },
            },
          ],
        })
        .catch(() => {});
    }),
    ws.on("call:answered", ({ callId }) => clearCall(callId)),
    ws.on("call:updated", ({ call }) => clearCall(call.id)),
  ];
  function clearCall(callId: string) {
    local.cancel({ notifications: [{ id: numericId(`call:${callId}`) }] }).catch(() => {});
    callUi?.hide({ callId }).catch(() => {});
  }
  return () => offs.forEach((off) => off());
}

function startDesktop(bridge: NonNullable<NativeWindow["shalterDesktop"]>, meId: string, client: QueryClient) {
  const notify = bridge.notify;
  if (!notify) return () => {};
  const away = () => document.hidden || !document.hasFocus();
  const offs = [
    ws.on("message:new", ({ chatId, message, silent }) => {
      const settings = client.getQueryData(settingsQueries.current().queryKey);
      if (silent || message.senderId === meId || (settings?.notifications as { desktop?: boolean } | undefined)?.desktop === false) return;
      // В открытом окне хватает звука и счётчика.
      if (!away()) return;
      const chat = chatOf(client, chatId);
      if (chat && isChatMuted(chat)) return;
      notify(chatName(client, chatId), messagePreview(message) || "Новое сообщение", `${location.origin}/chat/${chatId}`);
    }),
    ws.on("call:incoming", ({ call }) => {
      if (!away()) return;
      notify(call.otherUser?.name ?? "Входящий звонок", call.kind === "video" ? "📹 Видеозвонок" : "📞 Звонок", `${location.origin}/call/${call.id}`);
      bridge.focus?.();
    }),
  ];
  return () => offs.forEach((off) => off());
}

export function useNativeNotify(meId: string) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    let stopped = false;
    const bridge = (window as NativeWindow).shalterDesktop;
    if (bridge?.notify) cleanups.push(startDesktop(bridge, meId, client));
    // Android: при запуске, а если уведомления тогда были запрещены — когда их разрешат
    // (экран «Уведомления», окно разрешений), как requestLocal в public/js/lib/push.js.
    let android: "idle" | "starting" | "started" = "idle";
    const startAndroidOnce = () => {
      const plugins = androidPlugins();
      if (!plugins || android !== "idle") return;
      android = "starting";
      void startAndroid(plugins, meId, client, (path) => void navigate(path)).then((off) => {
        android = off ? "started" : "idle";
        if (off) {
          if (stopped) off();
          else cleanups.push(off);
        }
      });
    };
    startAndroidOnce();
    window.addEventListener(NATIVE_NOTIFY_ALLOWED, startAndroidOnce);
    return () => {
      stopped = true;
      window.removeEventListener(NATIVE_NOTIFY_ALLOWED, startAndroidOnce);
      cleanups.forEach((off) => off());
    };
  }, [client, meId, navigate]);

  // Открыли чат — его уведомление больше не нужно.
  useEffect(() => {
    const android = androidPlugins();
    const id = /^\/chat\/([^/]+)/.exec(pathname)?.[1];
    if (android && id) android.local.cancel({ notifications: [{ id: numericId(id) }] }).catch(() => {});
  }, [pathname]);
}
