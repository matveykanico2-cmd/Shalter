// Уведомления в Android-приложении без Firebase. Приложение держит себя живым
// фоновой службой (постоянное тихое уведомление «Shalter работает») — сокет с
// сервером не рвётся, и о новых сообщениях и звонках мы показываем локальные
// уведомления сами. Если в сборке есть Firebase (плагин PushNotifications),
// этот путь не нужен — уведомления шлёт сервер (lib/push.js), иначе пришли бы дубли.
import { getState } from "../state.js";
import { onWsMessage } from "./wsClient.js";
import { isChatMuted } from "./chatSort.js";
import { navigate } from "../router.js";

const SERVICE_ID = 1;
// ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING: служба мессенджера. У dataSync
// на Android 15 лимит 6 часов в сутки — для «всегда на связи» он не годится.
const SERVICE_TYPE_REMOTE_MESSAGING = 512;
const SMALL_ICON = "ic_stat_shalter";

function plugins() {
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== "android") return null;
  const p = cap.Plugins ?? {};
  if (p.PushNotifications || !p.LocalNotifications) return null;
  return { local: p.LocalNotifications, service: p.ForegroundService ?? null };
}

// Идентификатор уведомления — число; один чат — одно уведомление (новое заменяет старое).
function numericId(key) {
  let h = 0;
  for (const ch of String(key)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return Math.abs(h % 2_000_000_000) + 10;
}

function messagePreview(m) {
  const text = (m.text ?? "").trim();
  if (text) return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  const kind = m.attachments?.[0]?.kind;
  if (kind === "image") return "📷 Фото";
  if (kind === "video") return "🎬 Видео";
  if (kind === "voice") return "🎤 Голосовое сообщение";
  if (kind === "video-note") return "📹 Видеосообщение";
  if (m.sticker) return "Стикер";
  if (m.gift) return "🎁 Подарок";
  return kind ? "📎 Файл" : "Новое сообщение";
}

function isLookingAt(chatId) {
  return document.visibilityState === "visible" && location.pathname === `/chat/${chatId}`;
}

let started = false;
export async function startNativeNotifications() {
  const p = plugins();
  if (!p || started) return;
  started = true;
  const { local, service } = p;

  let { display } = await local.checkPermissions().catch(() => ({ display: "denied" }));
  if (display !== "granted") ({ display } = await local.requestPermissions().catch(() => ({ display: "denied" })));
  if (display !== "granted") return;

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
      .catch((err) => console.warn("foreground service:", err?.message ?? err));
  }

  // Нажали на уведомление — открываем тот чат.
  local.addListener("localNotificationActionPerformed", ({ notification }) => {
    const url = notification?.extra?.url;
    if (url) navigate(url);
  });

  onWsMessage("message:new", (msg) => {
    const m = msg.message;
    const { user: me, chats } = getState();
    if (!m || msg.silent || m.senderId === me?.id || isLookingAt(msg.chatId)) return;
    const chat = (chats ?? []).find((c) => c.id === msg.chatId);
    if (chat && isChatMuted(chat)) return;
    const title = chat?.otherUser?.name ?? chat?.title ?? "Shalter";
    local
      .schedule({
        notifications: [
          {
            id: numericId(msg.chatId),
            title,
            body: messagePreview(m),
            channelId: "messages",
            smallIcon: SMALL_ICON,
            group: msg.chatId,
            extra: { url: `/chat/${msg.chatId}` },
          },
        ],
      })
      .catch(() => {});
  });

  // Входящий звонок, пока приложение свёрнуто: в самом приложении есть свой баннер.
  onWsMessage("call:incoming", (msg) => {
    const call = msg.call;
    if (!call || document.visibilityState === "visible") return;
    const caller = call.otherUser?.name ?? "Входящий звонок";
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
  });
  const clearCall = (msg) => {
    if (msg.call?.id && msg.call.status !== "ringing") local.cancel({ notifications: [{ id: numericId(`call:${msg.call.id}`) }] }).catch(() => {});
  };
  onWsMessage("call:updated", clearCall);

  // Открыли чат — его уведомление больше не нужно.
  window.addEventListener("app:navigate", () => {
    const id = location.pathname.match(/^\/chat\/([^/]+)/)?.[1];
    if (id) local.cancel({ notifications: [{ id: numericId(id) }] }).catch(() => {});
  });
}
