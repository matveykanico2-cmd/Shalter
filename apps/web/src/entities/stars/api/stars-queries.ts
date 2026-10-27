import type { starsInfoBody } from "@shalter/shared/schemas/stars";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type StarsInfo = z.infer<typeof starsInfoBody>;

const baseKey = ["stars"] as const;

export const starsQueries = {
  baseKey,
  /** Баланс, наборы, цены действий и плата за входящие (GET /api/stars). */
  info: () =>
    queryOptions({
      queryKey: [...baseKey, "info"],
      queryFn: ({ signal }) => http.get<StarsInfo>("/api/stars", signal),
    }),
};
