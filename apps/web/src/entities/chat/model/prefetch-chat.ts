// Наведение мыши или касание строки — чат и первая страница истории начинают грузиться
// заранее, как public/js/lib/chatPrefetch.js: к нажатию лента обычно уже в кэше.
import type { QueryClient } from "@tanstack/react-query";

import { messageQueries } from "@/entities/message/@x/chat";

import { chatQueries } from "../api/chat-queries";

import type { ChatSummary } from "./types";

/** Повторное наведение раньше — не запрос: прошлый ответ ещё свежий (FRESH_MS). */
const FRESH_MS = 20_000;

export function prefetchChat(client: QueryClient, chat: Pick<ChatSummary, "id" | "unreadCount">) {
  // Запрос истории отмечает сообщения прочитанными — чат с непрочитанными не трогаем, пока его не открыли.
  if (chat.unreadCount > 0) return;
  void client.prefetchQuery({ ...chatQueries.card(chat.id), staleTime: FRESH_MS });
  void client.prefetchQuery({ ...messageQueries.history(chat.id), staleTime: FRESH_MS });
}
