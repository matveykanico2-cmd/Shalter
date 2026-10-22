// Правки ленты чата в кэше: события сокета и своя отправка, до сверки с сервером.
import type { QueryClient } from "@tanstack/react-query";

import { messageQueries } from "../api/message-queries";
import { addPending, applyLive, confirmPending, dropPending, markRead, removeMessage } from "../lib/history";

import type { FeedMessage, History, Message } from "./types";

function update(client: QueryClient, chatId: string, fn: (prev: History) => History | null) {
  let applied = false;
  client.setQueryData(messageQueries.history(chatId).queryKey, (prev) => {
    if (!prev) return prev;
    const next = fn(prev);
    if (!next) return prev;
    applied = next !== prev;
    return next;
  });
  return applied;
}

export const historyCache = {
  /** Сообщение из события; false — в ленту не легло (нет ленты, старое) и нужна сверка. */
  applyLive: (client: QueryClient, chatId: string, m: Message, insert: boolean) => update(client, chatId, (h) => applyLive(h, m, insert)),
  remove: (client: QueryClient, chatId: string, id: string) => update(client, chatId, (h) => removeMessage(h, id)),
  markRead: (client: QueryClient, chatId: string, readerId: string, ids: readonly string[], readAt?: string) =>
    update(client, chatId, (h) => markRead(h, readerId, ids, readAt)),
  addPending: (client: QueryClient, chatId: string, m: FeedMessage) => update(client, chatId, (h) => addPending(h, m)),
  confirmPending: (client: QueryClient, chatId: string, localId: string, m: Message) => update(client, chatId, (h) => confirmPending(h, localId, m)),
  dropPending: (client: QueryClient, chatId: string, localId: string) => update(client, chatId, (h) => dropPending(h, localId)),
  find: (client: QueryClient, chatId: string, id: string) => client.getQueryData(messageQueries.history(chatId).queryKey)?.messages.find((m) => m.id === id),
};
