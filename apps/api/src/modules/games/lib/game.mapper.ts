import fs from "node:fs";
import path from "node:path";
import { PUBLIC_DIR } from "../../../common/config/paths.js";
import type { Game, GameRow } from "../model/domain.js";

// Игры: строки таблицы games и встроенные игры из public/games — как server/data/games.js.

/** Встроенные игры — файлы public/games/<file>; id с префиксом builtin-. */
export const BUILTIN_GAMES = [
  { id: "builtin-2048", title: "2048", emoji: "🔢", description: "Складывайте плитки до 2048", file: "2048.html" },
  { id: "builtin-snake", title: "Змейка", emoji: "🐍", description: "Классика: собирайте яблоки и растите", file: "snake.html" },
  { id: "builtin-flappy", title: "Shalter Bird", emoji: "🐦", description: "Пролетите между трубами как можно дальше", file: "flappy.html" },
];
const GAMES_DIR = path.join(PUBLIC_DIR, "games");

export const isBuiltinId = (id: unknown): boolean => String(id).startsWith("builtin-");

/** Встроенная игра целиком (с кодом из файла); null — нет такой. */
export function builtinGame(id: string): Game | null {
  const g = BUILTIN_GAMES.find((b) => b.id === id);
  if (!g) return null;
  let code = "";
  try {
    code = fs.readFileSync(path.join(GAMES_DIR, g.file), "utf8");
  } catch {
    // файла нет — пустой код
  }
  return { ...g, ownerId: null, isPublic: true, builtin: true, code };
}

/** Карточки встроенных игр для каталога и поиска (без файла и кода). */
export const builtinCards = (games = BUILTIN_GAMES): Game[] => games.map(({ file: _file, ...g }) => ({ ...g, builtin: true, isPublic: true }));

export function toGame(row: GameRow, withCode = false): Game {
  const { code, ...rest } = row;
  return { ...rest, isPublic: !!row.isPublic, hasCode: !!String(code ?? "").trim(), ...(withCode ? { code } : {}) };
}
