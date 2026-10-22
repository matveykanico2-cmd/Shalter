import type { sessionBody } from "@shalter/shared/schemas/auth";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type Session = z.infer<typeof sessionBody>;
export type SelfUser = NonNullable<Session["user"]>;

const baseKey = ["session"] as const;

export const sessionQueries = {
  baseKey,
  /** Кто вошёл на этом устройстве (GET /api/auth/session): user null — никто. */
  current: () =>
    queryOptions({
      queryKey: [...baseKey, "current"],
      queryFn: ({ signal }) => http.get<Session>("/api/auth/session", signal),
      staleTime: Infinity,
    }),
};
