import type { searchBody } from "@shalter/shared/schemas/search";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type SearchResult = z.infer<typeof searchBody>;

export const searchQueries = {
  /** Поиск по чатам, людям, ботам, каналам и сообщениям (GET /api/search). */
  all: (q: string) =>
    queryOptions({
      queryKey: ["search", q],
      queryFn: ({ signal }) => http.get<SearchResult>(`/api/search?q=${encodeURIComponent(q)}`, signal),
      staleTime: 10_000,
    }),
};
