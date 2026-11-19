import type { sessionBody } from "@shalter/shared/schemas/auth";
import type { geoLanguageBody } from "@shalter/shared/schemas/geo";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type Session = z.infer<typeof sessionBody>;
export type SelfUser = NonNullable<Session["user"]> & {
  /** ID стикера приветствия для пустых чатов. */
  greetingStickerId?: string | null;
};
export type GuestLanguage = z.infer<typeof geoLanguageBody>;

const baseKey = ["session"] as const;
const OFFLINE_SESSION_KEY = "shalter:offline-session";

function cachedOfflineSession(): Session | null {
  try {
    const raw = localStorage.getItem(OFFLINE_SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Session;
    return value?.user?.id ? value : null;
  } catch {
    return null;
  }
}

function rememberSession(session: Session) {
  try {
    if (session.user) localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify({ user: session.user, accounts: session.accounts ?? [] }));
    else localStorage.removeItem(OFFLINE_SESSION_KEY);
  } catch {
    // Private browsing or a full storage quota must not prevent login.
  }
}

export const sessionQueries = {
  baseKey,
  /** Кто вошёл на этом устройстве (GET /api/auth/session): user null — никто. */
  current: () =>
    queryOptions({
      queryKey: [...baseKey, "current"],
      queryFn: async ({ signal }) => {
        try {
          const session = await http.get<Session>("/api/auth/session", signal);
          rememberSession(session);
          return session;
        } catch (error) {
          // API-ответы никогда не кэшируем. При настоящем отсутствии сети
          // разрешаем только уже вошедший read-only интерфейс из локального кэша;
          // серверные действия по-прежнему получат ошибку и не выдадут устаревшие данные.
          if (typeof navigator !== "undefined" && navigator.onLine === false) {
            const cached = cachedOfflineSession();
            if (cached) return cached;
          }
          throw error;
        }
      },
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
