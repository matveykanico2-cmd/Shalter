import type { channelSearchBody } from "@shalter/shared/schemas/channels";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

const baseKey = ["feed"] as const;

export const feedQueries = {
  channels: () =>
    queryOptions({
      queryKey: [...baseKey, "channels"],
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof channelSearchBody>>("/api/channels?q=", signal)).channels,
      staleTime: 30_000,
    }),
};

export const subscribeChannel = (id: string) => http.post<unknown>(`/api/channels/${encodeURIComponent(id)}/subscribe`);
export const reactToMessage = (chatId: string, messageId: string, emoji: string) => http.post<unknown>(`/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/react`, { emoji });
