import type { channelStatsBody } from "@shalter/shared/schemas/channels";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type ChannelStats = z.infer<typeof channelStatsBody>;

export const channelStatsQueries = {
  /** Считается на сервере при каждом открытии, как в старом клиенте. */
  stats: (chatId: string) =>
    queryOptions({
      queryKey: ["channel-stats", chatId],
      staleTime: 0,
      queryFn: ({ signal }) => http.get<ChannelStats>(`/api/channels/${encodeURIComponent(chatId)}/stats`, signal),
    }),
};
