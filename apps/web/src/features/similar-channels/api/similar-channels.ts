import type { similarChannelsBody } from "@shalter/shared/schemas/channels";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type SimilarChannel = z.infer<typeof similarChannelsBody>["channels"][number];

const channelPath = (id: string) => `/api/channels/${encodeURIComponent(id)}`;

export const similarChannelsQueries = {
  /** Панель перерисовывается часто — ответ живёт минуту, как similarCache в infoPanel.js. */
  similar: (chatId: string) =>
    queryOptions({
      queryKey: ["similar-channels", chatId],
      staleTime: 60_000,
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof similarChannelsBody>>(`${channelPath(chatId)}/similar`, signal)).channels,
    }),
};

export const subscribeChannel = (chatId: string) => http.post<unknown>(`${channelPath(chatId)}/subscribe`, {});
