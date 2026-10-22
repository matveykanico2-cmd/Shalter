import { type QueryClient, queryOptions } from "@tanstack/react-query";

import { http } from "@/shared/api";

import { mergeLatest, prependOlder } from "../lib/history";
import type { History, HistoryPage, Message } from "../model/types";

const baseKey = ["messages"] as const;

/** Страница истории; как в public/js/views/chatView.js — 60 сообщений. */
export const PAGE_SIZE = 60;

const historyKey = (chatId: string) => [...baseKey, "history", chatId] as const;

function historyPath(chatId: string, before?: Pick<Message, "id" | "createdAt">) {
  const q = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (before) {
    q.set("before", before.createdAt);
    q.set("beforeId", before.id);
  }
  return `/api/chats/${encodeURIComponent(chatId)}/messages?${q}`;
}

export const messageQueries = {
  baseKey,
  /**
   * Лента чата (GET /api/chats/:id/messages). Каждый запрос берёт последнюю страницу и
   * сливает её с тем, что уже в кэше: подгруженная история и неподтверждённые остаются.
   * Сервер на этом запросе отмечает чужие сообщения прочитанными.
   */
  history: (chatId: string) =>
    queryOptions({
      queryKey: historyKey(chatId),
      queryFn: async ({ signal, client }): Promise<History> => {
        const page = await http.get<HistoryPage>(historyPath(chatId), signal);
        return mergeLatest(client.getQueryData<History>(historyKey(chatId)), page);
      },
    }),
};

/** Ещё страница раньше самого раннего загруженного сообщения. false — дальше истории нет. */
export async function loadOlderHistory(client: QueryClient, chatId: string) {
  const key = messageQueries.history(chatId).queryKey;
  const current = client.getQueryData(key);
  const first = current?.messages.find((m) => !m.pending);
  if (!current?.hasMore || !first) return false;
  const page = await http.get<HistoryPage>(historyPath(chatId, first));
  client.setQueryData(key, (prev) => (prev ? prependOlder(prev, page) : prev));
  return page.hasMore;
}
