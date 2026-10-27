// Пределы и разбор счёта — общие для /api/games и Game API (server/routes/games.js, gameApi.js).

export const MAX_GAME_CODE = 512 * 1024;
export const MAX_SCORE = 1_000_000_000;

/** Счёт — число или строка-число; null, "" и true не превращаются в 0/1. */
export function parseScore(raw: unknown): number {
  if (typeof raw === "number" || (typeof raw === "string" && raw.trim())) return Math.floor(Number(raw));
  return NaN;
}
