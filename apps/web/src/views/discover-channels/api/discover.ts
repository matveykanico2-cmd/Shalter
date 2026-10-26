import type { serveBody } from "@shalter/shared/schemas/ads";
import type { channelSearchBody } from "@shalter/shared/schemas/channels";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type FoundChannel = z.infer<typeof channelSearchBody>["channels"][number];
export type DiscoverAd = NonNullable<z.infer<typeof serveBody>["ad"]>;

export const subscribeChannel = (id: string) => http.post<unknown>(`/api/channels/${encodeURIComponent(id)}/subscribe`);
export const leaveChat = (id: string) => http.post<unknown>(`/api/chats/${encodeURIComponent(id)}/leave`);
export const clickAd = (id: string) => http.post<unknown>(`/api/ads/click/${encodeURIComponent(id)}`);

const baseKey = ["discover-channels"] as const;

export const discoverQueries = {
  baseKey,
  /** Каталог публичных каналов (GET /api/channels?q=…). */
  search: (q: string) =>
    queryOptions({
      queryKey: [...baseKey, "search", q],
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof channelSearchBody>>(`/api/channels?q=${encodeURIComponent(q)}`, signal)).channels,
      staleTime: 0,
    }),
  /** Объявление над каталогом (GET /api/ads/serve?placement=discover). */
  ad: () =>
    queryOptions({
      queryKey: [...baseKey, "ad"],
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof serveBody>>("/api/ads/serve?placement=discover", signal)).ad,
      staleTime: Infinity,
      retry: false,
    }),
};
