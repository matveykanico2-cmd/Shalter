// Правки ленты чата в кэше: события сокета и своя отправка, до сверки с сервером.
import type { QueryClient } from "@tanstack/react-query";

import { inTopic, messageQueries } from "../api/message-queries";
import { addPending, applyLive, confirmPending, dropPending, markRead, patchMessage, removeMessage, restoreMessage } from "../lib/history";

import type { FeedMessage, History, Message } from "./types";

/**
 * Правка во всех лентах чата (весь чат и открытые темы). Новое сообщение (scope) — только
 * в ленты его темы. true — хоть одна лента изменилась.
 */
function update(client: QueryClient, chatId: string, fn: (prev: History) => History | null, scope?: Pick<Message, "topicId">) {
  let applied = false;
  for (const [key, prev] of client.getQueriesData<History>({ queryKey: messageQueries.chatHistories(chatId) })) {
    if (!prev || (scope && !inTopic(scope, key[3] as string))) continue;
    const next = fn(prev);
    if (!next || next === prev) continue;
    client.setQueryData(key, next);
    applied = true;
  }
  return applied;
}

export const historyCache = {
  /** Сообщение из события; false — в ленту не легло (нет ленты, старое) и нужна сверка. */
  applyLive: (client: QueryClient, chatId: string, m: Message, insert: boolean) => update(client, chatId, (h) => applyLive(h, m, insert), m),
  remove: (client: QueryClient, chatId: string, id: string) => update(client, chatId, (h) => removeMessage(h, id)),
  markRead: (client: QueryClient, chatId: string, readerId: string, ids: readonly string[], readAt?: string) =>
    update(client, chatId, (h) => markRead(h, readerId, ids, readAt)),
  addPending: (client: QueryClient, chatId: string, m: FeedMessage) => update(client, chatId, (h) => addPending(h, m), m),
  confirmPending: (client: QueryClient, chatId: string, localId: string, m: Message) => update(client, chatId, (h) => confirmPending(h, localId, m), m),
  dropPending: (client: QueryClient, chatId: string, localId: string) => update(client, chatId, (h) => dropPending(h, localId)),
  /** Своё действие над сообщением сразу; возвращает, каким оно было, — для отката. */
  patch(client: QueryClient, chatId: string, id: string, fn: (m: FeedMessage) => FeedMessage) {
    const before = historyCache.find(client, chatId, id);
    if (before) update(client, chatId, (h) => patchMessage(h, id, fn));
    return before;
  },
  /** Сообщение из ответа сервера — поверх своей правки. */
  replace: (client: QueryClient, chatId: string, m: Message) => update(client, chatId, (h) => patchMessage(h, m.id, (x) => ({ ...x, ...m }))),
  /** Откат своей правки или удаления. */
  restore: (client: QueryClient, chatId: string, m: FeedMessage) => update(client, chatId, (h) => restoreMessage(h, m), m),
  find: (client: QueryClient, chatId: string, id: string) => {
    for (const [, h] of client.getQueriesData<History>({ queryKey: messageQueries.chatHistories(chatId) })) {
      const found = h?.messages.find((m) => m.id === id);
      if (found) return found;
    }
    return undefined;
  },
};
