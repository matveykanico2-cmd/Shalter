import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useWsEvent } from "@/shared/api";

import { liveQueries } from "../api/live-api";

/** Эфир в группе или канале (GET /api/live/chat/:id); перечитывается на live:started и live:ended. */
export function useChatLive(chat: { id: string; type: string }) {
  const client = useQueryClient();
  const enabled = chat.type !== "dm";
  const refresh = (e: { chatId: string }) => {
    if (enabled && e.chatId === chat.id) void client.invalidateQueries({ queryKey: liveQueries.forChat(chat.id).queryKey });
  };
  useWsEvent("live:started", refresh);
  useWsEvent("live:ended", refresh);
  return useQuery({ ...liveQueries.forChat(chat.id), enabled }).data ?? null;
}
