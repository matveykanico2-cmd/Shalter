import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { ChatSummary } from "@/entities/chat";
import { topicQueries } from "@/entities/topic";

import { useWsEvent } from "@/shared/api";

/** Темы группы с включёнными темами; topics:updated — перезапрос (как loadTopics в chatView.js). */
export function useTopics(chat: ChatSummary) {
  const client = useQueryClient();
  const enabled = chat.type === "group" && !!chat.topicsEnabled;
  useWsEvent("topics:updated", (e) => {
    if (e.chatId === chat.id) void client.invalidateQueries({ queryKey: topicQueries.list(chat.id).queryKey });
  });
  const query = useQuery({ ...topicQueries.list(chat.id), enabled });
  return enabled ? (query.data?.topics ?? null) : null;
}
