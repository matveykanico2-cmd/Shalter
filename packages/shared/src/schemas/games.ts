// Игры: каталог и рекорды (server/routes/games.js, /api/games) и Game API по
// токену игры (server/routes/gameApi.js, /api/game-api). Игра — rowToGame и
// встроенные игры из server/data/games.js.
import { z } from "zod";
import { genId, isoDate } from "./common";

const gameShape = {
  id: genId("g"),
  ownerId: z.string(),
  title: z.string(),
  description: z.string(),
  emoji: z.string(),
  isPublic: z.boolean(),
  /** false — черновик без кода: в каталог и чужой поиск не попадает. */
  hasCode: z.boolean(),
  plays: z.number(),
  createdAt: isoDate,
  updatedAt: isoDate,
};

/** Своя игра без кода (списки, правка метаданных, Game API). */
export const game = z.strictObject(gameShape);
/** Своя игра с кодом (создание, GET /:id). */
export const gameWithCode = z.strictObject({ ...gameShape, code: z.string() });

const builtinShape = {
  id: z.string().regex(/^builtin-[a-z0-9-]+$/),
  title: z.string(),
  emoji: z.string(),
  description: z.string(),
  builtin: z.literal(true),
  isPublic: z.literal(true),
};
/** Встроенная игра в каталоге и поиске. */
export const builtinGame = z.strictObject(builtinShape);
/** Встроенная игра в GET /:id — с файлом, ownerId: null и кодом. */
export const builtinGameFull = z.strictObject({ ...builtinShape, file: z.string(), ownerId: z.null(), code: z.string() });

export const gamesBody = z.strictObject({ games: z.array(z.union([builtinGame, game])) });
export const gameBody = z.strictObject({ game: gameWithCode });
export const gameMetaBody = z.strictObject({ game });
export const gameAnyBody = z.strictObject({ game: z.union([gameWithCode, builtinGameFull]) });
export const gameTokenBody = z.strictObject({ token: z.string().regex(/^game_[a-f0-9]{48}$/) });
export const bestBody = z.strictObject({ best: z.number() });
export const scoreBody = z.strictObject({ best: z.number(), improved: z.boolean() });
export const scoresBody = z.strictObject({
  scores: z.array(
    z.strictObject({
      userId: z.string(),
      score: z.number(),
      updatedAt: isoDate,
      name: z.string(),
      avatarColor: z.string().optional(),
      avatarImage: z.string().optional(),
    }),
  ),
});

// ---------- Game API ----------
export const gameStats = { plays: z.number(), players: z.number(), topScore: z.number() };
export const apiGameBody = z.strictObject({ ok: z.literal(true), game, stats: z.strictObject(gameStats) });
export const apiUpdateGameBody = z.strictObject({ ok: z.literal(true), game });
export const apiStatsBody = z.strictObject({ ok: z.literal(true), ...gameStats });
export const apiScoresBody = z.strictObject({
  ok: z.literal(true),
  scores: z.array(
    z.strictObject({
      position: z.number(),
      userId: z.string(),
      score: z.number(),
      updatedAt: isoDate,
      name: z.string(),
      username: z.string().nullable(),
    }),
  ),
});
export const apiSetScoreBody = z.strictObject({ ok: z.literal(true), best: z.number(), improved: z.boolean() });
