// Управление ботами владельцем: /api/bots — создание, список, токен, правка,
// команды, удаление, рассылка, аудитория.
import { describe, expect, test } from "vitest";
import { audienceBody, botBody, botCommandsBody, botCreatedBody, botListBody, broadcastBody, commandsBody, meBody, tokenBody } from "../../schemas/bots";
import { chatCard } from "../../schemas/chats";
import { okBody } from "../../schemas/common";
import { wsMessageNew } from "../../schemas/messages";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { registerUser, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { download } from "../uploads/helpers";
import { uploadedUrl } from "../users/helpers";
import { BotClient, createBot, groupWithBot, startBot, wsPool } from "./helpers";

const server = useServer();
const ws = wsPool();

describe("доступ", () => {
  test("без сессии — 401 на всех маршрутах", async () => {
    const api = new Api(server().baseUrl);
    const id = "bot_whatever00";
    for (const res of [
      await api.get("/api/bots"),
      await api.post("/api/bots", { name: "x" }),
      await api.get(`/api/bots/${id}`),
      await api.get(`/api/bots/${id}/token`),
      await api.post(`/api/bots/${id}/regenerate-token`),
      await api.delete(`/api/bots/${id}`),
      await api.post(`/api/bots/${id}/broadcast`, { text: "x" }),
      await api.patch(`/api/bots/${id}`, { name: "x" }),
      await api.request("PUT", `/api/bots/${id}/commands`, { json: { commands: [] } }),
      await api.post(`/api/bots/${id}/app/open`, {}),
      await api.post(`/api/bots/${id}/app/data`, { data: "x" }),
      await api.get(`/api/bots/audience/${id}`),
    ]) {
      expectError(res, 401, "unauthorized");
    }
  });
});

describe("POST / — создание", () => {
  test("без имени — 400", async () => {
    const owner = await registerUser(server().baseUrl);
    for (const body of [{}, { name: "" }, { name: "   " }]) {
      expectError(await owner.api.post("/api/bots", body), 400, "Введите имя бота");
    }
    expect(expectOk(await owner.api.get("/api/bots"), botListBody).bots).toEqual([]);
  });

  test("бот и аккаунт бота; юзернейм из имени транслитом, повтор — с номером", async () => {
    const owner = await registerUser(server().baseUrl);
    const res = expectOk(await owner.api.post("/api/bots", { name: "  Погодный Бот  ", description: "  Прогноз  " }), botCreatedBody);
    expect(res.bot).toMatchObject({
      id: res.bot.userId,
      ownerId: owner.id,
      description: "Прогноз",
      commands: [],
      appUrl: null,
      appName: null,
      appCode: null,
    });
    expect(res.bot).not.toHaveProperty("code");
    expect(res.bot.user).toMatchObject({
      id: res.bot.id,
      name: "Погодный Бот",
      username: "pogodnyy_bot",
      bio: "Прогноз",
      isBot: true,
      // Боты в базе «в сети», но наружу всегда online: false и без lastSeen.
      online: false,
      avatarColor: "#6E56C6",
    });
    expect(res.bot.user).not.toHaveProperty("lastSeen");

    const again = expectOk(await owner.api.post("/api/bots", { name: "Погодный бот" }), botCreatedBody);
    expect(again.bot.user.username).toBe("pogodnyy_bot2");
    expect(again.token).not.toBe(res.token);
    // Из имени без латиницы/кириллицы — запасной юзернейм.
    const fallback = expectOk(await owner.api.post("/api/bots", { name: "🤖!!" }), botCreatedBody);
    expect(fallback.bot.user.username).toBe("bot_bot");

    // Токен сразу работает в Bot API.
    const me = expectOk(await new BotClient(server().baseUrl, res.token).get("me"), meBody);
    expect(me).toEqual({ bot: res.bot.user, app: null });
  });

  test("имя и аватар при создании проверяются так же, как в PATCH", async () => {
    const owner = await registerUser(server().baseUrl);
    const long = "Б".repeat(200);
    // Имя обрезается до 60, как в PATCH; аватар — только http(s), data: или загрузка.
    expectError(await owner.api.post("/api/bots", { name: long, avatarImage: "javascript:alert(1)" }), 400, "Некорректная ссылка на файл");
    const res = expectOk(await owner.api.post("/api/bots", { name: long, avatarImage: "data:image/png;base64,AAAA" }), botCreatedBody);
    expect(res.bot.user.name).toBe("Б".repeat(60));
    expect(res.bot.user.avatarImage).toBe("data:image/png;base64,AAAA");
    expectError(await owner.api.patch(`/api/bots/${res.bot.id}`, { avatarImage: "javascript:alert(1)" }), 400, "Некорректная ссылка на файл");
  });
});

describe("список, карточка, токен", () => {
  test("GET / — только свои, новые первыми; чужой бот — 404", async () => {
    const { baseUrl } = server();
    const [owner, other] = await registerUsers(baseUrl, 2);
    const first = await createBot(owner, "Первый");
    const second = await createBot(owner, "Второй");

    const list = expectOk(await owner.api.get("/api/bots"), botListBody).bots;
    expect(list.map((b) => b.id)).toEqual([second.id, first.id]);
    expect(list[1]).toEqual(first.bot);
    expect(expectOk(await other.api.get("/api/bots"), botListBody).bots).toEqual([]);

    expect(expectOk(await owner.api.get(`/api/bots/${first.id}`), botBody).bot).toEqual(first.bot);
    expectError(await other.api.get(`/api/bots/${first.id}`), 404, "not found");
    expectError(await owner.api.get("/api/bots/bot_nope0000"), 404, "not found");
  });

  test("токен: показать, перевыпустить — старый перестаёт работать", async () => {
    const { baseUrl } = server();
    const [owner, other] = await registerUsers(baseUrl, 2);
    const b = await createBot(owner, "Токенный");

    expect(expectOk(await owner.api.get(`/api/bots/${b.id}/token`), tokenBody).token).toBe(b.token);
    expectError(await other.api.get(`/api/bots/${b.id}/token`), 404, "not found");
    expectError(await other.api.post(`/api/bots/${b.id}/regenerate-token`), 404, "not found");

    const fresh = expectOk(await owner.api.post(`/api/bots/${b.id}/regenerate-token`), tokenBody).token;
    expect(fresh).not.toBe(b.token);
    expect(expectOk(await owner.api.get(`/api/bots/${b.id}/token`), tokenBody).token).toBe(fresh);
    expectError(await b.client.get("me"), 401, "Invalid bot token");
    expectOk(await new BotClient(baseUrl, fresh).get("me"), meBody);
  });
});

describe("PATCH /:id — правка", () => {
  test("имя, аватар, описание; чужой — 404", async () => {
    const { baseUrl } = server();
    const [owner, other] = await registerUsers(baseUrl, 2);
    const b = await createBot(owner, "Правка");
    expectError(await other.api.patch(`/api/bots/${b.id}`, { name: "Чужой" }), 404, "not found");

    let res = expectOk(
      await owner.api.patch(`/api/bots/${b.id}`, { name: `  ${"И".repeat(80)}  `, avatarImage: "https://img.example/a.png", description: `  ${"о".repeat(400)} ` }),
      botBody,
    ).bot;
    expect(res.user.name).toBe("И".repeat(60));
    expect(res.user.avatarImage).toBe("https://img.example/a.png");
    expect(res.description).toBe("о".repeat(300));
    // Описание бота — отдельное поле, bio аккаунта не меняется.
    expect(res.user.bio).toBe("");

    // Пустое имя игнорируется, пустой аватар снимает картинку.
    res = expectOk(await owner.api.patch(`/api/bots/${b.id}`, { name: "  ", avatarImage: "" }), botBody).bot;
    expect(res.user.name).toBe("И".repeat(60));
    expect(res.user).not.toHaveProperty("avatarImage");
    expect(expectOk(await owner.api.get(`/api/bots/${b.id}`), botBody).bot).toEqual(res);
  });

  test("аватар из /uploads — только своя или уже доступная загрузка; чужая неприкреплённая → 400", async () => {
    const { baseUrl } = server();
    const [owner, other] = await registerUsers(baseUrl, 2);
    const b = await createBot(owner, "Аватар");
    const theirs = await uploadedUrl(other);
    expectError(await owner.api.patch(`/api/bots/${b.id}`, { avatarImage: theirs }), 400, "Некорректная ссылка на файл");
    expectError(await owner.api.post("/api/bots", { name: "Чужой", avatarImage: theirs }), 400, "Некорректная ссылка на файл");
    expect(expectOk(await owner.api.get(`/api/bots/${b.id}`), botBody).bot.user).not.toHaveProperty("avatarImage");
    expect((await download(owner.api, theirs)).status).toBe(404);

    const mine = await uploadedUrl(owner);
    expect(expectOk(await owner.api.patch(`/api/bots/${b.id}`, { avatarImage: mine }), botBody).bot.user.avatarImage).toBe(mine);
    expect(expectOk(await owner.api.patch(`/api/bots/${b.id}`, { avatarImage: mine, name: "Снова" }), botBody).bot.user.avatarImage).toBe(mine);
  });

  test("юзернейм: только *_bot, формат, занятость", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const human = await registerUser(baseUrl, { username: `${"h".repeat(4)}${Date.now().toString(36)}_bot` });
    const b = await createBot(owner, "Юзер");
    const other = await createBot(owner, "Другой");

    expectError(await owner.api.patch(`/api/bots/${b.id}`, { username: "plain_name" }), 400, "Юзернейм бота должен заканчиваться на _bot");
    expectError(await owner.api.patch(`/api/bots/${b.id}`, { username: "bad-name_bot" }), 400, "Юзернейм: 3–32 символа, латинские буквы, цифры и _");
    expectError(await owner.api.patch(`/api/bots/${b.id}`, { username: other.username }), 409, "Этот юзернейм уже занят");
    expectError(await owner.api.patch(`/api/bots/${b.id}`, { username: human.username }), 409, "Этот юзернейм уже занят");
    expectError(await owner.api.patch(`/api/bots/${b.id}`, { username: "shalter_bot" }), 409, "Этот юзернейм зарезервирован — выберите другой");

    // Свой же юзернейм и @ в начале — можно.
    expect(expectOk(await owner.api.patch(`/api/bots/${b.id}`, { username: `@${b.username}` }), botBody).bot.user.username).toBe(b.username);
    const handle = `new${Date.now().toString(36)}_BOT`;
    expect(expectOk(await owner.api.patch(`/api/bots/${b.id}`, { username: handle }), botBody).bot.user.username).toBe(handle);
  });

  test("приложение: адрес или своя страница, одно сбрасывает другое", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const b = await createBot(owner, "Апп");
    const patch = (body: object) => owner.api.patch(`/api/bots/${b.id}`, body);

    expectError(await patch({ appUrl: "not a url" }), 400, "Некорректный адрес приложения");
    expectError(await patch({ appUrl: "http://example.com" }), 400, "Адрес приложения должен начинаться с https:// (http — только для localhost)");
    expectError(await patch({ appUrl: "https://u:p@example.com" }), 400, "В адресе приложения не должно быть логина и пароля");
    expectError(await patch({ appCode: "x".repeat(200_001) }), 400, "Страница длиннее 200 000 символов");

    let res = expectOk(await patch({ appUrl: "https://app.example.com/start", appName: `  ${"Н".repeat(50)}  ` }), botBody).bot;
    expect(res).toMatchObject({ appUrl: "https://app.example.com/start", appName: "Н".repeat(40), appCode: null });
    // http — только для localhost.
    res = expectOk(await patch({ appUrl: "http://localhost:3000" }), botBody).bot;
    expect(res).toMatchObject({ appUrl: "http://localhost:3000/", appName: null });

    res = expectOk(await patch({ appCode: "<p>Привет</p>", appName: "Страница" }), botBody).bot;
    expect(res).toMatchObject({ appUrl: null, appCode: "<p>Привет</p>", appName: "Страница" });
    // appCode важнее appUrl в одном запросе.
    res = expectOk(await patch({ appCode: "<b>2</b>", appUrl: "https://ignored.example" }), botBody).bot;
    expect(res).toMatchObject({ appUrl: null, appCode: "<b>2</b>", appName: null });

    // Пустой адрес убирает приложение целиком (и страницу тоже).
    res = expectOk(await patch({ appUrl: "" }), botBody).bot;
    expect(res).toMatchObject({ appUrl: null, appCode: null, appName: null });
    // Без полей приложения оно не трогается.
    expectOk(await patch({ appUrl: "https://a.example" }), botBody);
    expect(expectOk(await patch({ description: "x" }), botBody).bot.appUrl).toBe("https://a.example/");
  });
});

describe("PUT /:id/commands", () => {
  test("нормализация команд; видны в карточке лички и в Bot API", async () => {
    const { baseUrl } = server();
    const [owner, user, other] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Командный");
    const dm = await startBot(user, b);
    const put = (u: typeof owner, body: unknown) => u.api.request("PUT", `/api/bots/${b.id}/commands`, { json: body });

    expectError(await put(other, { commands: [] }), 404, "not found");
    // Без команд в карточке лички commands: null.
    expect(expectOk(await user.api.get(`/api/chats/${dm.id}`), chatCard).commands).toBeNull();

    const res = expectOk(
      await put(owner, {
        commands: [
          { command: " /Start ", description: "  Начать  " },
          { command: "hello world!", description: "x".repeat(200) },
          { command: "Ёж" },
          { command: "", description: "пусто" },
          null,
          { command: "a".repeat(40) },
        ],
      }),
      botCommandsBody,
    );
    expect(res.bot.commands).toEqual([
      { command: "start", description: "Начать" },
      { command: "helloworld", description: "x".repeat(120) },
      { command: "a".repeat(32), description: "" },
    ]);
    expect(res.bot).not.toHaveProperty("user");

    expect(expectOk(await user.api.get(`/api/chats/${dm.id}`), chatCard).commands).toEqual(res.bot.commands);
    expect(expectOk(await b.client.get("getMyCommands"), commandsBody).commands).toEqual(res.bot.commands);

    // Не массив — список очищается; больше 100 — обрезается.
    expect(expectOk(await put(owner, { commands: "start" }), botCommandsBody).bot.commands).toEqual([]);
    const many = Array.from({ length: 120 }, (_, i) => ({ command: `c${i}` }));
    expect(expectOk(await put(owner, { commands: many }), botCommandsBody).bot.commands).toHaveLength(100);
  });
});

describe("DELETE /:id", () => {
  test("удаляет бота и его аккаунт; токен больше не работает", async () => {
    const { baseUrl } = server();
    const [owner, other] = await registerUsers(baseUrl, 2);
    const b = await createBot(owner, "Удаляемый");
    expectError(await other.api.delete(`/api/bots/${b.id}`), 404, "not found");

    expectOk(await owner.api.delete(`/api/bots/${b.id}`), okBody);
    expectError(await owner.api.get(`/api/bots/${b.id}`), 404, "not found");
    expect(expectOk(await owner.api.get("/api/bots"), botListBody).bots).toEqual([]);
    expectError(await b.client.get("me"), 401, "Invalid bot token");
    expectError(await owner.api.get(`/api/bots/audience/${b.id}`), 404, "Это не бот");
    expectError(await owner.api.delete(`/api/bots/${b.id}`), 404, "not found");
  });
});

describe("POST /:id/broadcast — рассылка", () => {
  test("проверки текста; без аудитории — sent: 0 и без паузы", async () => {
    const { baseUrl } = server();
    const [owner, other] = await registerUsers(baseUrl, 2);
    const b = await createBot(owner, "Рассыльщик");
    const send = (text: unknown) => owner.api.post(`/api/bots/${b.id}/broadcast`, { text });

    expectError(await other.api.post(`/api/bots/${b.id}/broadcast`, { text: "x" }), 404, "not found");
    expectError(await send("   "), 400, "Введите текст рассылки");
    expectError(await send(undefined), 400, "Введите текст рассылки");
    expectError(await send("x".repeat(4097)), 400, "Не длиннее 4096 символов");

    expect(expectOk(await send("никому"), broadcastBody)).toEqual({ ok: true, sent: 0 });
    // Ничего не ушло — ждать минуту не нужно.
    expect(expectOk(await send("снова никому"), broadcastBody)).toEqual({ ok: true, sent: 0 });
  });

  test("доходит тем, кто запустил бота, кроме заблокировавших; потом — пауза 429", async () => {
    const { baseUrl } = server();
    const [owner, fan, blocker, groupMate, outsider] = await registerUsers(baseUrl, 5);
    const b = await createBot(owner, "Новостной");
    const fanDm = await startBot(fan, b);
    const blockerDm = await startBot(blocker, b);
    await groupWithBot(owner, [groupMate], b);
    expect((await blocker.api.post(`/api/users/${b.id}/block`, { blocked: true })).status).toBe(200);
    const [fanWs, blockerWs, mateWs, outWs] = await Promise.all([ws(fan), ws(blocker), ws(groupMate), ws(outsider)]);

    // Рассылка идёт только по личкам: участники групп с ботом её не получают.
    expect(expectOk(await owner.api.post(`/api/bots/${b.id}/broadcast`, { text: "  Новости дня  " }), broadcastBody)).toEqual({ ok: true, sent: 1 });
    const ev = expectShape(wsMessageNew, await fanWs.waitFor("message:new", (e) => e.chatId === fanDm.id));
    expect(ev.message).toMatchObject({ senderId: b.id, text: "Новости дня", type: "text", readByIds: [] });
    await Promise.all([
      blockerWs.expectNone("message:new", (e) => e.chatId === blockerDm.id),
      mateWs.expectNone("message:new"),
      outWs.expectNone("message:new"),
    ]);
    const history = (await fan.api.get(`/api/chats/${fanDm.id}/messages`)).body.messages;
    expect(history.map((m: any) => m.text)).toEqual(["Новости дня"]);

    const again = await owner.api.post(`/api/bots/${b.id}/broadcast`, { text: "ещё" });
    expectError(again, 429, /^Следующую рассылку можно отправить через \d+ с$/);
  });
});

describe("GET /audience/:userId", () => {
  test("число собеседников бота для любого пользователя; не бот — 404", async () => {
    const { baseUrl } = server();
    const [owner, a, c, stranger] = await registerUsers(baseUrl, 4);
    const b = await createBot(owner, "Аудитория");
    const audience = () => stranger.api.get(`/api/bots/audience/${b.id}`);
    const body = audienceBody;

    expect(expectOk(await audience(), body)).toEqual({ users: 0, app: null });
    await startBot(a, b);
    // Группа: владелец и c; a уже посчитан — считаются разные люди во всех чатах бота.
    await groupWithBot(owner, [a, c], b);
    expect(expectOk(await audience(), body)).toEqual({ users: 3, app: null });

    await owner.api.patch(`/api/bots/${b.id}`, { appUrl: "https://app.example.com" });
    expect(expectOk(await audience(), body).app).toEqual({ name: "Приложение" });
    await owner.api.patch(`/api/bots/${b.id}`, { appUrl: "https://app.example.com", appName: "Магазин" });
    expect(expectOk(await audience(), body).app).toEqual({ name: "Магазин" });

    expectError(await stranger.api.get(`/api/bots/audience/${owner.id}`), 404, "Это не бот");
    expectError(await stranger.api.get("/api/bots/audience/bot_nope0000"), 404, "Это не бот");
  });
});
