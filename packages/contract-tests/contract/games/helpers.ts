// Общие помощники тестов игр (/api/games и /api/game-api).
import { Api, type ApiResponse } from "../../support/client";
import { expectOk } from "../../support/expect";
import type { TestUser } from "../../support/seed";
import { gameBody, gameTokenBody } from "../../schemas/games";

export const NOT_FOUND = "Игра не найдена";
export const CHAT_NOT_FOUND = "Чат не найден";
export const BUILTIN_IDS = ["builtin-2048", "builtin-snake", "builtin-flappy"];

/** Своя игра через POST /api/games. */
export async function createGame(user: TestUser, extra: Record<string, unknown> = {}) {
  return expectOk(await user.api.post("/api/games", { title: "Игра", code: "<html><body>game</body></html>", ...extra }), gameBody).game;
}

/** Токен Game API для своей игры. */
export async function issueToken(user: TestUser, gameId: string): Promise<string> {
  return expectOk(await user.api.post(`/api/games/${gameId}/token`), gameTokenBody).token;
}

/** Запрос к Game API с заголовком Authorization: Bearer <token> (без cookie). */
export function gameApi(baseUrl: string, token: string | null) {
  const api = new Api(baseUrl);
  const headers = (): Record<string, string> => (token === null ? {} : { authorization: `Bearer ${token}` });
  return {
    get: (method: string, query?: Record<string, string | number | undefined>): Promise<ApiResponse> => api.get(`/api/game-api/${method}`, { headers: headers(), query }),
    post: (method: string, json: unknown = {}): Promise<ApiResponse> => api.post(`/api/game-api/${method}`, json, { headers: headers() }),
    raw: (method: string, path: string, headers: Record<string, string>): Promise<ApiResponse> => api.request(method, `/api/game-api/${path}`, { headers }),
  };
}
