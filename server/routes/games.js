const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { genId } = require("../lib/genId");
const { getChat } = require("../data/chats");
const { listUsersByIds } = require("../data/users");
const games = require("../data/games");

const router = express.Router();
router.use(requireUserId);

const MAX_CODE = 512 * 1024;
const MAX_SCORE = 1_000_000_000;

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    res.json({ games: q ? games.searchGames(q, req.uid, 50) : games.listCatalog() });
  })
);

router.get(
  "/mine",
  asyncRoute(async (req, res) => res.json({ games: games.listMine(req.uid) }))
);

router.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const game = games.getGame(req.params.id, { withCode: true });
    // Чужая неопубликованная игра открывается только по карточке из чата (по id) —
    // id случайный, как ссылка «для своих».
    if (!game) return res.status(404).json({ error: "Игра не найдена" });
    res.json({ game });
  })
);

function validGame(body) {
  const title = String(body?.title ?? "").trim().slice(0, 64);
  const code = String(body?.code ?? "");
  if (!title) return { error: "Введите название игры" };
  if (code.trim() && code.length > MAX_CODE) return { error: "Игра слишком большая (до 512 КБ)" };
  const emoji = [...String(body?.emoji ?? "🎮").trim()].slice(0, 2).join("") || "🎮";
  return { title, code, emoji, description: String(body?.description ?? "").trim().slice(0, 200), isPublic: !!body?.isPublic };
}

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const v = validGame(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    if (games.listMine(req.uid).length >= 50) return res.status(400).json({ error: "Не больше 50 своих игр" });
    res.json({ game: games.saveGame({ id: genId("g"), ownerId: req.uid, ...v }) });
  })
);

router.patch(
  "/:id/meta",
  asyncRoute(async (req, res) => {
    const game = games.getGame(req.params.id);
    if (!game || game.ownerId !== req.uid) return res.status(404).json({ error: "Игра не найдена" });
    const title = String(req.body?.title ?? "").trim().slice(0, 64);
    const emoji = [...String(req.body?.emoji ?? "🎮").trim()].slice(0, 2).join("") || "🎮";
    const description = String(req.body?.description ?? "").trim().slice(0, 200);
    const isPublic = !!req.body?.isPublic;
    if (!title) return res.status(400).json({ error: "Введите название игры" });
    res.json({ game: games.updateGameMeta(game.id, { title, description, emoji, isPublic }) });
  })
);

// Токен Game API для своей игры (новый токен отзывает прежний).
router.post(
  "/:id/token",
  asyncRoute(async (req, res) => {
    const game = games.getGame(req.params.id);
    if (!game || game.ownerId !== req.uid) return res.status(404).json({ error: "Игра не найдена" });
    res.json({ token: games.issueGameToken(game.id) });
  })
);

// Лучший результат игрока (для SDK внутри игры: Shalter.getBest()).
router.get(
  "/:id/best",
  asyncRoute(async (req, res) => {
    const scope = await scopeFor(req, req.query.chatId);
    if (scope === null) return res.status(404).json({ error: "Чат не найден" });
    res.json({ best: games.bestScore(req.params.id, scope, req.uid) });
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const game = games.getGame(req.params.id);
    if (!game || game.ownerId !== req.uid) return res.status(404).json({ error: "Игра не найдена" });
    games.deleteGame(game.id);
    require("../db").prepare("DELETE FROM game_tokens WHERE gameId = ?").run(game.id);
    res.json({ ok: true });
  })
);

// Рекорд: общий (без chatId) и в чате, где отправили карточку игры.
async function scopeFor(req, chatId) {
  if (!chatId) return "";
  const chat = await getChat(String(chatId));
  return chat && chat.memberIds.includes(req.uid) ? chat.id : null;
}

router.post(
  "/:id/play",
  asyncRoute(async (req, res) => {
    if (!games.getGame(req.params.id)) return res.status(404).json({ error: "Игра не найдена" });
    games.countPlay(req.params.id);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/score",
  asyncRoute(async (req, res) => {
    if (!games.getGame(req.params.id)) return res.status(404).json({ error: "Игра не найдена" });
    const score = Math.floor(Number(req.body?.score));
    if (!Number.isSafeInteger(score) || score < 0 || score > MAX_SCORE) return res.status(400).json({ error: "Некорректный счёт" });
    const scope = await scopeFor(req, req.body?.chatId);
    if (scope === null) return res.status(404).json({ error: "Чат не найден" });
    const global = games.submitScore(req.params.id, "", req.uid, score);
    const local = scope ? games.submitScore(req.params.id, scope, req.uid, score) : null;
    res.json({ best: (local ?? global).best, improved: (local ?? global).improved });
  })
);

router.get(
  "/:id/scores",
  asyncRoute(async (req, res) => {
    const scope = await scopeFor(req, req.query.chatId);
    if (scope === null) return res.status(404).json({ error: "Чат не найден" });
    const rows = games.topScores(req.params.id, scope);
    const users = await listUsersByIds(rows.map((r) => r.userId));
    const byId = new Map(users.map((u) => [u.id, u]));
    res.json({
      scores: rows.map((r) => ({ ...r, name: byId.get(r.userId)?.name ?? "Игрок", avatarColor: byId.get(r.userId)?.avatarColor, avatarImage: byId.get(r.userId)?.avatarImage })),
    });
  })
);

module.exports = router;
