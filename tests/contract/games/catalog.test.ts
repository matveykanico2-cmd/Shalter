// Игры: каталог, поиск, свои игры, создание, правка метаданных, токен Game API,
// удаление (server/routes/games.js) и страница /games (server/index.js).
// WS-событий модуль не шлёт — побочные эффекты видны только через API.
import { describe, expect, test } from "vitest";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape, expectStatus } from "../../support/expect";
import { registerUser, registerUsers, uniq } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { okBody } from "../../schemas/common";
import { builtinGame, builtinGameFull, game, gameAnyBody, gameBody, gameMetaBody, gamesBody, gameTokenBody, scoreBody } from "../../schemas/games";
import { BUILTIN_IDS, NOT_FOUND, createGame, gameApi, issueToken } from "./helpers";

const server = useServer();

describe("без сессии", () => {
  const routes: Array<[string, string]> = [
    ["GET", "/api/games"],
    ["GET", "/api/games?q=змейка"],
    ["GET", "/api/games/mine"],
    ["GET", "/api/games/builtin-2048"],
    ["POST", "/api/games"],
    ["PATCH", "/api/games/g_x/meta"],
    ["POST", "/api/games/g_x/token"],
    ["GET", "/api/games/builtin-2048/best"],
    ["DELETE", "/api/games/g_x"],
    ["POST", "/api/games/builtin-2048/play"],
    ["POST", "/api/games/builtin-2048/score"],
    ["GET", "/api/games/builtin-2048/scores"],
  ];
  test.each(routes)("%s %s → 401 unauthorized", async (method, path) => {
    const api = new Api(server().baseUrl);
    expectError(await api.request(method, path, method === "GET" ? {} : { json: {} }), 401, "unauthorized");
  });
});

describe("страница /games", () => {
  test("GET /games → 301 на /games/; GET /games/ → 200 html документации без сессии", async () => {
    const api = new Api(server().baseUrl);
    // ПОВЕДЕНИЕ-ВОПРОС: express.static стоит раньше app.get("/games") и видит каталог
    // public/games (встроенные игры) — поэтому /games отвечает 301 на /games/, а страница
    // документации отдаётся уже по /games/ (нестрогий роутинг Express). Для /knowledge
    // так же было и чинилось маршрутом до static.
    const redirect = await api.get("/games");
    expectStatus(redirect, 301);
    expect(redirect.headers.get("location")).toBe("/games/");

    const res = await api.get("/games/");
    expectStatus(res, 200);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    expect(res.text).toContain("<title>Shalter Games — документация</title>");
  });
});

describe("каталог", () => {
  test("встроенные игры идут первыми; чужие опубликованные видны, неопубликованные — нет", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const pub = await createGame(a, { title: uniq("Публичная"), isPublic: true });
    const priv = await createGame(a, { title: uniq("Скрытая") });

    const games = expectOk(await b.api.get("/api/games"), gamesBody).games;
    expect(games.slice(0, 3).map((g) => g.id)).toEqual(BUILTIN_IDS);
    for (const g of games.slice(0, 3)) expectShape(builtinGame, g, "встроенная игра");
    expect(games[0]).toEqual({ id: "builtin-2048", title: "2048", emoji: "🔢", description: "Складывайте плитки до 2048", builtin: true, isPublic: true });
    expect(games[1]).toMatchObject({ id: "builtin-snake", title: "Змейка", emoji: "🐍" });
    expect(games[2]).toMatchObject({ id: "builtin-flappy", title: "Shalter Bird", emoji: "🐦" });

    const found = games.find((g) => g.id === pub.id);
    // В каталоге своя игра без кода.
    expect(expectShape(game, found, "опубликованная игра")).toEqual({ ...pub, code: undefined });
    expect(found).not.toHaveProperty("code");
    expect(games.some((g) => g.id === priv.id)).toBe(false);
    // Даже владельцу каталог не показывает неопубликованную.
    expect(expectOk(await a.api.get("/api/games"), gamesBody).games.some((g) => g.id === priv.id)).toBe(false);
  });

  test("свои опубликованные упорядочены по числу запусков", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const less = await createGame(a, { title: uniq("Меньше"), isPublic: true });
    const more = await createGame(a, { title: uniq("Больше"), isPublic: true });
    for (let i = 0; i < 3; i++) expectOk(await a.api.post(`/api/games/${more.id}/play`), okBody);
    expectOk(await a.api.post(`/api/games/${less.id}/play`), okBody);

    const ids = expectOk(await a.api.get("/api/games"), gamesBody).games.map((g) => g.id);
    expect(ids.indexOf(more.id)).toBeLessThan(ids.indexOf(less.id));
    expect(ids.indexOf(more.id)).toBeGreaterThanOrEqual(3);
  });
});

describe("поиск ?q=", () => {
  test("встроенные по описанию; свои неопубликованные — только владельцу; чужие опубликованные — всем", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const tag = uniq("zq").toLowerCase();
    const pub = await createGame(a, { title: `Pub ${tag}`, isPublic: true });
    const priv = await createGame(a, { title: "Private", description: `about ${tag}` });

    const byOwner = expectOk(await a.api.get("/api/games", { query: { q: tag.toUpperCase() } }), gamesBody).games;
    expect(byOwner.map((g) => g.id).sort()).toEqual([pub.id, priv.id].sort());
    for (const g of byOwner) expect(g).not.toHaveProperty("code");

    const byOther = expectOk(await b.api.get("/api/games", { query: { q: `  ${tag}  ` } }), gamesBody).games;
    expect(byOther.map((g) => g.id)).toEqual([pub.id]);

    // Встроенная находится по описанию, без учёта регистра.
    const snake = expectOk(await b.api.get("/api/games", { query: { q: "ЯБЛОКИ" } }), gamesBody).games;
    expect(snake).toEqual([{ id: "builtin-snake", title: "Змейка", emoji: "🐍", description: "Классика: собирайте яблоки и растите", builtin: true, isPublic: true }]);

    expect(expectOk(await b.api.get("/api/games", { query: { q: uniq("nothing") } }), gamesBody)).toEqual({ games: [] });
  });

  test("q из одних пробелов — обычный каталог", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const games = expectOk(await a.api.get("/api/games", { query: { q: "   " } }), gamesBody).games;
    expect(games.slice(0, 3).map((g) => g.id)).toEqual(BUILTIN_IDS);
  });

  test("поиск по кириллице без учёта регистра — и в названии, и в описании", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const g = await createGame(a, { title: "Космолётище", description: "Гонка ПО Галактике", isPublic: true });
    for (const q of ["космолётище", "КОСМОЛЁТИЩЕ", "КосмоЛёт", "осмолётищ", "по галактике", "ГАЛАКТ"]) {
      expect(expectOk(await b.api.get("/api/games", { query: { q } }), gamesBody).games.map((x) => x.id), q).toEqual([g.id]);
    }
  });

  test("% и _ вырезаются из запроса: q=% находит все доступные свои игры", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const priv = await createGame(a, { title: uniq("Скрытая") });
    // ПОВЕДЕНИЕ-ВОПРОС: из шаблона LIKE вырезаются % и _, и q="%" превращается в «%%» —
    // совпадение со всеми опубликованными и своими играми (встроенные при этом не находятся).
    const own = expectOk(await a.api.get("/api/games", { query: { q: "%" } }), gamesBody).games;
    expect(own.some((g) => g.id === priv.id)).toBe(true);
    expect(own.some((g) => BUILTIN_IDS.includes(g.id))).toBe(false);
    expect(expectOk(await b.api.get("/api/games", { query: { q: "%" } }), gamesBody).games.some((g) => g.id === priv.id)).toBe(false);
  });
});

describe("создание", () => {
  test("POST → игра с кодом; поля по умолчанию; видна в /mine (без кода) и в GET /:id (с кодом)", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const before = Date.now();
    const res = expectOk(await a.api.post("/api/games", { title: "  Моя игра  ", code: "<p>hi</p>" }), gameBody).game;
    expect(res).toEqual({
      id: expect.any(String),
      ownerId: a.id,
      title: "Моя игра",
      description: "",
      emoji: "🎮",
      code: "<p>hi</p>",
      isPublic: false,
      plays: 0,
      createdAt: expect.any(String),
      updatedAt: res.createdAt,
    });
    expect(Date.parse(res.createdAt)).toBeGreaterThanOrEqual(before - 1000);

    const mine = expectOk(await a.api.get("/api/games/mine"), gamesBody).games;
    expect(mine).toHaveLength(1);
    expect(expectShape(game, mine[0])).toEqual({ ...res, code: undefined });
    expect(mine[0]).not.toHaveProperty("code");

    expect(expectOk(await a.api.get(`/api/games/${res.id}`), gameAnyBody)).toEqual({ game: res });
  });

  test("обрезка: название до 64, описание до 200, эмодзи до 2 символов; isPublic приводится к bool", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const g = await createGame(a, { title: "т".repeat(100), description: `  ${"о".repeat(300)}  `, emoji: " 🎲🎯🎮 ", isPublic: "yes" });
    expect(g).toMatchObject({ title: "т".repeat(64), description: "о".repeat(200), emoji: "🎲🎯", isPublic: true });
    const blank = await createGame(a, { emoji: "   ", isPublic: 0 });
    expect(blank).toMatchObject({ emoji: "🎮", isPublic: false });
  });

  test("без кода игра создаётся с пустым code", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    // ПОВЕДЕНИЕ-ВОПРОС: POST /api/games не требует кода (Game API updateGame требует от 1 байта);
    // игра с пустым code сохраняется и попадает в каталог.
    const res = expectOk(await a.api.post("/api/games", { title: "Пустая" }), gameBody).game;
    expect(res.code).toBe("");
  });

  test("ошибки: нет названия, код больше 512 КБ", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    expectError(await a.api.post("/api/games", { code: "x" }), 400, "Введите название игры");
    expectError(await a.api.post("/api/games", { title: "   ", code: "x" }), 400, "Введите название игры");
    expectError(await a.api.post("/api/games", { title: "Большая", code: "x".repeat(512 * 1024 + 1) }), 400, "Игра слишком большая (до 512 КБ)");
    // Ровно 512 КБ — можно.
    expect((await createGame(a, { code: "x".repeat(512 * 1024) })).code).toHaveLength(512 * 1024);
    // ПОВЕДЕНИЕ-ВОПРОС: лимит размера проверяется только для кода, где есть не-пробельные
    // символы, — код из одних пробелов больше 512 КБ сохраняется целиком.
    expect((await createGame(a, { code: " ".repeat(512 * 1024 + 10) })).code).toHaveLength(512 * 1024 + 10);
    // Ни одна неудачная попытка не создала игру.
    expect(expectOk(await a.api.get("/api/games/mine"), gamesBody).games).toHaveLength(2);
  });

  test("не больше 50 своих игр", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    for (let i = 0; i < 50; i++) await createGame(a, { title: `Игра ${i}` });
    expectError(await a.api.post("/api/games", { title: "51-я", code: "x" }), 400, "Не больше 50 своих игр");
    expect(expectOk(await a.api.get("/api/games/mine"), gamesBody).games).toHaveLength(50);
    // Лимит на человека: другой создаёт спокойно.
    await createGame(await registerUser(baseUrl));
  });
});

describe("свои игры и просмотр", () => {
  test("/mine — только свои, новые сверху; у другого пусто", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const first = await createGame(a, { title: "Первая" });
    // updatedAt с точностью до миллисекунды — разводим время создания.
    await new Promise((r) => setTimeout(r, 15));
    const second = await createGame(a, { title: "Вторая", isPublic: true });
    expect(expectOk(await a.api.get("/api/games/mine"), gamesBody).games.map((g) => g.id)).toEqual([second.id, first.id]);
    expect(expectOk(await b.api.get("/api/games/mine"), gamesBody)).toEqual({ games: [] });
  });

  test("GET /:id: встроенная — с файлом, кодом и ownerId: null", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const res = expectOk(await a.api.get("/api/games/builtin-snake"), gameAnyBody).game;
    expectShape(builtinGameFull, res);
    expect(res).toMatchObject({ id: "builtin-snake", file: "snake.html", ownerId: null, builtin: true, isPublic: true });
    expect((res as any).code).toMatch(/<html|<!doctype/i);
  });

  test("GET /:id чужой неопубликованной игры открывается по id (с кодом)", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const priv = await createGame(a, { code: "<secret/>" });
    expect(expectOk(await b.api.get(`/api/games/${priv.id}`), gameAnyBody).game).toEqual(priv);
  });

  test("GET /:id несуществующей → 404", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    expectError(await a.api.get("/api/games/g_nope12345678"), 404, NOT_FOUND);
    expectError(await a.api.get("/api/games/builtin-tetris"), 404, NOT_FOUND);
  });
});

describe("PATCH /:id/meta", () => {
  test("меняет метаданные, но не код; ответ — без кода; изменения видны в /:id и в каталоге", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const g = await createGame(a, { title: "Старое", description: "старое", code: "<keep/>" });
    const res = expectOk(
      await a.api.patch(`/api/games/${g.id}/meta`, { title: "  Новое  ", description: " новое ", emoji: "🚀🛸👾", isPublic: true, code: "<ignored/>" }),
      gameMetaBody,
    ).game;
    expect(res).toEqual({ ...g, code: undefined, title: "Новое", description: "новое", emoji: "🚀🛸", isPublic: true, updatedAt: expect.any(String) });
    expect(res).not.toHaveProperty("code");
    expect(Date.parse(res.updatedAt)).toBeGreaterThanOrEqual(Date.parse(g.updatedAt));

    expect(expectOk(await b.api.get(`/api/games/${g.id}`), gameAnyBody).game).toEqual({ ...res, code: "<keep/>" });
    expect(expectOk(await b.api.get("/api/games"), gamesBody).games.some((x) => x.id === g.id)).toBe(true);
  });

  test("поля, которых нет в теле, сбрасываются: описание пустеет, игра снимается с публикации", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const g = await createGame(a, { description: "описание", emoji: "🎲", isPublic: true });
    // ПОВЕДЕНИЕ-ВОПРОС: PATCH работает как полная замена — без description/emoji/isPublic
    // описание стирается, эмодзи становится 🎮, а игра снимается с публикации.
    const res = expectOk(await a.api.patch(`/api/games/${g.id}/meta`, { title: "Только название" }), gameMetaBody).game;
    expect(res).toMatchObject({ title: "Только название", description: "", emoji: "🎮", isPublic: false });
    expect(expectOk(await a.api.get("/api/games"), gamesBody).games.some((x) => x.id === g.id)).toBe(false);
  });

  test("ошибки: пустое название → 400; чужая, встроенная, несуществующая → 404 (раньше проверки названия)", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const g = await createGame(a, { title: "Оригинал" });
    expectError(await a.api.patch(`/api/games/${g.id}/meta`, { title: "  " }), 400, "Введите название игры");
    expectError(await b.api.patch(`/api/games/${g.id}/meta`, { title: "Захват" }), 404, NOT_FOUND);
    expectError(await b.api.patch(`/api/games/${g.id}/meta`, {}), 404, NOT_FOUND);
    expectError(await a.api.patch("/api/games/builtin-2048/meta", { title: "Моя 2048" }), 404, NOT_FOUND);
    expectError(await a.api.patch("/api/games/g_nope12345678/meta", { title: "x" }), 404, NOT_FOUND);
    expect(expectOk(await a.api.get(`/api/games/${g.id}`), gameAnyBody).game).toEqual(g);
  });
});

describe("POST /:id/token", () => {
  test("владельцу — токен game_…; каждый вызов даёт новый", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const g = await createGame(a);
    const t1 = expectOk(await a.api.post(`/api/games/${g.id}/token`), gameTokenBody).token;
    const t2 = expectOk(await a.api.post(`/api/games/${g.id}/token`), gameTokenBody).token;
    expect(t2).not.toBe(t1);
  });

  test("чужая, встроенная, несуществующая → 404", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const g = await createGame(a);
    expectError(await b.api.post(`/api/games/${g.id}/token`), 404, NOT_FOUND);
    expectError(await a.api.post("/api/games/builtin-snake/token"), 404, NOT_FOUND);
    expectError(await a.api.post("/api/games/g_nope12345678/token"), 404, NOT_FOUND);
  });
});

describe("DELETE /:id", () => {
  test("удаляет игру, рекорды и токен Game API", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const g = await createGame(a, { isPublic: true });
    const token = await issueToken(a, g.id);
    expectOk(await b.api.post(`/api/games/${g.id}/score`, { score: 10 }), scoreBody);

    expectError(await b.api.delete(`/api/games/${g.id}`), 404, NOT_FOUND);
    expectOk(await a.api.delete(`/api/games/${g.id}`), okBody);

    expectError(await a.api.get(`/api/games/${g.id}`), 404, NOT_FOUND);
    expect(expectOk(await a.api.get("/api/games/mine"), gamesBody)).toEqual({ games: [] });
    expect(expectOk(await b.api.get("/api/games"), gamesBody).games.some((x) => x.id === g.id)).toBe(false);
    expectError(await gameApi(baseUrl, token).get("getGame"), 401, "Invalid game token");
    // Рекорды удалены (сам /scores существование игры не проверяет).
    expect((await b.api.get(`/api/games/${g.id}/scores`)).body).toEqual({ scores: [] });
    expect((await b.api.get(`/api/games/${g.id}/best`)).body).toEqual({ best: 0 });

    expectError(await a.api.delete(`/api/games/${g.id}`), 404, NOT_FOUND);
  });

  test("встроенную удалить нельзя", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    expectError(await a.api.delete("/api/games/builtin-2048"), 404, NOT_FOUND);
    expectOk(await a.api.get("/api/games/builtin-2048"), gameAnyBody);
  });
});
