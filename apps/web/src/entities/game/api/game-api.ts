import type { bestBody, gameAnyBody, gameBody, gameMetaBody, gamesBody, gameTokenBody, scoreBody, scoresBody } from "@shalter/shared/schemas/games";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type GameListItem = z.infer<typeof gamesBody>["games"][number];
export type GameFull = z.infer<typeof gameAnyBody>["game"];
export type OwnGame = z.infer<typeof gameMetaBody>["game"];
export type GameScore = z.infer<typeof scoresBody>["scores"][number];
/** Что нужно, чтобы открыть игру: из каталога, из карточки в чате (gameId из meta) или своя. */
export type GameRef = { id: string; title?: string; emoji?: string; description?: string; code?: string };

const baseKey = ["games"] as const;
const chatQuery = (chatId: string | null) => (chatId ? `?chatId=${encodeURIComponent(chatId)}` : "");

export const gameQueries = {
  baseKey,
  /** Каталог с поиском (GET /api/games?q=): встроенные, игры сообщества и свои. */
  list: (q = "") =>
    queryOptions({
      queryKey: [...baseKey, "list", q],
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof gamesBody>>(`/api/games${q ? `?q=${encodeURIComponent(q)}` : ""}`, signal)).games,
    }),
  /** Свои игры (GET /api/games/mine). */
  mine: () =>
    queryOptions({
      queryKey: [...baseKey, "mine"],
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof gamesBody>>("/api/games/mine", signal)).games,
    }),
  /** Рекорды игры — в чате или общие. */
  scores: (gameId: string, chatId: string | null) =>
    queryOptions({
      queryKey: [...baseKey, "scores", gameId, chatId ?? ""],
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof scoresBody>>(`/api/games/${encodeURIComponent(gameId)}/scores${chatQuery(chatId)}`, signal)).scores,
      staleTime: 0,
    }),
};

type MetaPayload = { title: string; emoji: string; description: string; isPublic: boolean };

export const gameApi = {
  get: (id: string) => http.get<z.infer<typeof gameAnyBody>>(`/api/games/${encodeURIComponent(id)}`),
  play: (id: string) => http.post<unknown>(`/api/games/${encodeURIComponent(id)}/play`),
  submitScore: (id: string, score: number, chatId: string | null) => http.post<z.infer<typeof scoreBody>>(`/api/games/${encodeURIComponent(id)}/score`, { score, chatId: chatId || undefined }),
  best: (id: string, chatId: string | null) => http.get<z.infer<typeof bestBody>>(`/api/games/${encodeURIComponent(id)}/best${chatQuery(chatId)}`),
  create: (payload: MetaPayload & { code: string }) => http.post<z.infer<typeof gameBody>>("/api/games", payload),
  updateMeta: (id: string, payload: MetaPayload) => http.patch<z.infer<typeof gameMetaBody>>(`/api/games/${encodeURIComponent(id)}/meta`, payload),
  createToken: (id: string) => http.post<z.infer<typeof gameTokenBody>>(`/api/games/${encodeURIComponent(id)}/token`),
};
