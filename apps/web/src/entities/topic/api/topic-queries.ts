import { queryOptions } from "@tanstack/react-query";

import { http } from "@/shared/api";

import type { Topic } from "../model/types";

const baseKey = ["topics"] as const;

export const topicQueries = {
  baseKey,
  /** Темы группы (GET /api/chats/:id/topics). */
  list: (chatId: string) =>
    queryOptions({
      queryKey: [...baseKey, chatId],
      queryFn: ({ signal }) => http.get<{ enabled: boolean; topics: Topic[] }>(`/api/chats/${encodeURIComponent(chatId)}/topics`, signal),
    }),
};
