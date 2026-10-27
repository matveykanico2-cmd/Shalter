import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";

import { useWsEvent } from "@/shared/api";

import { callApi, callQueries } from "../api/call-api";

const roomQuery = (chatId: string) =>
  queryOptions({
    queryKey: [...callQueries.baseKey, "room", chatId],
    queryFn: async () => (await callApi.room(chatId)).call,
  });

/** Идёт ли голосовой чат группы (GET /api/calls/room/:chatId, живёт на voicechat:updated). */
export function useVoiceRoom(chatId: string, enabled: boolean) {
  const client = useQueryClient();
  useWsEvent("voicechat:updated", (e) => {
    if (enabled && e.chatId === chatId) client.setQueryData(roomQuery(chatId).queryKey, e.call);
  });
  return useQuery({ ...roomQuery(chatId), enabled }).data ?? null;
}
