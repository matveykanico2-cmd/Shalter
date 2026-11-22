// Наведение мыши или касание строки — чат и первая страница истории начинают грузиться
// заранее, как public/js/lib/chatPrefetch.js: к нажатию лента обычно уже в кэше.
import type { QueryClient } from "@tanstack/react-query";

import { messageQueries } from "@/entities/message/@x/chat";

import { chatQueries } from "../api/chat-queries";

import type { ChatSummary } from "./types";

/** Повторное наведение раньше — не запрос: прошлый ответ ещё свежий (FRESH_MS). */
const FRESH_MS = 20_000;

type PrefetchOptions = { history?: boolean; waitForHistory?: boolean };

export async function prefetchChat(client: QueryClient, chat: Pick<ChatSummary, "id" | "unreadCount">, options?: PrefetchOptions) {
  // Карточка не меняет состояние и нужна шапке, участникам, темам и профилю — грузим её
  // даже для непрочитанного чата. Только история отмечает сообщения прочитанными, поэтому
  // её до явного открытия непрочитанного чата не запрашиваем.
  const card = client.prefetchQuery({ ...chatQueries.card(chat.id), staleTime: FRESH_MS });
  // На наведении не трогаем непрочитанные сообщения: сервер считает их прочитанными.
  // При явном открытии waitForHistory=true — ждём историю до смены маршрута, поэтому
  // лента не успевает показаться пустой и не «прыгает» после входа в чат.
  const shouldPrefetchHistory = options?.history !== false && (chat.unreadCount === 0 || options?.waitForHistory === true);
  const history = shouldPrefetchHistory ? client.prefetchQuery({ ...messageQueries.history(chat.id), staleTime: FRESH_MS }) : Promise.resolve();
  await Promise.all([card, history]);
}
