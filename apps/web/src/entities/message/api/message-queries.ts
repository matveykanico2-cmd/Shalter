import { type QueryClient, queryOptions } from "@tanstack/react-query";

import { http } from "@/shared/api";

import { mergeLatest, prependOlder } from "../lib/history";
import type { History, HistoryPage, Message } from "../model/types";

const baseKey = ["messages"] as const;

/** Страница истории; как в public/js/views/chatView.js — 60 сообщений. */
export const PAGE_SIZE = 60;

/**
 * Тема ленты группы: undefined — весь чат, "general" — «Общее» (без темы), иначе id темы.
 * У каждой темы своя лента в кэше; все ленты чата — под общим префиксом chatHistories.
 */
export type TopicFilter = string | undefined;

const chatHistories = (chatId: string) => [...baseKey, "history", chatId] as const;
const historyKey = (chatId: string, topic?: TopicFilter) => [...chatHistories(chatId), topic ?? "all"] as const;

/** Сообщение в ленте этой темы? */
export const inTopic = (m: Pick<Message, "topicId">, topic: TopicFilter) =>
  !topic || topic === "all" || (topic === "general" ? !m.topicId : m.topicId === topic);

function historyPath(chatId: string, topic?: TopicFilter, before?: Pick<Message, "id" | "createdAt">) {
  const q = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (topic) q.set("topic", topic);
  if (before) {
    q.set("before", before.createdAt);
    q.set("beforeId", before.id);
  }
  return `/api/chats/${encodeURIComponent(chatId)}/messages?${q}`;
}

export const messageQueries = {
  baseKey,
  /** Все ленты чата (весь чат и темы) — для сверки после события или своего действия. */
  chatHistories,
  /**
   * Лента чата (GET /api/chats/:id/messages). Каждый запрос берёт последнюю страницу и
   * сливает её с тем, что уже в кэше: подгруженная история и неподтверждённые остаются.
   * Сервер на этом запросе отмечает чужие сообщения прочитанными.
   */
  history: (chatId: string, topic?: TopicFilter) =>
    queryOptions({
      queryKey: historyKey(chatId, topic),
      queryFn: async ({ signal, client }): Promise<History> => {
        const page = await http.get<HistoryPage>(historyPath(chatId, topic), signal);
        return mergeLatest(client.getQueryData<History>(historyKey(chatId, topic)), page);
      },
    }),
};

/** Ещё страница раньше самого раннего загруженного сообщения. false — дальше истории нет. */
export async function loadOlderHistory(client: QueryClient, chatId: string, topic?: TopicFilter) {
  const key = messageQueries.history(chatId, topic).queryKey;
  const current = client.getQueryData(key);
  const first = current?.messages.find((m) => !m.pending);
  if (!current?.hasMore || !first) return false;
  const page = await http.get<HistoryPage>(historyPath(chatId, topic, first));
  client.setQueryData(key, (prev) => (prev ? prependOlder(prev, page) : prev));
  return page.hasMore;
}
