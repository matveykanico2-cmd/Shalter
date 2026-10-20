// OAuth-провайдер: кабинет разработчика — регистрация приложений, список,
// просмотр и перевыпуск секрета, удаление (/api/oauth/apps*).
import { describe, expect, test } from "vitest";
import { appBody, appsBody, secretBody } from "../../schemas/oauth";
import { okBody } from "../../schemas/common";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { APP_NOT_FOUND, BAD_URL, createApp, NEED_HTTPS, NEED_NAME } from "./helpers";

const server = useServer();

describe("доступ", () => {
  test("кабинет и POST /authorize требуют сессию; /app-info, /token и /userinfo — нет", async () => {
    const anon = new Api(server().baseUrl);
    const calls: Array<[string, string]> = [
      ["GET", "/api/oauth/apps"],
      ["POST", "/api/oauth/apps"],
      ["DELETE", "/api/oauth/apps/oa_x_00000000"],
      ["GET", "/api/oauth/apps/oa_x_00000000/secret"],
      ["POST", "/api/oauth/apps/oa_x_00000000/regenerate"],
      ["POST", "/api/oauth/authorize"],
    ];
    for (const [method, path] of calls) {
      expectError(await anon.request(method, path, { json: method === "GET" ? undefined : {} }), 401, "unauthorized");
    }
    // Экран согласия гостю показывает название приложения и форму входа.
    const app = await createApp(await registerUser(server().baseUrl), { name: "Для гостя" });
    expect((await anon.get("/api/oauth/app-info", { query: { client_id: app.clientId, redirect_uri: app.redirectUri } })).body).toEqual({ name: "Для гостя" });
    expectError(await anon.get("/api/oauth/app-info"), 404, "Приложение не найдено или redirect_uri не совпадает");
    expect((await anon.post("/api/oauth/token", {})).body).toEqual({ error: "invalid_client" });
    expect((await anon.get("/api/oauth/userinfo")).body).toEqual({ error: "invalid_token" });
  });
});

describe("POST /api/oauth/apps", () => {
  test("создание: секрет только в ответе, поля обрезаются, имя — до 60 символов", async () => {
    const { baseUrl } = server();
    const dev = await registerUser(baseUrl);
    const res = await dev.api.post("/api/oauth/apps", { name: `  ${"Я".repeat(70)}  `, redirectUri: "  https://app.example/callback?x=1  " });
    const { app } = expectOk(res, appBody);
    expect(app).toMatchObject({ name: "Я".repeat(60), redirectUri: "https://app.example/callback?x=1", ownerId: dev.id });
    expect(app.clientId).not.toBe(app.clientSecret);

    // В списке — то же приложение, но без секрета.
    const { apps } = expectOk(await dev.api.get("/api/oauth/apps"), appsBody);
    const { clientSecret: _secret, ...withoutSecret } = app;
    expect(apps).toEqual([withoutSecret]);
  });

  test("список — только свои приложения, новые сверху", async () => {
    const { baseUrl } = server();
    const dev = await registerUser(baseUrl);
    const other = await registerUser(baseUrl);
    const first = await createApp(dev, { name: "Первое" });
    await new Promise((r) => setTimeout(r, 5));
    const second = await createApp(dev, { name: "Второе" });
    await createApp(other, { name: "Чужое" });

    const { apps } = expectOk(await dev.api.get("/api/oauth/apps"), appsBody);
    expect(apps.map((a) => a.id)).toEqual([second.id, first.id]);
    expect(expectOk(await (await registerUser(baseUrl)).api.get("/api/oauth/apps"), appsBody)).toEqual({ apps: [] });
  });

  test("валидация: название, полный адрес, https (кроме localhost)", async () => {
    const dev = await registerUser(server().baseUrl);
    const post = (body: unknown) => dev.api.post("/api/oauth/apps", body);
    expectError(await post({ redirectUri: "https://app.example/cb" }), 400, NEED_NAME);
    expectError(await post({ name: "   ", redirectUri: "https://app.example/cb" }), 400, NEED_NAME);
    // Название проверяется раньше адреса.
    expectError(await post({ name: "", redirectUri: "мусор" }), 400, NEED_NAME);
    expectError(await post({ name: "А" }), 400, BAD_URL);
    expectError(await post({ name: "А", redirectUri: "app.example/cb" }), 400, BAD_URL);
    expectError(await post({ name: "А", redirectUri: "http://app.example/cb" }), 400, NEED_HTTPS);
    expectError(await post({ name: "А", redirectUri: "http://127.0.0.1/cb" }), 400, NEED_HTTPS);
    expectError(await post({ name: "А", redirectUri: "javascript:alert(1)" }), 400, NEED_HTTPS);

    expect(expectOk(await post({ name: "Локально", redirectUri: "http://localhost:3000/cb" }), appBody).app.redirectUri).toBe("http://localhost:3000/cb");
    expect((await dev.api.get("/api/oauth/apps")).body.apps).toHaveLength(1);
  });

  test("только http(s): другие схемы отклоняются даже с хостом localhost", async () => {
    const dev = await registerUser(server().baseUrl);
    // Клиент (views/oauthAuthorize.js) делает window.location.href = redirectUrl —
    // javascript://localhost/… был бы XSS в origin Shalter.
    for (const redirectUri of ["javascript://localhost/%0aalert(document.cookie)", "ftp://localhost/cb", "data://localhost/x", "file://localhost/etc/passwd"]) {
      expectError(await dev.api.post("/api/oauth/apps", { name: "Схема", redirectUri }), 400, NEED_HTTPS);
    }
    expect(expectOk(await dev.api.post("/api/oauth/apps", { name: "Локально", redirectUri: "http://localhost/cb" }), appBody).app.redirectUri).toBe("http://localhost/cb");
    expect((await dev.api.get("/api/oauth/apps")).body.apps).toHaveLength(1);
  });
});

describe("секрет: GET /apps/:id/secret и POST /apps/:id/regenerate", () => {
  test("владелец видит секрет; перевыпуск меняет только секрет", async () => {
    const { baseUrl } = server();
    const dev = await registerUser(baseUrl);
    const app = await createApp(dev);

    expect(expectOk(await dev.api.get(`/api/oauth/apps/${app.id}/secret`), secretBody)).toEqual({ clientId: app.clientId, clientSecret: app.clientSecret });

    const { app: renewed } = expectOk(await dev.api.post(`/api/oauth/apps/${app.id}/regenerate`), appBody);
    expect(renewed).toEqual({ ...app, clientSecret: expect.any(String) });
    expect(renewed.clientSecret).not.toBe(app.clientSecret);
    expect(expectOk(await dev.api.get(`/api/oauth/apps/${app.id}/secret`), secretBody).clientSecret).toBe(renewed.clientSecret);
  });

  test("чужое и несуществующее приложение — 404, секрет не меняется", async () => {
    const { baseUrl } = server();
    const dev = await registerUser(baseUrl);
    const stranger = await registerUser(baseUrl);
    const app = await createApp(dev);

    expectError(await stranger.api.get(`/api/oauth/apps/${app.id}/secret`), 404, APP_NOT_FOUND);
    expectError(await stranger.api.post(`/api/oauth/apps/${app.id}/regenerate`), 404, APP_NOT_FOUND);
    expectError(await dev.api.get("/api/oauth/apps/oa_none_00000000/secret"), 404, APP_NOT_FOUND);
    expectError(await dev.api.post("/api/oauth/apps/oa_none_00000000/regenerate"), 404, APP_NOT_FOUND);
    expect((await dev.api.get(`/api/oauth/apps/${app.id}/secret`)).body.clientSecret).toBe(app.clientSecret);
  });
});

describe("DELETE /api/oauth/apps/:id", () => {
  test("удалить может только владелец; после удаления приложения нет нигде", async () => {
    const { baseUrl } = server();
    const dev = await registerUser(baseUrl);
    const stranger = await registerUser(baseUrl);
    const app = await createApp(dev);
    const kept = await createApp(dev, { name: "Остаётся" });

    expectError(await stranger.api.delete(`/api/oauth/apps/${app.id}`), 404, APP_NOT_FOUND);
    expect((await dev.api.get("/api/oauth/apps")).body.apps).toHaveLength(2);

    expect(expectOk(await dev.api.delete(`/api/oauth/apps/${app.id}`), okBody)).toEqual({ ok: true });
    expect(expectOk(await dev.api.get("/api/oauth/apps"), appsBody).apps.map((a) => a.id)).toEqual([kept.id]);
    expectError(await dev.api.delete(`/api/oauth/apps/${app.id}`), 404, APP_NOT_FOUND);
    expectError(await dev.api.get(`/api/oauth/apps/${app.id}/secret`), 404, APP_NOT_FOUND);
    expectError(await dev.api.post(`/api/oauth/apps/${app.id}/regenerate`), 404, APP_NOT_FOUND);
    // Пропал и для экрана согласия.
    expectError(
      await dev.api.get("/api/oauth/app-info", { query: { client_id: app.clientId, redirect_uri: app.redirectUri } }),
      404,
      "Приложение не найдено или redirect_uri не совпадает",
    );
  });
});
