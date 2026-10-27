// Игры: запуски и рекорды — POST /:id/play, POST /:id/score, GET /:id/best,
// GET /:id/scores (server/routes/games.js). Рекорд общий (без chatId) и в чате,
// где отправили карточку игры (только участникам чата).
import { describe, expect, test } from "vitest";
import { expectError, expectOk } from "../../support/expect";
import { createDm, createGroup, registerUser, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { okBody } from "../../schemas/common";
import { bestBody, gameAnyBody, gamesBody, scoreBody, scoresBody } from "../../schemas/games";
import { CHAT_NOT_FOUND, NOT_FOUND, createGame } from "./helpers";

const server = useServer();

describe("POST /:id/play", () => {
  test("считает запуски своей игры — от любого, и по неопубликованной тоже", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const g = await createGame(a);
    expectOk(await a.api.post(`/api/games/${g.id}/play`), okBody);
    expectOk(await b.api.post(`/api/games/${g.id}/play`), okBody);
    expectOk(await b.api.post(`/api/games/${g.id}/play`), okBody);
    expect(expectOk(await a.api.get(`/api/games/${g.id}`), gameAnyBody).game).toMatchObject({ plays: 3 });
    expect(expectOk(await a.api.get("/api/games/mine"), gamesBody).games[0]).toMatchObject({ id: g.id, plays: 3 });
  });

  test("встроенная — ok без счётчика; несуществующая → 404", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    expectOk(await a.api.post("/api/games/builtin-2048/play"), okBody);
    expect(expectOk(await a.api.get("/api/games/builtin-2048"), gameAnyBody).game).not.toHaveProperty("plays");
    expectError(await a.api.post("/api/games/g_nope12345678/play"), 404, NOT_FOUND);
    expectError(await a.api.post("/api/games/builtin-tetris/play"), 404, NOT_FOUND);
  });
});

describe("POST /:id/score и GET /:id/best — общий рекорд", () => {
  test("сохраняется только лучший результат; improved — побит ли прежний", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const g = await createGame(a);
    expect(expectOk(await a.api.get(`/api/games/${g.id}/best`), bestBody)).toEqual({ best: 0 });

    expect(expectOk(await a.api.post(`/api/games/${g.id}/score`, { score: 100 }), scoreBody)).toEqual({ best: 100, improved: true });
    expect(expectOk(await a.api.post(`/api/games/${g.id}/score`, { score: 50 }), scoreBody)).toEqual({ best: 100, improved: false });
    expect(expectOk(await a.api.post(`/api/games/${g.id}/score`, { score: 100 }), scoreBody)).toEqual({ best: 100, improved: false });
    expect(expectOk(await a.api.post(`/api/games/${g.id}/score`, { score: 150 }), scoreBody)).toEqual({ best: 150, improved: true });
    expect(expectOk(await a.api.get(`/api/games/${g.id}/best`), bestBody)).toEqual({ best: 150 });
  });

  test("рекорд у каждого свой", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const g = await createGame(a);
    expectOk(await a.api.post(`/api/games/${g.id}/score`, { score: 7 }), scoreBody);
    expect(expectOk(await b.api.get(`/api/games/${g.id}/best`), bestBody)).toEqual({ best: 0 });
    expect(expectOk(await b.api.post(`/api/games/${g.id}/score`, { score: 3 }), scoreBody)).toEqual({ best: 3, improved: true });
  });

  test("счёт: дробный округляется вниз, строка-число принимается, границы 0…1e9", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const g = await createGame(a);
    expect(expectOk(await a.api.post(`/api/games/${g.id}/score`, { score: 0 }), scoreBody)).toEqual({ best: 0, improved: true });
    expect(expectOk(await a.api.post(`/api/games/${g.id}/score`, { score: 12.9 }), scoreBody)).toEqual({ best: 12, improved: true });
    expect(expectOk(await a.api.post(`/api/games/${g.id}/score`, { score: "42" }), scoreBody)).toEqual({ best: 42, improved: true });
    expect(expectOk(await a.api.post(`/api/games/${g.id}/score`, { score: 1_000_000_000 }), scoreBody)).toEqual({ best: 1_000_000_000, improved: true });
  });

  test("некорректный счёт → 400, рекорд не меняется", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const g = await createGame(a);
    expectOk(await a.api.post(`/api/games/${g.id}/score`, { score: 5 }), scoreBody);
    for (const score of [undefined, null, "", "  ", true, false, [5], "abc", -1, 1_000_000_001, 1e300, [1, 2], {}]) {
      expectError(await a.api.post(`/api/games/${g.id}/score`, { score }), 400, "Некорректный счёт");
    }
    expect(expectOk(await a.api.get(`/api/games/${g.id}/best`), bestBody)).toEqual({ best: 5 });
  });

  test("несуществующая игра: score, best и scores → 404 (раньше проверки счёта и чата)", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    expectError(await a.api.post("/api/games/g_nope12345678/score", { score: "abc" }), 404, NOT_FOUND);
    expectError(await a.api.get("/api/games/g_nope12345678/best"), 404, NOT_FOUND);
    expectError(await a.api.get("/api/games/g_nope12345678/scores"), 404, NOT_FOUND);
    expectError(await a.api.get("/api/games/g_nope12345678/best", { query: { chatId: "c_nope12345678" } }), 404, NOT_FOUND);
  });

  test("встроенные игры тоже хранят рекорды", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    expect(expectOk(await a.api.post("/api/games/builtin-flappy/score", { score: 9 }), scoreBody)).toEqual({ best: 9, improved: true });
    expect(expectOk(await a.api.get("/api/games/builtin-flappy/best"), bestBody)).toEqual({ best: 9 });
    const scores = expectOk(await a.api.get("/api/games/builtin-flappy/scores"), scoresBody).scores;
    expect(scores.find((s) => s.userId === a.id)).toMatchObject({ score: 9 });
  });
});

describe("рекорды в чате (chatId)", () => {
  test("в чате — отдельный рекорд; результат идёт и в общий; ответ — по чату", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const g = await createGame(a);
    const chat = await createGroup(a, [b]);
    expectOk(await a.api.post(`/api/games/${g.id}/score`, { score: 100 }), scoreBody);

    // В чате рекорда ещё нет: 50 его ставит, хотя общий (100) не побит.
    expect(expectOk(await a.api.post(`/api/games/${g.id}/score`, { score: 50, chatId: chat.id }), scoreBody)).toEqual({ best: 50, improved: true });
    expect(expectOk(await a.api.get(`/api/games/${g.id}/best`, { query: { chatId: chat.id } }), bestBody)).toEqual({ best: 50 });
    expect(expectOk(await a.api.get(`/api/games/${g.id}/best`), bestBody)).toEqual({ best: 100 });

    // Результат в чате выше общего — обновляются оба.
    expect(expectOk(await a.api.post(`/api/games/${g.id}/score`, { score: 120, chatId: chat.id }), scoreBody)).toEqual({ best: 120, improved: true });
    expect(expectOk(await a.api.get(`/api/games/${g.id}/best`), bestBody)).toEqual({ best: 120 });

    // Таблица чата видна участникам.
    const inChat = expectOk(await b.api.get(`/api/games/${g.id}/scores`, { query: { chatId: chat.id } }), scoresBody).scores;
    expect(inChat.map((s) => [s.userId, s.score])).toEqual([[a.id, 120]]);
  });

  test("чужой или несуществующий чат → 404 «Чат не найден», ничего не пишется", async () => {
    const { baseUrl } = server();
    const [a, b, c] = await registerUsers(baseUrl, 3);
    const g = await createGame(a);
    const dm = await createDm(a, b);
    for (const chatId of [dm.id, "c_nope12345678"]) {
      expectError(await c.api.post(`/api/games/${g.id}/score`, { score: 10, chatId }), 404, CHAT_NOT_FOUND);
      expectError(await c.api.get(`/api/games/${g.id}/best`, { query: { chatId } }), 404, CHAT_NOT_FOUND);
      expectError(await c.api.get(`/api/games/${g.id}/scores`, { query: { chatId } }), 404, CHAT_NOT_FOUND);
    }
    expect(expectOk(await c.api.get(`/api/games/${g.id}/best`), bestBody)).toEqual({ best: 0 });
    expect(expectOk(await c.api.get(`/api/games/${g.id}/scores`), scoresBody)).toEqual({ scores: [] });
    // Некорректный счёт проверяется раньше чата.
    expectError(await c.api.post(`/api/games/${g.id}/score`, { score: -5, chatId: dm.id }), 400, "Некорректный счёт");
  });
});

describe("GET /:id/scores", () => {
  test("по убыванию счёта, с именем и цветом аватара; видна всем, кроме чатовых", async () => {
    const { baseUrl } = server();
    const [a, b, c] = await registerUsers(baseUrl, 3);
    const g = await createGame(a);
    expectOk(await a.api.post(`/api/games/${g.id}/score`, { score: 10 }), scoreBody);
    expectOk(await b.api.post(`/api/games/${g.id}/score`, { score: 30 }), scoreBody);
    expectOk(await c.api.post(`/api/games/${g.id}/score`, { score: 20 }), scoreBody);

    const scores = expectOk(await c.api.get(`/api/games/${g.id}/scores`), scoresBody).scores;
    expect(scores.map((s) => [s.userId, s.score])).toEqual([[b.id, 30], [c.id, 20], [a.id, 10]]);
    expect(scores[0]).toEqual({ userId: b.id, score: 30, updatedAt: expect.any(String), name: b.name, avatarColor: b.self.avatarColor });
    expect(scores[0]).not.toHaveProperty("avatarImage");
  });

  test("не больше 20 строк", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const g = await createGame(a);
    const users = await registerUsers(baseUrl, 21);
    for (const [i, u] of users.entries()) expectOk(await u.api.post(`/api/games/${g.id}/score`, { score: i + 1 }), scoreBody);
    const scores = expectOk(await a.api.get(`/api/games/${g.id}/scores`), scoresBody).scores;
    expect(scores).toHaveLength(20);
    expect(scores[0]).toMatchObject({ userId: users[20].id, score: 21 });
    expect(scores.some((s) => s.userId === users[0].id)).toBe(false);
  });
});
