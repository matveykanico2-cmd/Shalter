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

// Поиск игр по названию и описанию: встроенные, опубликованные и свои.
function searchGames(q, userId, limit = 20) {
  const needle = String(q ?? "").trim().toLowerCase();
  if (!needle) return [];
  const hit = (g) => `${g.title} ${g.description ?? ""}`.toLowerCase().includes(needle);
  const builtins = BUILTIN.filter(hit).map(({ file, ...g }) => ({ ...g, builtin: true, isPublic: true }));
  // % и _ в запросе ищутся как обычные символы.
  const like = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const own = db
    // lower_ru (db.js) — JS toLowerCase: встроенный lower() SQLite сворачивает только ASCII,
    // и «Космолётище» не находилось по «космолётище».
    .prepare("SELECT * FROM games WHERE (isPublic = 1 OR ownerId = ?) AND (lower_ru(title) LIKE ? ESCAPE '\\' OR lower_ru(description) LIKE ? ESCAPE '\\') ORDER BY plays DESC LIMIT ?")
    .all(userId, like, like, limit)
    .map((r) => rowToGame(r));
  return [...builtins, ...own].slice(0, limit);
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

function updateGameMeta(id, { title, description, emoji, isPublic }) {
  const title_ = String(title ?? "").trim().slice(0, 64) || "🎮";
  const emoji_ = [...String(emoji ?? "🎮").trim()].slice(0, 2).join("") || "🎮";
  const description_ = String(description ?? "").trim().slice(0, 200);
  db.prepare(
    "UPDATE games SET title = ?, description = ?, emoji = ?, isPublic = ?, updatedAt = ? WHERE id = ?"
  ).run(title_, description_, emoji_, isPublic ? 1 : 0, new Date().toISOString(), id);
  return getGame(id);
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

// ---------- Game API ----------
const crypto = require("crypto");
const hashToken = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

// Новый токен игры (старый перестаёт работать). Возвращается один раз.
function issueGameToken(gameId) {
  const token = `game_${crypto.randomBytes(24).toString("hex")}`;
  db.prepare(
    `INSERT INTO game_tokens (gameId, tokenHash, createdAt) VALUES (?, ?, ?)
     ON CONFLICT(gameId) DO UPDATE SET tokenHash = excluded.tokenHash, createdAt = excluded.createdAt`
  ).run(gameId, hashToken(token), new Date().toISOString());
  return token;
}

function gameByToken(token) {
  if (!/^game_[a-f0-9]{48}$/.test(String(token ?? ""))) return null;
  const row = db.prepare("SELECT gameId FROM game_tokens WHERE tokenHash = ?").get(hashToken(token));
  return row ? getGame(row.gameId, { withCode: true }) : null;
}

function hasGameToken(gameId) {
  return !!db.prepare("SELECT 1 FROM game_tokens WHERE gameId = ?").get(gameId);
}

function setScoreExact(gameId, scope, userId, score) {
  db.prepare(
    `INSERT INTO game_scores (gameId, scope, userId, score, updatedAt) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(gameId, scope, userId) DO UPDATE SET score = excluded.score, updatedAt = excluded.updatedAt`
  ).run(gameId, scope, userId, score, new Date().toISOString());
}

function deleteScore(gameId, userId) {
  db.prepare("DELETE FROM game_scores WHERE gameId = ? AND userId = ?").run(gameId, userId);
}

function bestScore(gameId, scope, userId) {
  return db.prepare("SELECT score FROM game_scores WHERE gameId = ? AND scope = ? AND userId = ?").get(gameId, scope, userId)?.score ?? 0;
}

function gameStats(gameId) {
  const row = db.prepare("SELECT count(DISTINCT userId) AS players, max(score) AS top FROM game_scores WHERE gameId = ? AND scope = ''").get(gameId);
  const plays = db.prepare("SELECT plays FROM games WHERE id = ?").get(gameId)?.plays ?? 0;
  return { plays, players: row?.players ?? 0, topScore: row?.top ?? 0 };
}

module.exports = { issueGameToken, gameByToken, hasGameToken, setScoreExact, deleteScore, bestScore, gameStats, BUILTIN, searchGames, getGame, listCatalog, listMine, saveGame, updateGameMeta, deleteGame, countPlay, submitScore, topScores };
