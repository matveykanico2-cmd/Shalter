import { z } from "zod";
import { raw, requestBody, requestQuery, text } from "../../../../common/lib/zod.js";

// Поля как пришли: проверки и тексты ошибок — в сервисе, как в server/routes/games.js и gameApi.js.
export const createGameSchema = requestBody({
  title: text(),
  code: text(),
  emoji: z.unknown().optional().transform((v) => String(v ?? "🎮")),
  description: text(),
  isPublic: raw(),
});
export type CreateGameDto = z.infer<typeof createGameSchema>;

export const gameMetaSchema = requestBody({ title: raw(), emoji: raw(), description: raw(), isPublic: raw() });
export type GameMetaDto = z.infer<typeof gameMetaSchema>;

export const scoreSchema = requestBody({ score: raw(), chatId: raw() });
export type ScoreDto = z.infer<typeof scoreSchema>;

export const gamesQuerySchema = requestQuery({ q: raw() });

export const updateGameSchema = requestBody({ title: raw(), description: raw(), emoji: raw(), code: raw(), isPublic: raw() });
export type UpdateGameDto = z.infer<typeof updateGameSchema>;

export const setScoreSchema = requestBody({ userId: raw(), chatId: raw(), force: raw(), score: raw() });
export type SetScoreDto = z.infer<typeof setScoreSchema>;

export const deleteScoreSchema = requestBody({ userId: raw() });
export type DeleteScoreDto = z.infer<typeof deleteScoreSchema>;
