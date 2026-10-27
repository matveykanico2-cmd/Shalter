import type { games } from "../../db/schema.js";

export type GameRow = typeof games.$inferSelect;

/** Игра в ответах API — как rowToGame и builtin в server/data/games.js. */
export interface Game {
  id: string;
  /** Нет у карточек встроенных игр в каталоге; null — у встроенной игры целиком. */
  ownerId?: string | null;
  title: string;
  description: string;
  emoji: string;
  isPublic: boolean;
  /** false — черновик без кода: в каталог и чужой поиск не попадает. */
  hasCode?: boolean;
  builtin?: true;
  code?: string;
  [extra: string]: unknown;
}

export interface GameScoreRow {
  userId: string;
  score: number;
  updatedAt: string;
}

/** Поля игры для сохранения (saveGame). */
export interface GameDraft {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  emoji: string;
  code: string;
  isPublic: boolean;
}
