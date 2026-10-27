import type { serveBody } from "@shalter/shared/schemas/ads";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type ServedAd = NonNullable<z.infer<typeof serveBody>["ad"]>;

export const chatAdsQueries = {
  /** Объявление для ленты канала (GET /api/ads/serve?placement=chat). */
  chat: (chatId: string) =>
    queryOptions({
      queryKey: ["ads", "chat", chatId],
      queryFn: ({ signal }) => http.get<z.infer<typeof serveBody>>("/api/ads/serve?placement=chat", signal),
      staleTime: Infinity,
    }),
};

export const clickAd = (adId: string) => http.post<unknown>(`/api/ads/click/${encodeURIComponent(adId)}`, {});
