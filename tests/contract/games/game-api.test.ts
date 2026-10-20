// Game API — HTTP-методы для разработчиков игр по токену игры
// (Authorization: Bearer game_…, server/routes/gameApi.js): getGame, updateGame,
// getStats, getScores, setScore, deleteScore. Сессия (cookie) здесь не нужна и не помогает.
import { describe, expect, test } from "vitest";
import { expectError, expectOk } from "../../support/expect";
import { createDm, createGroup, registerUser, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { okBody } from "../../schemas/common";
import { apiGameBody, apiScoresBody, apiSetScoreBody, apiStatsBody, apiUpdateGameBody, bestBody, gameAnyBody, gamesBody, scoreBody, scoresBody } from "../../schemas/games";
import { createGame, gameApi, issueToken } from "./helpers";

const server = useServer();
const MISSING = "Missing Authorization: Bearer <game token>";
const INVALID = "Invalid game token";

/** Владелец, его игра и клиент Game API с токеном. */
async function setup(extra: Record<string, unknown> = {}) {
  const { baseUrl } = server();
  const owner = await registerUser(baseUrl);
  const game = await createGame(owner, extra);
  const token = await issueToken(owner, game.id);
  return { owner, game, token, api: gameApi(baseUrl, token) };
}

describe("авторизация", () => {
  const methods: Array<[string, string]> = [
    ["GET", "getGame"],
    ["POST", "getGame"],
    ["POST", "updateGame"],
    ["GET", "getStats"],
    ["POST", "getStats"],
    ["GET", "getScores"],
    ["POST", "getScores"],
    ["POST", "setScore"],
    ["POST", "deleteScore"],
  ];
  test.each(methods)("%s %s без заголовка → 401", async (method, path) => {
    expectError(await gameApi(server().baseUrl, null).raw(method, path, {}), 401, MISSING);
  });

  test.each(methods)("%s %s с чужим/битым токеном → 401", async (method, path) => {
    const api = gameApi(server().baseUrl, null);
    expectError(await api.raw(method, path, { authorization: "Bearer nope" }), 401, INVALID);
    expectError(await api.raw(method, path, { authorization: `Bearer game_${"0".repeat(48)}` }), 401, INVALID);
  });

  test("не Bearer, пустой Bearer и сессия пользователя → 401 Missing", async () => {
    const { owner, token } = await setup();
    const api = gameApi(server().baseUrl, null);
    expectError(await api.raw("GET", "getGame", { authorization: token }), 401, MISSING);
    expectError(await api.raw("GET", "getGame", { authorization: `Basic ${token}` }), 401, MISSING);
    expectError(await api.raw("GET", "getGame", { authorization: "Bearer    " }), 401, MISSING);
    expectError(await owner.api.get("/api/game-api/getGame"), 401, MISSING);
    // Пробелы вокруг токена обрезаются.
    expectOk(await api.raw("GET", "getGame", { authorization: `Bearer   ${token}  ` }), apiGameBody);
  });

  test("новый токен отзывает прежний", async () => {
    const { owner, game, token } = await setup();
    const fresh = await issueToken(owner, game.id);
    expectError(await gameApi(server().baseUrl, token).get("getGame"), 401, INVALID);
    expectOk(await gameApi(server().baseUrl, fresh).get("getGame"), apiGameBody);
  });
});

describe("getGame и getStats", () => {
  test("getGame (GET и POST) — игра без кода и статистика", async () => {
    const { game, api } = await setup({ title: "API-игра", description: "описание" });
    const expected = { ok: true, game: { ...game, code: undefined }, stats: { plays: 0, players: 0, topScore: 0 } };
    const viaGet = expectOk(await api.get("getGame"), apiGameBody);
    expect(viaGet).toEqual(expected);
    expect(viaGet.game).not.toHaveProperty("code");
    expect(expectOk(await api.post("getGame"), apiGameBody)).toEqual(expected);
  });

  test("getStats (GET и POST): запуски, игроки и лучший счёт по общему рейтингу", async () => {
    const { baseUrl } = server();
    const { owner, game, api } = await setup();
    const [p1, p2] = await registerUsers(baseUrl, 2);
    const chat = await createGroup(p1, [p2]);
    expect(expectOk(await api.get("getStats"), apiStatsBody)).toEqual({ ok: true, plays: 0, players: 0, topScore: 0 });

    expectOk(await p1.api.post(`/api/games/${game.id}/play`), okBody);
    expectOk(await p2.api.post(`/api/games/${game.id}/play`), okBody);
    expectOk(await owner.api.post(`/api/games/${game.id}/play`), okBody);
    expectOk(await p1.api.post(`/api/games/${game.id}/score`, { score: 40 }), scoreBody);
    expectOk(await p1.api.post(`/api/games/${game.id}/score`, { score: 10, chatId: chat.id }), scoreBody);
    expectOk(await p2.api.post(`/api/games/${game.id}/score`, { score: 25, chatId: chat.id }), scoreBody);

    const stats = { ok: true, plays: 3, players: 2, topScore: 40 };
    expect(expectOk(await api.get("getStats"), apiStatsBody)).toEqual(stats);
    expect(expectOk(await api.post("getStats"), apiStatsBody)).toEqual(stats);
    expect(expectOk(await api.get("getGame"), apiGameBody).stats).toEqual({ plays: 3, players: 2, topScore: 40 });
  });
});

describe("updateGame", () => {
  test("меняет только переданные поля; plays и createdAt сохраняются; видно через /api/games", async () => {
    const { baseUrl } = server();
    const { owner, game, api } = await setup({ title: "Было", description: "было", emoji: "🎲", code: "<old/>" });
    const other = await registerUser(baseUrl);
    expectOk(await other.api.post(`/api/games/${game.id}/play`), okBody);

    const res = expectOk(await api.post("updateGame", { code: "<new/>", isPublic: true }), apiUpdateGameBody);
    expect(res).toEqual({ ok: true, game: { ...game, code: undefined, isPublic: true, plays: 1, updatedAt: expect.any(String) } });
    expect(res.game).not.toHaveProperty("code");

    const full = expectOk(await owner.api.get(`/api/games/${game.id}`), gameAnyBody).game;
    expect(full).toMatchObject({ title: "Было", description: "было", emoji: "🎲", code: "<new/>", isPublic: true, plays: 1, createdAt: game.createdAt });
    expect(expectOk(await other.api.get("/api/games"), gamesBody).games.some((g) => g.id === game.id)).toBe(true);

    const renamed = expectOk(await api.post("updateGame", { title: `  ${"н".repeat(80)}  `, description: "д".repeat(250), emoji: "", isPublic: 0 }), apiUpdateGameBody).game;
    expect(renamed).toMatchObject({ title: "н".repeat(64), description: "д".repeat(200), emoji: "🎮", isPublic: false });
    expect(expectOk(await other.api.get("/api/games"), gamesBody).games.some((g) => g.id === game.id)).toBe(false);
  });

  test("эмодзи не обрезается от пробелов (в отличие от PATCH /meta)", async () => {
    const { api } = await setup();
    // ПОВЕДЕНИЕ-ВОПРОС: Game API берёт первые 2 символа emoji без trim — « 🎲x» превращается
    // в « 🎲» с пробелом; POST /api/games и PATCH /meta сначала обрезают пробелы.
    expect(expectOk(await api.post("updateGame", { emoji: " 🎲x" }), apiUpdateGameBody).game.emoji).toBe(" 🎲");
  });

  test("ошибки: пустое название, пустой или слишком большой код", async () => {
    const { owner, game, api } = await setup({ code: "<keep/>" });
    expectError(await api.post("updateGame", { title: "   " }), 400, "title is required");
    expectError(await api.post("updateGame", { code: "  " }), 400, "code: от 1 байта до 512 КБ");
    expectError(await api.post("updateGame", { code: "x".repeat(512 * 1024 + 1) }), 400, "code: от 1 байта до 512 КБ");
    expect(expectOk(await owner.api.get(`/api/games/${game.id}`), gameAnyBody).game).toEqual(game);
  });

  test("игру без кода через API не обновить, пока не передан code", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const game = await createGame(owner, { code: "" });
    const api = gameApi(baseUrl, await issueToken(owner, game.id));
    // ПОВЕДЕНИЕ-ВОПРОС: POST /api/games разрешает пустой code, а updateGame проверяет итоговый
    // code — смена одного названия у такой игры падает с ошибкой про код.
    expectError(await api.post("updateGame", { title: "Новое" }), 400, "code: от 1 байта до 512 КБ");
    expect(expectOk(await api.post("updateGame", { title: "Новое", code: "<x/>" }), apiUpdateGameBody).game.title).toBe("Новое");
  });

  test("лимит тела 600kb у Game API не действует — тело уже разобрано общим парсером (25mb)", async () => {
    const { api } = await setup();
    // ПОВЕДЕНИЕ-ВОПРОС: router.use(express.json({ limit: "600kb" })) в gameApi.js — мёртвый код:
    // глобальный express.json({ limit: "25mb" }) разбирает тело раньше. Тело ~700 КБ принимается.
    const res = expectOk(await api.post("updateGame", { title: "т".repeat(700 * 1024 / 2) }), apiUpdateGameBody);
    expect(res.game.title).toBe("т".repeat(64));
  });

  test("updateGame только POST", async () => {
    const { api } = await setup();
    const res = await api.get("updateGame");
    expect(res.status).toBe(404);
  });
});

describe("setScore", () => {
  test("рекорд игрока с сервера разработчика: только лучший, force — записать как есть", async () => {
    const { baseUrl } = server();
    const { game, api } = await setup();
    const player = await registerUser(baseUrl);

    expect(expectOk(await api.post("setScore", { userId: player.id, score: 100 }), apiSetScoreBody)).toEqual({ ok: true, best: 100, improved: true });
    expect(expectOk(await api.post("setScore", { userId: player.id, score: 60 }), apiSetScoreBody)).toEqual({ ok: true, best: 100, improved: false });
    expect(expectOk(await player.api.get(`/api/games/${game.id}/best`), bestBody)).toEqual({ best: 100 });

    // force — сброс накрутки: меньший результат записывается.
    expect(expectOk(await api.post("setScore", { userId: player.id, score: 60, force: true }), apiSetScoreBody)).toEqual({ ok: true, best: 60, improved: true });
    expect(expectOk(await player.api.get(`/api/games/${game.id}/best`), bestBody)).toEqual({ best: 60 });
    // Счёт дробный/строкой — округляется вниз.
    expect(expectOk(await api.post("setScore", { userId: player.id, score: "70.9" }), apiSetScoreBody)).toEqual({ ok: true, best: 70, improved: true });
  });

  test("с chatId — и в чат, и в общий; ответ — по чату", async () => {
    const { baseUrl } = server();
    const { game, api } = await setup();
    const [p1, p2] = await registerUsers(baseUrl, 2);
    const chat = await createGroup(p1, [p2]);
    expectOk(await api.post("setScore", { userId: p1.id, score: 500 }), apiSetScoreBody);
    expect(expectOk(await api.post("setScore", { userId: p1.id, score: 30, chatId: chat.id }), apiSetScoreBody)).toEqual({ ok: true, best: 30, improved: true });
    expect(expectOk(await p1.api.get(`/api/games/${game.id}/best`, { query: { chatId: chat.id } }), bestBody)).toEqual({ best: 30 });
    expect(expectOk(await p1.api.get(`/api/games/${game.id}/best`), bestBody)).toEqual({ best: 500 });
  });

  test("chatId — только чат, где игрок состоит; чужой чат как несуществующий (404), ничего не пишется", async () => {
    const { baseUrl } = server();
    const { game, api } = await setup();
    const [p1, p2, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(p1, p2);
    expectError(await api.post("setScore", { userId: outsider.id, score: 999, chatId: dm.id }), 404, "chat not found");
    expectError(await api.post("setScore", { userId: outsider.id, score: 999, chatId: dm.id, force: true }), 404, "chat not found");
    expect(expectOk(await p1.api.get(`/api/games/${game.id}/scores`, { query: { chatId: dm.id } }), scoresBody).scores).toEqual([]);
    // Общий рекорд при отказе тоже не пишется.
    expect(expectOk(await outsider.api.get(`/api/games/${game.id}/best`), bestBody)).toEqual({ best: 0 });
    // Участник — можно.
    expect(expectOk(await api.post("setScore", { userId: p2.id, score: 7, chatId: dm.id }), apiSetScoreBody)).toEqual({ ok: true, best: 7, improved: true });
  });

  test("ошибки: игрок не найден → 404 (раньше счёта), счёт → 400, чат не найден → 404", async () => {
    const { baseUrl } = server();
    const { game, api } = await setup();
    const player = await registerUser(baseUrl);
    expectError(await api.post("setScore", { score: 10 }), 404, "user not found");
    expectError(await api.post("setScore", { userId: "u_nope12345678", score: "bad" }), 404, "user not found");
    for (const score of [undefined, "abc", -1, 1_000_000_001]) {
      expectError(await api.post("setScore", { userId: player.id, score }), 400, "score: целое от 0");
    }
    expectError(await api.post("setScore", { userId: player.id, score: 5, chatId: "c_nope12345678" }), 404, "chat not found");
    expect(expectOk(await player.api.get(`/api/games/${game.id}/best`), bestBody)).toEqual({ best: 0 });
  });
});

describe("getScores", () => {
  test("GET и POST: позиция, счёт, имя и username; limit 1…100 (по умолчанию 20)", async () => {
    const { baseUrl } = server();
    const { api } = await setup();
    const players = await registerUsers(baseUrl, 3);
    for (const [i, p] of players.entries()) expectOk(await api.post("setScore", { userId: p.id, score: (i + 1) * 10 }), apiSetScoreBody);

    const all = expectOk(await api.get("getScores"), apiScoresBody);
    expect(all.scores).toEqual([
      { position: 1, userId: players[2].id, score: 30, updatedAt: expect.any(String), name: players[2].name, username: players[2].username },
      { position: 2, userId: players[1].id, score: 20, updatedAt: expect.any(String), name: players[1].name, username: players[1].username },
      { position: 3, userId: players[0].id, score: 10, updatedAt: expect.any(String), name: players[0].name, username: players[0].username },
    ]);
    expect(expectOk(await api.post("getScores"), apiScoresBody)).toEqual(all);

    expect(expectOk(await api.get("getScores", { limit: 2 }), apiScoresBody).scores.map((s) => s.score)).toEqual([30, 20]);
    expect(expectOk(await api.post("getScores", { limit: 1 }), apiScoresBody).scores.map((s) => s.score)).toEqual([30]);
    // limit < 1 → 1; 0 и мусор → по умолчанию (20).
    expect(expectOk(await api.get("getScores", { limit: -5 }), apiScoresBody).scores).toHaveLength(1);
    expect(expectOk(await api.get("getScores", { limit: 0 }), apiScoresBody).scores).toHaveLength(3);
    expect(expectOk(await api.get("getScores", { limit: "abc" as any }), apiScoresBody).scores).toHaveLength(3);
    expect(expectOk(await api.get("getScores", { limit: 1000 }), apiScoresBody).scores).toHaveLength(3);
  });

  test("по чату (chatId в query или теле); несуществующий чат → 404", async () => {
    const { baseUrl } = server();
    const { api } = await setup();
    const [p1, p2] = await registerUsers(baseUrl, 2);
    const chat = await createGroup(p1, [p2]);
    expectOk(await api.post("setScore", { userId: p1.id, score: 100 }), apiSetScoreBody);
    expectOk(await api.post("setScore", { userId: p2.id, score: 5, chatId: chat.id }), apiSetScoreBody);

    const viaQuery = expectOk(await api.get("getScores", { chatId: chat.id, userId: p1.id }), apiScoresBody).scores;
    expect(viaQuery.map((s) => [s.position, s.userId, s.score])).toEqual([[1, p2.id, 5]]);
    expect(expectOk(await api.post("getScores", { chatId: chat.id, userId: p2.id }), apiScoresBody).scores).toEqual(viaQuery);
    expect(expectOk(await api.get("getScores"), apiScoresBody).scores.map((s) => s.userId)).toEqual([p1.id, p2.id]);

    expectError(await api.get("getScores", { chatId: "c_nope12345678" }), 404, "chat not found");
    expectError(await api.post("getScores", { chatId: "c_nope12345678" }), 404, "chat not found");
    // Таблица чата — только от имени участника: без userId или с посторонним — как несуществующий чат.
    const outsider = await registerUser(baseUrl);
    expectError(await api.get("getScores", { chatId: chat.id }), 404, "chat not found");
    expectError(await api.get("getScores", { chatId: chat.id, userId: outsider.id }), 404, "chat not found");
    expectError(await api.post("getScores", { chatId: chat.id, userId: outsider.id }), 404, "chat not found");
  });

  test("рекорды одной игры не видны через токен другой", async () => {
    const { baseUrl } = server();
    const first = await setup();
    const second = await setup();
    const player = await registerUser(baseUrl);
    expectOk(await first.api.post("setScore", { userId: player.id, score: 77 }), apiSetScoreBody);
    expect(expectOk(await second.api.get("getScores"), apiScoresBody)).toEqual({ ok: true, scores: [] });
    expect(expectOk(await second.api.get("getStats"), apiStatsBody)).toEqual({ ok: true, plays: 0, players: 0, topScore: 0 });
  });
});

describe("deleteScore", () => {
  test("удаляет рекорды игрока в игре — общий и во всех чатах", async () => {
    const { baseUrl } = server();
    const { game, api } = await setup();
    const [p1, p2] = await registerUsers(baseUrl, 2);
    const chat = await createGroup(p1, [p2]);
    expectOk(await api.post("setScore", { userId: p1.id, score: 10, chatId: chat.id }), apiSetScoreBody);
    expectOk(await api.post("setScore", { userId: p2.id, score: 20 }), apiSetScoreBody);

    expectOk(await api.post("deleteScore", { userId: p1.id }), okBody);
    expect(expectOk(await p1.api.get(`/api/games/${game.id}/best`), bestBody)).toEqual({ best: 0 });
    expect(expectOk(await p1.api.get(`/api/games/${game.id}/best`, { query: { chatId: chat.id } }), bestBody)).toEqual({ best: 0 });
    expect(expectOk(await api.get("getScores"), apiScoresBody).scores.map((s) => s.userId)).toEqual([p2.id]);
    expect(expectOk(await api.get("getStats"), apiStatsBody)).toMatchObject({ players: 1, topScore: 20 });
  });

  test("без userId → 400; несуществующий userId → ok", async () => {
    const { api } = await setup();
    expectError(await api.post("deleteScore", {}), 400, "userId is required");
    expectOk(await api.post("deleteScore", { userId: "u_nope12345678" }), okBody);
  });
});
