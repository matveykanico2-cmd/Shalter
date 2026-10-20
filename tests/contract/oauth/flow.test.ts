// OAuth-провайдер: полный путь «Войти через Shalter» — экран согласия
// (GET /app-info), разрешение (POST /authorize → code), обмен кода на токен
// сервером приложения (POST /token) и профиль по токену (GET /userinfo).
import { describe, expect, test } from "vitest";
import { appBody, appInfoBody, authorizeBody, oauthError, oauthProfile, tokenBody } from "../../schemas/oauth";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { APP_OR_REDIRECT, authorize, createApp, exchange, userinfo } from "./helpers";

const server = useServer();

describe("GET /api/oauth/app-info", () => {
  test("название приложения — только при точном совпадении client_id и redirect_uri", async () => {
    const { baseUrl } = server();
    const dev = await registerUser(baseUrl);
    const user = await registerUser(baseUrl);
    const app = await createApp(dev, { name: "Погодник" });
    const info = (query: Record<string, string | undefined>) => user.api.get("/api/oauth/app-info", { query });

    expect(expectOk(await info({ client_id: app.clientId, redirect_uri: app.redirectUri }), appInfoBody)).toEqual({ name: "Погодник" });
    expectError(await info({ client_id: app.clientId, redirect_uri: `${app.redirectUri}/` }), 404, APP_OR_REDIRECT);
    expectError(await info({ client_id: app.clientId, redirect_uri: "https://evil.example/cb" }), 404, APP_OR_REDIRECT);
    expectError(await info({ client_id: app.clientId }), 404, APP_OR_REDIRECT);
    expectError(await info({ client_id: "0".repeat(24), redirect_uri: app.redirectUri }), 404, APP_OR_REDIRECT);
    expectError(await info({}), 404, APP_OR_REDIRECT);
  });
});

describe("POST /api/oauth/authorize", () => {
  test("redirectUrl = redirect_uri + code (+ state); каждый раз новый код", async () => {
    const { baseUrl } = server();
    const dev = await registerUser(baseUrl);
    const user = await registerUser(baseUrl);
    const app = await createApp(dev, { redirectUri: "https://app.example/cb?keep=1" });

    const res = await user.api.post("/api/oauth/authorize", { client_id: app.clientId, redirect_uri: app.redirectUri, state: "x y&z" });
    const { redirectUrl } = expectOk(res, authorizeBody);
    const url = new URL(redirectUrl);
    expect(`${url.origin}${url.pathname}`).toBe("https://app.example/cb");
    expect([...url.searchParams.keys()]).toEqual(["keep", "code", "state"]);
    expect(url.searchParams.get("keep")).toBe("1");
    expect(url.searchParams.get("code")).toMatch(/^[0-9a-f]{48}$/);
    expect(url.searchParams.get("state")).toBe("x y&z");

    // Без state — параметра нет; код другой.
    const again = expectOk(await user.api.post("/api/oauth/authorize", { client_id: app.clientId, redirect_uri: app.redirectUri }), authorizeBody);
    const url2 = new URL(again.redirectUrl);
    expect(url2.searchParams.has("state")).toBe(false);
    expect(url2.searchParams.get("code")).not.toBe(url.searchParams.get("code"));
  });

  test("чужой redirect_uri или неизвестный client_id — 404, код не выдаётся", async () => {
    const { baseUrl } = server();
    const dev = await registerUser(baseUrl);
    const user = await registerUser(baseUrl);
    const app = await createApp(dev);
    const post = (body: unknown) => user.api.post("/api/oauth/authorize", body);
    expectError(await post({ client_id: app.clientId, redirect_uri: "https://evil.example/cb" }), 404, APP_OR_REDIRECT);
    expectError(await post({ client_id: app.clientId }), 404, APP_OR_REDIRECT);
    expectError(await post({ redirect_uri: app.redirectUri }), 404, APP_OR_REDIRECT);
    expectError(await post({ client_id: "f".repeat(24), redirect_uri: app.redirectUri }), 404, APP_OR_REDIRECT);
    expectError(await post({}), 404, APP_OR_REDIRECT);
  });
});

describe("POST /api/oauth/token и GET /api/oauth/userinfo", () => {
  test("полный путь: код → токен с профилем → userinfo по Bearer, профиль живой", async () => {
    const { baseUrl } = server();
    const dev = await registerUser(baseUrl);
    const user = await registerUser(baseUrl, { name: "Мария" });
    const app = await createApp(dev);
    const { code } = await authorize(user, app, "s1");

    const res = await exchange(baseUrl, { client_id: app.clientId, client_secret: app.clientSecret, code, redirect_uri: app.redirectUri });
    const token = expectOk(res, tokenBody);
    expect(token.user).toEqual({ id: user.id, name: "Мария", username: user.username, avatarImage: null });

    const profile = expectOk(await userinfo(baseUrl, `Bearer ${token.access_token}`), oauthProfile);
    expect(profile).toEqual(token.user);

    // Имя поменялось — userinfo отдаёт актуальное.
    expect((await user.api.patch(`/api/users/${user.id}`, { name: "Мария Иванова" })).status).toBe(200);
    expect(expectOk(await userinfo(baseUrl, `Bearer ${token.access_token}`), oauthProfile).name).toBe("Мария Иванова");

    // Каждый обмен — новый токен.
    const second = await authorize(user, app);
    const token2 = expectOk(await exchange(baseUrl, { client_id: app.clientId, client_secret: app.clientSecret, code: second.code, redirect_uri: app.redirectUri }), tokenBody);
    expect(token2.access_token).not.toBe(token.access_token);
  });

  test("повтор кода — invalid_grant и отзыв выданного по нему токена (RFC 6749 §4.1.2)", async () => {
    const { baseUrl } = server();
    const dev = await registerUser(baseUrl);
    const user = await registerUser(baseUrl);
    const other = await registerUser(baseUrl);
    const app = await createApp(dev);
    const otherApp = await createApp(dev, { name: "Другое" });
    // Токены, выданные раньше, и токены других пользователей/приложений не затрагиваются.
    const earlier = await authorize(user, app);
    const earlierToken = expectOk(await exchange(baseUrl, { client_id: app.clientId, client_secret: app.clientSecret, code: earlier.code, redirect_uri: app.redirectUri }), tokenBody).access_token;
    const otherUserCode = await authorize(other, app);
    const otherUserToken = expectOk(await exchange(baseUrl, { client_id: app.clientId, client_secret: app.clientSecret, code: otherUserCode.code, redirect_uri: app.redirectUri }), tokenBody).access_token;
    const otherAppCode = await authorize(user, otherApp);
    await new Promise((r) => setTimeout(r, 5));

    const { code } = await authorize(user, app);
    const good = { client_id: app.clientId, client_secret: app.clientSecret, code, redirect_uri: app.redirectUri };
    const token = expectOk(await exchange(baseUrl, good), tokenBody).access_token;
    const otherAppToken = expectOk(await exchange(baseUrl, { client_id: otherApp.clientId, client_secret: otherApp.clientSecret, code: otherAppCode.code, redirect_uri: otherApp.redirectUri }), tokenBody).access_token;
    expect((await userinfo(baseUrl, `Bearer ${token}`)).status).toBe(200);

    expect(expectOk(await exchange(baseUrl, good), oauthError, 400)).toEqual({ error: "invalid_grant" });
    expect(expectOk(await userinfo(baseUrl, `Bearer ${token}`), oauthError, 401)).toEqual({ error: "invalid_token" });
    for (const kept of [earlierToken, otherUserToken, otherAppToken]) {
      expect((await userinfo(baseUrl, `Bearer ${kept}`)).status).toBe(200);
    }
  });

  test("invalid_client: неверный/пустой секрет, неизвестный client_id, form-urlencoded; код при этом не сгорает", async () => {
    const { baseUrl } = server();
    const dev = await registerUser(baseUrl);
    const user = await registerUser(baseUrl);
    const app = await createApp(dev);
    const { code } = await authorize(user, app);
    const good = { client_id: app.clientId, client_secret: app.clientSecret, code, redirect_uri: app.redirectUri };
    const bad = async (body: Record<string, unknown>) => expect(expectOk(await exchange(baseUrl, body), oauthError, 401)).toEqual({ error: "invalid_client" });

    await bad({ ...good, client_secret: "0".repeat(48) });
    await bad({ ...good, client_secret: app.clientSecret.slice(0, -1) });
    await bad({ ...good, client_secret: "" });
    await bad({ ...good, client_secret: undefined });
    await bad({ ...good, client_id: "0".repeat(24) });
    await bad({ ...good, client_id: undefined });
    await bad({});

    // Стандартный для OAuth form-urlencoded не разбирается: сервер читает только JSON (так и описано в /oauth-docs).
    const form = await new Api(baseUrl).request("POST", "/api/oauth/token", {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(good as Record<string, string>).toString(),
    });
    expect(expectOk(form, oauthError, 401)).toEqual({ error: "invalid_client" });

    expectOk(await exchange(baseUrl, good), tokenBody);
  });

  test("invalid_grant: чужой код, неверный redirect_uri, мусор; проверки не расходуют код", async () => {
    const { baseUrl } = server();
    const dev = await registerUser(baseUrl);
    const user = await registerUser(baseUrl);
    const app = await createApp(dev);
    const otherApp = await createApp(dev, { redirectUri: "https://other.example/cb" });
    const { code } = await authorize(user, app);
    const good = { client_id: app.clientId, client_secret: app.clientSecret, code, redirect_uri: app.redirectUri };
    const grant = async (body: Record<string, unknown>) => expect(expectOk(await exchange(baseUrl, body), oauthError, 400)).toEqual({ error: "invalid_grant" });

    await grant({ ...good, redirect_uri: "https://evil.example/cb" });
    await grant({ ...good, redirect_uri: undefined });
    // Код выдан другому приложению.
    await grant({ client_id: otherApp.clientId, client_secret: otherApp.clientSecret, code, redirect_uri: otherApp.redirectUri });
    await grant({ ...good, code: "0".repeat(48) });
    await grant({ ...good, code: undefined });

    expect(expectOk(await exchange(baseUrl, good), tokenBody).user.id).toBe(user.id);
    await grant(good);
  });

  test("userinfo: только «Bearer <токен>»", async () => {
    const { baseUrl } = server();
    const dev = await registerUser(baseUrl);
    const user = await registerUser(baseUrl);
    const app = await createApp(dev);
    const { code } = await authorize(user, app);
    const { access_token } = expectOk(await exchange(baseUrl, { client_id: app.clientId, client_secret: app.clientSecret, code, redirect_uri: app.redirectUri }), tokenBody);

    for (const header of [undefined, "", access_token, `bearer ${access_token}`, `Bearer  ${access_token}`, `Bearer ${"0".repeat(64)}`, `Basic ${access_token}`]) {
      expect(expectOk(await userinfo(baseUrl, header), oauthError, 401)).toEqual({ error: "invalid_token" });
    }
    // Токен не заменяет сессию: cookie-маршруты по нему недоступны.
    expectError(await new Api(baseUrl).get("/api/oauth/apps", { headers: { authorization: `Bearer ${access_token}` } }), 401, "unauthorized");
    // А cookie не заменяет токен.
    expect(expectOk(await user.api.get("/api/oauth/userinfo"), oauthError, 401)).toEqual({ error: "invalid_token" });
  });

  test("перевыпуск секрета: старый секрет не принимается, выданные токены отозваны", async () => {
    const { baseUrl } = server();
    const dev = await registerUser(baseUrl);
    const user = await registerUser(baseUrl);
    const app = await createApp(dev);
    const kept = await createApp(dev, { name: "Второе" });
    const first = await authorize(user, app);
    const { access_token } = expectOk(await exchange(baseUrl, { client_id: app.clientId, client_secret: app.clientSecret, code: first.code, redirect_uri: app.redirectUri }), tokenBody);
    const keptCode = await authorize(user, kept);
    const keptToken = expectOk(await exchange(baseUrl, { client_id: kept.clientId, client_secret: kept.clientSecret, code: keptCode.code, redirect_uri: kept.redirectUri }), tokenBody).access_token;

    const { app: renewed } = expectOk(await dev.api.post(`/api/oauth/apps/${app.id}/regenerate`), appBody);
    const { code } = await authorize(user, app);
    const stale = await exchange(baseUrl, { client_id: app.clientId, client_secret: app.clientSecret, code, redirect_uri: app.redirectUri });
    expect(expectOk(stale, oauthError, 401)).toEqual({ error: "invalid_client" });
    const fresh = expectOk(await exchange(baseUrl, { client_id: app.clientId, client_secret: renewed.clientSecret, code, redirect_uri: app.redirectUri }), tokenBody);

    // Перевыпуск секрета (обычно — после утечки) отзывает все ранее выданные токены приложения.
    expect(expectOk(await userinfo(baseUrl, `Bearer ${access_token}`), oauthError, 401)).toEqual({ error: "invalid_token" });
    // Токен, выданный уже с новым секретом, и токены других приложений живут.
    expect(expectOk(await userinfo(baseUrl, `Bearer ${fresh.access_token}`), oauthProfile).id).toBe(user.id);
    expect(expectOk(await userinfo(baseUrl, `Bearer ${keptToken}`), oauthProfile).id).toBe(user.id);
  });

  test("удаление приложения отзывает его токены и неиспользованные коды", async () => {
    const { baseUrl } = server();
    const dev = await registerUser(baseUrl);
    const user = await registerUser(baseUrl);
    const app = await createApp(dev);
    const kept = await createApp(dev, { name: "Второе" });

    const first = await authorize(user, app);
    const { access_token } = expectOk(await exchange(baseUrl, { client_id: app.clientId, client_secret: app.clientSecret, code: first.code, redirect_uri: app.redirectUri }), tokenBody);
    const pending = await authorize(user, app);
    const keptCode = await authorize(user, kept);
    const keptToken = expectOk(
      await exchange(baseUrl, { client_id: kept.clientId, client_secret: kept.clientSecret, code: keptCode.code, redirect_uri: kept.redirectUri }),
      tokenBody,
    ).access_token;

    expect((await dev.api.delete(`/api/oauth/apps/${app.id}`)).status).toBe(200);
    expect(expectOk(await userinfo(baseUrl, `Bearer ${access_token}`), oauthError, 401)).toEqual({ error: "invalid_token" });
    const late = await exchange(baseUrl, { client_id: app.clientId, client_secret: app.clientSecret, code: pending.code, redirect_uri: app.redirectUri });
    expect(expectOk(late, oauthError, 401)).toEqual({ error: "invalid_client" });
    // Токены других приложений не затронуты.
    expect(expectOk(await userinfo(baseUrl, `Bearer ${keptToken}`), oauthProfile).id).toBe(user.id);
  });
});
