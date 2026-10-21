// Game API — HTTP-методы для разработчиков игр (как Bot API у ботов).
//   Authorization: Bearer game_…  (токен — в редакторе игры → «API-токен»)
// Обновлять игру из своего репозитория/CI, читать статистику и рекорды, ставить
// рекорды со своего сервера (защита от накрутки счёта в браузере).
const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const games = require("../data/games");
const { getChat } = require("../data/chats");
const { getUser, listUsersByIds } = require("../data/users");
const { usesForeignUpload } = require("../lib/uploadAccess");

// Тело разбирает общий express.json (server/app.js) — свой парсер здесь не сработал бы.
const router = express.Router();

router.use((req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: "Missing Authorization: Bearer <game token>" });
  const game = games.gameByToken(token);
  if (!game) return res.status(401).json({ error: "Invalid game token" });
  req.game = game;
  next();
});

const MAX_SCORE = 1_000_000_000;
const MAX_CODE = 512 * 1024;
const publicGame = ({ code, ...g }) => g;

// Таблица рекордов чата — только для участника этого чата (userId — игрок, от
// имени которого действует сервер игры). Иначе токен любой игры, зная id чата,
// мог бы засорять чужие таблицы и узнавать, кто в чате состоит. Чужой чат
// неотличим от несуществующего — тот же 404.
async function scopeOf(chatId, userId) {
  if (!chatId) return "";
  const chat = await getChat(String(chatId));
  return chat && userId && chat.memberIds.includes(String(userId)) ? chat.id : null;
}

router.all(
  "/getGame",
  asyncRoute(async (req, res) => res.json({ ok: true, game: publicGame(req.game), stats: games.gameStats(req.game.id) }))
);

router.post(
  "/updateGame",
  asyncRoute(async (req, res) => {
    const b = req.body ?? {};
    const next = {
      id: req.game.id,
      ownerId: req.game.ownerId,
      title: b.title != null ? String(b.title).trim().slice(0, 64) : req.game.title,
      description: b.description != null ? String(b.description).trim().slice(0, 200) : req.game.description,
      emoji: b.emoji != null ? [...String(b.emoji).trim()].slice(0, 2).join("") || "🎮" : req.game.emoji,
      code: b.code != null ? String(b.code) : req.game.code,
      isPublic: b.isPublic != null ? !!b.isPublic : req.game.isPublic,
    };
    if (!next.title) return res.status(400).json({ error: "title is required" });
    // Код проверяется, только если его передали: игру, созданную в приложении без кода,
    // можно сначала переименовать, а код залить позже.
    if (b.code != null && (!next.code.trim() || next.code.length > MAX_CODE)) return res.status(400).json({ error: "code: от 1 байта до 512 КБ" });
    if (usesForeignUpload(req.game.ownerId, next.code, req.game.code)) return res.status(400).json({ error: "Некорректная ссылка на файл" });
    res.json({ ok: true, game: publicGame(games.saveGame(next)) });
  })
);

router.all(
  "/getStats",
  asyncRoute(async (req, res) => res.json({ ok: true, ...games.gameStats(req.game.id) }))
);

router.all(
  "/getScores",
  asyncRoute(async (req, res) => {
    const q = { ...req.query, ...(req.body ?? {}) };
    const scope = await scopeOf(q.chatId, q.userId);
    if (scope === null) return res.status(404).json({ error: "chat not found" });
    const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 100);
    const rows = games.topScores(req.game.id, scope, limit);
    const users = await listUsersByIds(rows.map((r) => r.userId));
    const names = new Map(users.map((u) => [u.id, { name: u.name, username: u.username }]));
    res.json({ ok: true, scores: rows.map((r, i) => ({ position: i + 1, ...r, ...names.get(r.userId) })) });
  })
);

// Рекорд с сервера разработчика. force — записать даже если меньше прежнего (сброс накрутки).
router.post(
  "/setScore",
  asyncRoute(async (req, res) => {
    const { userId, chatId, force } = req.body ?? {};
    const raw = req.body?.score;
    const score = typeof raw === "number" || (typeof raw === "string" && raw.trim()) ? Math.floor(Number(raw)) : NaN;
    if (!userId || !(await getUser(String(userId)))) return res.status(404).json({ error: "user not found" });
    if (!Number.isSafeInteger(score) || score < 0 || score > MAX_SCORE) return res.status(400).json({ error: "score: целое от 0" });
    const scope = await scopeOf(chatId, userId);
    if (scope === null) return res.status(404).json({ error: "chat not found" });
    const write = (sc) => (force ? (games.setScoreExact(req.game.id, sc, String(userId), score), { best: score, improved: true }) : games.submitScore(req.game.id, sc, String(userId), score));
    const global = write("");
    const local = scope ? write(scope) : null;
    res.json({ ok: true, ...(local ?? global) });
  })
);

router.post(
  "/deleteScore",
  asyncRoute(async (req, res) => {
    if (!req.body?.userId) return res.status(400).json({ error: "userId is required" });
    games.deleteScore(req.game.id, String(req.body.userId));
    res.json({ ok: true });
  })
);

module.exports = router;
