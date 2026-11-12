// Скорость глазами пользователя — на сервер (POST /api/metrics/timing, сводка в его логе):
// «app-ready» — от начала загрузки страницы до списка чатов на экране, «chat-open» — от
// нажатия на чат до его сообщений. Уходит через sendBeacon: без него (jsdom, старые
// браузеры) замер просто не отправляется.
type TimingName = "app-ready" | "chat-open";

function send(name: TimingName, ms: number) {
  try {
    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;
    const body = new Blob([JSON.stringify({ name, ms: Math.round(ms) })], { type: "application/json" });
    navigator.sendBeacon("/api/metrics/timing", body);
  } catch {
    // замер не важнее работы приложения
  }
}

let appReadySent = false;

/** Список чатов впервые на экране — один раз за загрузку страницы. Вкладка в фоне — не замер. */
export function markAppReady() {
  if (appReadySent) return;
  appReadySent = true;
  if (document.visibilityState !== "visible") return;
  send("app-ready", performance.now());
}

let chatOpen: { chatId: string; at: number } | null = null;
/** Дольше чат не открывается: такой замер — не открытие (нажатие потерялось), а не выброс. */
const CHAT_OPEN_MAX_MS = 60_000;

/** Нажали на чат в списке. */
export function startChatOpen(chatId: string) {
  chatOpen = { chatId, at: performance.now() };
}

/** Сообщения чата на экране — если его открыли из списка. */
export function markChatOpen(chatId: string) {
  if (chatOpen?.chatId !== chatId) return;
  const ms = performance.now() - chatOpen.at;
  chatOpen = null;
  if (ms <= CHAT_OPEN_MAX_MS) send("chat-open", ms);
}
