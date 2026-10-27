import { useSyncExternalStore } from "react";

import type { GameListItem, GameRef } from "../api/game-api";

/**
 * Окна игр открывают отовсюду — карточка в чате, главное меню, вложение, поиск, настройки
 * (openGame, openScores, openGamesCatalog в public/js/components/games.js). Рисует их хост
 * из features/games: каталог, поверх — игра, поверх игры — рекорды.
 */
export type GameWindows = {
  catalog: { chatId: string | null; onPick: ((game: GameListItem) => void) | null } | null;
  game: { id: number; game: GameRef; chatId: string | null } | null;
  scores: { game: GameRef; chatId: string | null } | null;
};

let state: GameWindows = { catalog: null, game: null, scores: null };
let seq = 0;
const listeners = new Set<() => void>();
const set = (next: Partial<GameWindows>) => {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
};

/** Каталог игр; onPick — «В чат» (отправить карточку). */
export const openGamesCatalog = ({ chatId = null, onPick = null }: { chatId?: string | null; onPick?: ((game: GameListItem) => void) | null } = {}) => set({ catalog: { chatId, onPick } });
export const closeGamesCatalog = () => set({ catalog: null });

/** Игровое окно; chatId — откуда запустили (рекорды этого чата). */
export const openGame = (game: GameRef, { chatId = null }: { chatId?: string | null } = {}) => set({ game: { id: ++seq, game, chatId } });
export const closeGame = () => set({ game: null });

export const openGameScores = (game: GameRef, chatId: string | null = null) => set({ scores: { game, chatId } });
export const closeGameScores = () => set({ scores: null });

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

export const useGameWindows = () => useSyncExternalStore(subscribe, () => state);
