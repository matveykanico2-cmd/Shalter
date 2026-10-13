const fs = require("fs");
const path = require("path");
const db = require("../db");

// Встроенные игры — файлы public/games/<file>; id с префиксом builtin-.
const BUILTIN = [
  { id: "builtin-2048", title: "2048", emoji: "🔢", description: "Складывайте плитки до 2048", file: "2048.html" },
  { id: "builtin-snake", title: "Змейка", emoji: "🐍", description: "Классика: собирайте яблоки и растите", file: "snake.html" },
  { id: "builtin-flappy", title: "Shalter Bird", emoji: "🐦", description: "Пролетите между трубами как можно дальше", file: "flappy.html" },
];
const GAMES_DIR = path.join(__dirname, "..", "..", "public", "games");

function builtin(id) {
  const g = BUILTIN.find((b) => b.id === id);
  if (!g) return null;
  let code = "";
  try {
    code = fs.readFileSync(path.join(GAMES_DIR, g.file), "utf8");
  } catch {}
  return { ...g, ownerId: null, isPublic: true, builtin: true, code };
}

function rowToGame(row, withCode = false) {
  if (!row) return null;
  const { code, ...rest } = row;
  return { ...rest, isPublic: !!row.isPublic, ...(withCode ? { code } : {}) };
}

function getGame(id, { withCode = false } = {}) {
  if (String(id).startsWith("builtin-")) {
    const g = builtin(id);
    if (!g) return null;
    if (!withCode) delete g.code;
    return g;
  }
  return rowToGame(db.prepare("SELECT * FROM games WHERE id = ?").get(id), withCode);
}

function listCatalog() {
  const own = db.prepare("SELECT * FROM games WHERE isPublic = 1 ORDER BY plays DESC, updatedAt DESC LIMIT 100").all().map((r) => rowToGame(r));
  return [...BUILTIN.map(({ file, ...g }) => ({ ...g, builtin: true, isPublic: true })), ...own];
}

function listMine(userId) {
  return db.prepare("SELECT * FROM games WHERE ownerId = ? ORDER BY updatedAt DESC").all(userId).map((r) => rowToGame(r));
}

function saveGame(game) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO games (id, ownerId, title, description, emoji, code, isPublic, plays, createdAt, updatedAt)
     VALUES (@id, @ownerId, @title, @description, @emoji, @code, @isPublic, 0, @now, @now)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, emoji = excluded.emoji,
       code = excluded.code, isPublic = excluded.isPublic, updatedAt = excluded.updatedAt`
  ).run({ ...game, isPublic: game.isPublic ? 1 : 0, now });
  return getGame(game.id, { withCode: true });
}

function deleteGame(id) {
  db.prepare("DELETE FROM games WHERE id = ?").run(id);
  db.prepare("DELETE FROM game_scores WHERE gameId = ?").run(id);
}

function countPlay(id) {
  if (!String(id).startsWith("builtin-")) db.prepare("UPDATE games SET plays = plays + 1 WHERE id = ?").run(id);
}

// Сохраняем, только если результат лучше прежнего. Возвращает { best, improved }.
function submitScore(gameId, scope, userId, score) {
  const prev = db.prepare("SELECT score FROM game_scores WHERE gameId = ? AND scope = ? AND userId = ?").get(gameId, scope, userId);
  if (prev && prev.score >= score) return { best: prev.score, improved: false };
  db.prepare(
    `INSERT INTO game_scores (gameId, scope, userId, score, updatedAt) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(gameId, scope, userId) DO UPDATE SET score = excluded.score, updatedAt = excluded.updatedAt`
  ).run(gameId, scope, userId, score, new Date().toISOString());
  return { best: score, improved: true };
}

function topScores(gameId, scope, limit = 20) {
  return db.prepare("SELECT userId, score, updatedAt FROM game_scores WHERE gameId = ? AND scope = ? ORDER BY score DESC, updatedAt ASC LIMIT ?").all(gameId, scope, limit);
}

module.exports = { BUILTIN, getGame, listCatalog, listMine, saveGame, deleteGame, countPlay, submitScore, topScores };
