// Мини-приложения ботов: настройка (PATCH /api/bots, Bot API setWebApp /
// setWebAppCode), открытие с подписанным initData (POST /api/bots/:id/app/open),
// проверка подписи ботом (checkWebAppData), данные из приложения в личку
// (POST /api/bots/:id/app/data) и хостинг своей страницы (/app/:username).
import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import { appBody, appDataBody, appOpenBody, checkWebAppErrorBody, checkWebAppOkBody, meBody, messagesBody } from "../../schemas/bots";
import { wsMessageNew } from "../../schemas/messages";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { registerUser, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { BotClient, createBot, groupWithBot, startBot, wsPool } from "./helpers";

const server = useServer();
const ws = wsPool();

/** initData из фрагмента адреса, который вернул app/open. */
function initDataOf(url: string): string {
  const fragment = new URLSearchParams(new URL(url).hash.slice(1));
  return fragment.get("shalterWebApp") ?? "";
}

describe("POST /:id/app/open", () => {
  test("нет бота / нет приложения — 404", async () => {
    const owner = await registerUser(server().baseUrl);
    const b = await createBot(owner, "Без приложения");
    expectError(await owner.api.post("/api/bots/bot_nope0000/app/open", {}), 404, "Бот не найден");
    expectError(await owner.api.post(`/api/bots/${b.id}/app/open`, {}), 404, "У этого бота нет приложения");
    expectError(await owner.api.post(`/api/bots/${b.id}/app/data`, { data: "x" }), 404, "У этого бота нет приложения");
  });

  test("внешний адрес: initData во фрагменте, тема, общий чат; чужой домен — 403", async () => {
    const { baseUrl } = server();
    const [owner, user, stranger] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Магазин");
    await owner.api.patch(`/api/bots/${b.id}`, { appUrl: "https://shop.example.com/start?x=1", appName: "Витрина" });
    const dm = await startBot(user, b);
    const strangerDm = await startBot(stranger, b);

    // Открыть может любой пользователь, не только владелец.
    const opened = expectOk(await user.api.post(`/api/bots/${b.id}/app/open`, { chatId: dm.id }), appOpenBody);
    expect(opened).toMatchObject({ name: "Витрина", botId: b.id });
    const u = new URL(opened.url);
    expect(`${u.origin}${u.pathname}${u.search}`).toBe("https://shop.example.com/start?x=1");
    const fragment = new URLSearchParams(u.hash.slice(1));
    expect(fragment.get("shalterTheme")).toBe("light");
    const init = new URLSearchParams(fragment.get("shalterWebApp") ?? "");
    expect(JSON.parse(init.get("user") ?? "")).toEqual({ id: user.id, name: user.name, username: user.username, isPremium: false });
    expect(init.get("chat_id")).toBe(dm.id);
    expect(init.get("bot_id")).toBe(b.id);
    expect(init.get("hash")).toMatch(/^[0-9a-f]{64}$/);
    expect(Number(init.get("auth_date"))).toBeGreaterThan(0);

    // Подпись — HMAC-SHA256 (как у Telegram) с ключом HMAC("ShalterWebAppData", token).
    const key = createHmac("sha256", "ShalterWebAppData").update(b.token).digest();
    const check = [...init.entries()].filter(([k]) => k !== "hash").sort(([a], [c]) => (a < c ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
    expect(createHmac("sha256", key).update(check).digest("hex")).toBe(init.get("hash"));

    // Чужой чат (пользователь не участник) в initData не попадает; тема dark; кнопка на том же домене.
    const other = expectOk(
      await user.api.post(`/api/bots/${b.id}/app/open`, { chatId: strangerDm.id, theme: "dark", url: "https://shop.example.com/item/5" }),
      appOpenBody,
    );
    expect(other.url.startsWith("https://shop.example.com/item/5#")).toBe(true);
    expect(new URLSearchParams(new URL(other.url).hash.slice(1)).get("shalterTheme")).toBe("dark");
    expect(new URLSearchParams(initDataOf(other.url)).get("chat_id")).toBeNull();

    expectError(
      await user.api.post(`/api/bots/${b.id}/app/open`, { url: "https://evil.example.com/" }),
      403,
      "Кнопка ведёт за пределы приложения бота",
    );
    expectError(await user.api.post(`/api/bots/${b.id}/app/open`, { url: "мусор" }), 403, "Кнопка ведёт за пределы приложения бота");

    // Без appName — имя бота.
    await owner.api.patch(`/api/bots/${b.id}`, { appUrl: "https://shop.example.com" });
    expect(expectOk(await user.api.post(`/api/bots/${b.id}/app/open`, {}), appOpenBody).name).toBe("Магазин");
  });
});

describe("Bot API checkWebAppData", () => {
  test("подпись своего бота проходит; подделка, чужой бот, пустые данные — 400", async () => {
    const { baseUrl } = server();
    const [owner, user] = await registerUsers(baseUrl, 2);
    const b = await createBot(owner, "Проверка");
    const otherBot = await createBot(owner, "Другой");
    await owner.api.patch(`/api/bots/${b.id}`, { appUrl: "https://app.example.com" });
    const group = await groupWithBot(owner, [user], b);

    const opened = expectOk(await user.api.post(`/api/bots/${b.id}/app/open`, { chatId: group.id }), appOpenBody);
    const initData = initDataOf(opened.url);
    const ok = expectOk(await b.client.post("checkWebAppData", { initData }), checkWebAppOkBody);
    expect(ok.user.id).toBe(user.id);
    expect(ok.user).not.toHaveProperty("phone");
    expect(ok.chatId).toBe(group.id);
    expect(ok.ageSec).toBeGreaterThanOrEqual(0);
    expect(ok.ageSec).toBeLessThan(120);

    const tampered = new URLSearchParams(initData);
    tampered.set("chat_id", "c_other0000");
    const bad = (await b.client.post("checkWebAppData", { initData: tampered.toString() })) as any;
    expect(bad.status).toBe(400);
    expect(expectShape(checkWebAppErrorBody, bad.body)).toEqual({ ok: false, error: "bad hash" });

    expect((await otherBot.client.post("checkWebAppData", { initData })).body).toEqual({ ok: false, error: "bad hash" });
    expect((await b.client.post("checkWebAppData", {})).body).toEqual({ ok: false, error: "initData is empty" });
    expect((await b.client.post("checkWebAppData", { initData: "a=1" })).body).toEqual({ ok: false, error: "no hash in initData" });
    // После перевыпуска токена старые подписи недействительны.
    const fresh = (await owner.api.post(`/api/bots/${b.id}/regenerate-token`)).body.token;
    const res = await new BotClient(baseUrl, fresh).post("checkWebAppData", { initData });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ ok: false, error: "bad hash" });
  });
});

describe("POST /:id/app/data", () => {
  test("проверки; данные уходят в личку с ботом, бот видит их в updates", async () => {
    const { baseUrl } = server();
    const [owner, user, outsider] = await registerUsers(baseUrl, 3);
    const b = await createBot(owner, "Форма");
    await owner.api.patch(`/api/bots/${b.id}`, { appUrl: "https://form.example.com" });
    const send = (data: unknown) => user.api.post(`/api/bots/${b.id}/app/data`, { data });

    expectError(await send("  "), 400, "Пустые данные");
    expectError(await send(undefined), 400, "Пустые данные");
    expectError(await send("x".repeat(4097)), 400, "Не длиннее 4096 символов");

    const [userWs, outWs] = await Promise.all([ws(user), ws(outsider)]);
    // Личку создаёт сам вызов — раньше человек бота не запускал.
    const res = expectOk(await send('  {"order":42}  '), appDataBody);
    expect(res.message).toMatchObject({ chatId: res.chatId, senderId: user.id, type: "text", text: '{"order":42}' });
    // ПОВЕДЕНИЕ-ВОПРОС: readByIds: [] — у обычных сообщений отправитель сразу в readByIds.
    expect(res.message.readByIds).toEqual([]);
    const ev = expectShape(wsMessageNew, await userWs.waitFor("message:new", (e) => e.message?.id === res.message.id));
    expect(ev.chatId).toBe(res.chatId);
    await outWs.expectNone("message:new");

    const chat = (await user.api.get(`/api/chats/${res.chatId}`)).body.chat;
    expect(chat).toMatchObject({ type: "dm" });
    expect(chat.memberIds.sort()).toEqual([user.id, b.id].sort());
    // Повторные данные — в ту же личку.
    expect(expectOk(await send("ещё"), appDataBody).chatId).toBe(res.chatId);

    const updates = expectOk(await b.client.get("updates"), messagesBody).messages;
    expect(updates.map((m) => m.text)).toEqual(['{"order":42}', "ещё"]);
  });
});

describe("Bot API setWebApp / setWebAppCode и /app/:username", () => {
  test("setWebApp: проверка адреса, me.app, пустой адрес снимает", async () => {
    const owner = await registerUser(server().baseUrl);
    const b = await createBot(owner, "Апи апп");

    expectError(await b.client.post("setWebApp", { url: "ftp://x" }), 400, "Адрес приложения должен начинаться с https:// (http — только для localhost)");
    expectError(await b.client.post("setWebApp", { url: "::" }), 400, "Некорректный адрес приложения");

    const set = expectOk(await b.client.post("setWebApp", { url: "https://w.example.com/a", name: "  Витрина  " }), appBody);
    expect(set.app).toEqual({ url: "https://w.example.com/a", name: "Витрина", hosted: false });
    expect(expectOk(await b.client.get("me"), meBody).app).toEqual(set.app);
    expect((await owner.api.get(`/api/bots/${b.id}`)).body.bot).toMatchObject({ appUrl: "https://w.example.com/a", appName: "Витрина" });

    expect(expectOk(await b.client.post("setWebApp", {}), appBody).app).toBeNull();
    expect(expectOk(await b.client.get("me"), meBody).app).toBeNull();
  });

  test("setWebAppCode: страница по адресу /app/<юзернейм> с SDK и CSP-песочницей", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const b = await createBot(owner, "Хостинг");
    await b.client.post("setWebApp", { url: "https://old.example.com", name: "Старое" });

    expectError(await b.client.post("setWebAppCode", { code: "x".repeat(200_001) }), 400, "Страница длиннее 200 000 символов");

    // Имя без name берётся прежнее.
    const set = expectOk(await b.client.post("setWebAppCode", { code: "<h1>Привет</h1>" }), appBody);
    expect(set.app).toEqual({ url: `${baseUrl}/app/${b.username}`, name: "Старое", hosted: true });
    expect((await owner.api.get(`/api/bots/${b.id}`)).body.bot).toMatchObject({ appUrl: null, appCode: "<h1>Привет</h1>" });

    const page = await fetch(`${baseUrl}/app/${b.username}`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(page.headers.get("content-security-policy")).toBe("sandbox allow-scripts allow-forms allow-popups allow-modals; frame-ancestors 'self'");
    expect(page.headers.get("x-frame-options")).toBeNull();
    expect(page.headers.get("cache-control")).toBe("no-store");
    const html = await page.text();
    expect(html).toContain("<title>Старое</title>");
    expect(html).toContain('<script src="/js/shalter-web-app.js"></script>');
    expect(html).toContain("<body>\n<h1>Привет</h1>\n</body>");
    // @ в адресе допускается.
    expect((await fetch(`${baseUrl}/app/@${b.username}`)).status).toBe(200);

    // Полный документ отдаётся как есть, SDK вставляется в <head>; из заголовка убираются < > &.
    await b.client.post("setWebAppCode", { code: "<html><head><title>t</title></head><body>x</body></html>", name: "<A&B>" });
    const full = await (await fetch(`${baseUrl}/app/${b.username}`)).text();
    expect(full).toBe('<html><head>\n<script src="/js/shalter-web-app.js"></script><title>t</title></head><body>x</body></html>');
    // Если SDK уже подключён — второй раз не вставляется.
    const withSdk = '<html><head><script src="/js/shalter-web-app.js"></script></head></html>';
    await b.client.post("setWebAppCode", { code: withSdk });
    expect(await (await fetch(`${baseUrl}/app/${b.username}`)).text()).toBe(withSdk);
    await b.client.post("setWebAppCode", { code: "<p>фрагмент</p>", name: "<A&B>" });
    expect(await (await fetch(`${baseUrl}/app/${b.username}`)).text()).toContain("<title>AB</title>");

    // app/open у страницы — адрес на этом сервере.
    const user = await registerUser(baseUrl);
    const opened = expectOk(await user.api.post(`/api/bots/${b.id}/app/open`, {}), appOpenBody);
    expect(opened.url.startsWith(`${baseUrl}/app/${b.username}#shalterWebApp=`)).toBe(true);
    expect(opened.name).toBe("<A&B>");

    // Пустой код снимает страницу.
    expect(expectOk(await b.client.post("setWebAppCode", { code: "  " }), appBody).app).toBeNull();
    const gone = await fetch(`${baseUrl}/app/${b.username}`);
    expect(gone.status).toBe(404);
    expect(gone.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await gone.text()).toBe("Приложение не найдено");
  });

  test("/app/:username — 404 для не-бота, бота без страницы и неизвестного имени", async () => {
    const { baseUrl } = server();
    const owner = await registerUser(baseUrl);
    const b = await createBot(owner, "Внешний");
    await b.client.post("setWebApp", { url: "https://x.example.com" });
    for (const name of [owner.username, b.username, "nobody_here_x"]) {
      const res = await fetch(`${baseUrl}/app/${name}`);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Приложение не найдено");
    }
    // Сессия не нужна, но и не мешает.
    expect((await new Api(baseUrl).get(`/app/${b.username}`)).status).toBe(404);
  });
});
