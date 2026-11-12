// Свои ещё не отправленные сообщения, которые живут вне кэша ленты (очередь исходящих
// features/send-message): лента, загруженная позже (чат открыли после перезапуска
// приложения), показывает их пузырями «отправляется» внизу. Источник подключает фича.
import type { FeedMessage, History } from "./types";

type PendingSource = (chatId: string) => readonly FeedMessage[];

let source: PendingSource = () => [];

/** Подключить источник (один на приложение). Возвращает отключение. */
export function setPendingSource(next: PendingSource) {
  source = next;
  return () => {
    if (source === next) source = () => [];
  };
}

/** Лента с недостающими своими неотправленными (только те, что подходят под фильтр темы). */
export function withPending(history: History, chatId: string, fits: (m: FeedMessage) => boolean): History {
  const have = new Set(history.messages.map((m) => m.id));
  const missing = source(chatId).filter((m) => !have.has(m.id) && fits(m));
  return missing.length ? { ...history, messages: [...history.messages, ...missing.map((m) => ({ ...m, pending: true as const }))] } : history;
}
