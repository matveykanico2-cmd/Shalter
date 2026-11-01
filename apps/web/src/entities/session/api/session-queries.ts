import type { sessionBody } from "@shalter/shared/schemas/auth";
import type { geoLanguageBody } from "@shalter/shared/schemas/geo";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type Session = z.infer<typeof sessionBody>;
export type SelfUser = NonNullable<Session["user"]>;
export type GuestLanguage = z.infer<typeof geoLanguageBody>;

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
  /** Язык интерфейса до входа — по стране IP, языку браузера или русский (GET /api/geo/language). */
  guestLanguage: () =>
    queryOptions({
      queryKey: [...baseKey, "guest-language"],
      queryFn: ({ signal }) => http.get<GuestLanguage>("/api/geo/language", signal),
      staleTime: Infinity,
      retry: false,
    }),
};
