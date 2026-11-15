// Наведение мыши или касание строки — чат и первая страница истории начинают грузиться
// заранее, как public/js/lib/chatPrefetch.js: к нажатию лента обычно уже в кэше.
import type { QueryClient } from "@tanstack/react-query";

import { messageQueries } from "@/entities/message/@x/chat";

import { chatQueries } from "../api/chat-queries";

import type { ChatSummary } from "./types";

/** Повторное наведение раньше — не запрос: прошлый ответ ещё свежий (FRESH_MS). */
const FRESH_MS = 20_000;

export function prefetchChat(client: QueryClient, chat: Pick<ChatSummary, "id" | "unreadCount">) {
  // Карточка не меняет состояние и нужна шапке, участникам, темам и профилю — грузим её
  // даже для непрочитанного чата. Только история отмечает сообщения прочитанными, поэтому
  // её до явного открытия непрочитанного чата не запрашиваем.
  void client.prefetchQuery({ ...chatQueries.card(chat.id), staleTime: FRESH_MS });
  if (chat.unreadCount === 0) void client.prefetchQuery({ ...messageQueries.history(chat.id), staleTime: FRESH_MS });
}
