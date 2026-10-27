import { z } from "zod";
import { raw, requestBody, requestQuery, text } from "../../../../common/lib/zod.js";
import { MAX_GAME_CODE, parseScore } from "../../lib/game-rules.js";

// Поля приводятся так же, как в server/routes/games.js и gameApi.js. В схеме — проверки, с
// которых маршрут начинает (название и размер новой игры, название и userId в Game API);
// проверки после поиска игры, игрока или чата (404) остаются в сервисе.
// chatId остаётся как пришёл: любое непустое значение ищется как чат (scopeFor/scopeOf).

/** Эмодзи игры: первые два символа, пусто — 🎮. */
const gameEmoji = (v: string) => [...v.trim()].slice(0, 2).join("") || "🎮";

/** Поле Game API: нет или null — undefined (остаётся прежнее). */
const ifGiven = <T>(map: (v: unknown) => T) => raw().transform((v) => (v == null ? undefined : map(v)));

export const createGameSchema = requestBody({
  title: text()
    .transform((v) => v.trim().slice(0, 64))
    .refine((v) => !!v, { error: "Введите название игры" }),
  code: text().refine((v) => v.length <= MAX_GAME_CODE, { error: "Игра слишком большая (до 512 КБ)" }),
  emoji: raw().transform((v) => gameEmoji(String(v ?? "🎮"))),
  description: text().transform((v) => v.trim().slice(0, 200)),
  isPublic: raw().transform((v) => !!v),
});
export type CreateGameDto = z.infer<typeof createGameSchema>;

/** Правка из приложения: нет поля — undefined (остаётся прежнее), null — пустая строка. */
export const gameMetaSchema = requestBody({
  title: raw().transform((v) => (v === undefined ? undefined : String(v ?? "").trim().slice(0, 64))),
  emoji: raw().transform((v) => (v === undefined ? undefined : gameEmoji(String(v ?? "")))),
  description: raw().transform((v) => (v === undefined ? undefined : String(v ?? "").trim().slice(0, 200))),
  isPublic: raw().transform((v) => (v === undefined ? undefined : !!v)),
});
export type GameMetaDto = z.infer<typeof gameMetaSchema>;

export const scoreSchema = requestBody({ score: raw().transform(parseScore), chatId: raw() });
export type ScoreDto = z.infer<typeof scoreSchema>;

export const gamesQuerySchema = requestQuery({ q: text().transform((v) => v.trim()) });
export type GamesQuery = z.infer<typeof gamesQuerySchema>;

export const updateGameSchema = requestBody({
  /** Пустое переданное название — сразу 400, как первая проверка gameApi.js. */
  title: ifGiven((v) => String(v).trim().slice(0, 64)).refine((v) => v !== "", { error: "title is required" }),
  description: ifGiven((v) => String(v).trim().slice(0, 200)),
  emoji: ifGiven((v) => gameEmoji(String(v))),
  code: ifGiven(String),
  isPublic: ifGiven((v) => !!v),
});
export type UpdateGameDto = z.infer<typeof updateGameSchema>;

export const setScoreSchema = requestBody({
  /** Игрок; пусто — "" (404 в сервисе). */
  userId: raw().transform((v) => (v ? String(v) : "")),
  chatId: raw(),
  force: raw().transform((v) => !!v),
  score: raw().transform(parseScore),
});
export type SetScoreDto = z.infer<typeof setScoreSchema>;

export const deleteScoreSchema = requestBody({
  userId: raw()
    .refine((v) => !!v, { error: "userId is required" })
    .transform(String),
});
export type DeleteScoreDto = z.infer<typeof deleteScoreSchema>;
