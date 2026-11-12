// Язык интерфейса по стране IP: GET /api/geo/language (без входа) и автоматический режим
// (settings.uiLanguageAuto) — язык при регистрации, обновление на /api/bootstrap, выбор вручную
// и «Автоматически (по региону)» через PATCH /api/settings. Страну сервер узнаёт у ipwho.is
// (запасной — get.geojs.io); весь исходящий fetch идёт через локальный CONNECT-прокси в
// HTTPS-заглушку (push/tls.ts), в интернет тесты не выходят. Ответы геосервисов сервер кэширует
// по адресу, поэтому у каждого теста свой адрес клиента (X-Forwarded-For).
import { beforeEach, describe, expect, test } from "vitest";
import { geoLanguageBody } from "../../schemas/geo";
import { bootstrapBody } from "../../schemas/chats";
import { settingsGetBody, settingsPatchBody } from "../../schemas/settings";
import { Api } from "../../support/client";
import { expectOk } from "../../support/expect";
import { login, registerUser, uniq, uniqPhone } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { connectWs } from "../../support/ws";
import { json, useTlsEgress } from "../push/tls";

const IPWHO = "ipwho.is";
const GEOJS = "get.geojs.io";

const env: Record<string, string> = {};
const egress = useTlsEgress(env, [IPWHO, GEOJS]);
const server = useServer({ env });

beforeEach(() => {
  egress.site().routes.clear();
  egress.site().hits.length = 0;
});

const hitsTo = (host: string) => egress.site().hits.filter((h) => h.host === host);
const from = (ip: string, extra: Record<string, string> = {}) => ({ headers: { "x-forwarded-for": ip, ...extra } });
/** ipwho.is знает страну адреса. */
const country = (ip: string, code: string) => egress.site().routes.set(`${IPWHO}/${ip}`, json({ success: true, country_code: code }));

async function language(ip?: string, extra: Record<string, string> = {}) {
  const api = new Api(server().baseUrl);
  return expectOk(await api.get("/api/geo/language", ip ? from(ip, extra) : { headers: extra }), geoLanguageBody);
}

async function registerFrom(ip: string, extra: Record<string, string> = {}) {
  const api = new Api(server().baseUrl);
  const username = uniq("u");
  const res = await api.post(
    "/api/auth/register-email",
    { name: "Тест", email: `${username}@test.invalid`, password: "secret123", phone: uniqPhone(), username },
    from(ip, extra)
  );
  expect(res.status).toBe(200);
  return { api, email: `${username}@test.invalid`, password: "secret123" };
}

const settingsOf = async (api: Api, opts = {}) => expectOk(await api.get("/api/settings", opts), settingsGetBody).settings;

describe("GET /api/geo/language", () => {
  test("без входа; локальный адрес — геосервисы не спрашиваются, русский по умолчанию", async () => {
    expect(await language()).toEqual({ language: "ru", country: null, source: "default" });
    expect(await language("10.0.0.7")).toEqual({ language: "ru", country: null, source: "default" });
    expect(egress.site().hits).toEqual([]);
  });

  test("страна неизвестна — язык браузера (Accept-Language), неподдерживаемые пропускаются", async () => {
    expect(await language(undefined, { "accept-language": "de-DE,de;q=0.9,en;q=0.8" })).toEqual({ language: "de", country: null, source: "accept-language" });
    expect(await language(undefined, { "accept-language": "uk-UA,uk;q=0.9,en;q=0.5" })).toEqual({ language: "en", country: null, source: "accept-language" });
    expect(await language(undefined, { "accept-language": "*" })).toEqual({ language: "ru", country: null, source: "default" });
  });

  test("публичный адрес — страна у ipwho.is, язык страны; повторный запрос — из кэша", async () => {
    country("8.8.8.8", "US");
    expect(await language("8.8.8.8", { "accept-language": "ru" })).toEqual({ language: "en", country: "US", source: "ip" });
    expect(await language("8.8.8.8")).toEqual({ language: "en", country: "US", source: "ip" });
    const hits = hitsTo(IPWHO);
    expect(hits).toHaveLength(1);
    expect(hits[0].path).toBe("/8.8.8.8");
    expect(hits[0].headers["user-agent"]).toBe("Shalter/1.0 (https://shalter.ru)");
    expect(hitsTo(GEOJS)).toEqual([]);
  });

  test("ipwho.is не ответил — запасной get.geojs.io", async () => {
    egress.site().routes.set(`${IPWHO}/9.9.9.9`, json({ success: false, message: "limit" }));
    egress.site().routes.set(`${GEOJS}/v1/ip/country/9.9.9.9.json`, json({ ip: "9.9.9.9", country: "FR", name: "France" }));
    expect(await language("9.9.9.9")).toEqual({ language: "fr", country: "FR", source: "ip" });
  });

  test("язык страны не поддерживается (Украина) — дальше по цепочке", async () => {
    country("5.5.5.5", "UA");
    expect(await language("5.5.5.5")).toEqual({ language: "ru", country: "UA", source: "default" });
    expect(await language("5.5.5.5", { "accept-language": "uk,en;q=0.4" })).toEqual({ language: "en", country: "UA", source: "accept-language" });
  });

  test("оба геосервиса недоступны — язык браузера, страны нет", async () => {
    egress.site().routes.set(`${IPWHO}/4.4.4.4`, json({ error: "boom" }, 500));
    expect(await language("4.4.4.4", { "accept-language": "it" })).toEqual({ language: "it", country: null, source: "accept-language" });
    expect(hitsTo(IPWHO)).toHaveLength(1);
    expect(hitsTo(GEOJS)).toHaveLength(1);
  });
});

describe("автоматический язык интерфейса", () => {
  test("регистрация: язык по стране, режим автоматический", async () => {
    country("81.2.69.1", "DE");
    const { api } = await registerFrom("81.2.69.1");
    expect(await settingsOf(api)).toMatchObject({ uiLanguage: "de", uiLanguageAuto: true });
  });

  test("регистрация без страны — язык браузера; с локального адреса без него — русский", async () => {
    const { api } = await registerFrom("10.1.1.1", { "accept-language": "es-MX,es;q=0.9" });
    expect(await settingsOf(api)).toMatchObject({ uiLanguage: "es", uiLanguageAuto: true });
    const me = await registerUser(server().baseUrl);
    expect(await settingsOf(me.api)).toMatchObject({ uiLanguage: "ru", uiLanguageAuto: true });
    expect(egress.site().hits).toEqual([]);
  });

  test("/api/bootstrap: страна сменилась — язык за ней; локальный адрес и сбой геосервиса язык не трогают", async () => {
    country("81.2.69.2", "DE");
    const { api } = await registerFrom("81.2.69.2");
    country("2.2.2.2", "JP");
    // Геосервис не держит первый экран: не ответил сразу — язык приходит к следующему /api/bootstrap.
    await expect
      .poll(async () => expectOk(await api.get("/api/bootstrap", from("2.2.2.2")), bootstrapBody).settings)
      .toMatchObject({ uiLanguage: "ja", uiLanguageAuto: true });
    expect(expectOk(await api.get("/api/bootstrap"), bootstrapBody).settings).toMatchObject({ uiLanguage: "ja" });
    egress.site().routes.set(`${IPWHO}/3.3.3.3`, json({ error: "boom" }, 500));
    expect(expectOk(await api.get("/api/bootstrap", from("3.3.3.3", { "accept-language": "fr" })), bootstrapBody).settings).toMatchObject({ uiLanguage: "ja" });
  });

  test("/api/bootstrap не ждёт медленный геосервис: ответ сразу, язык — к следующему запуску", async () => {
    const { api } = await registerFrom("81.2.69.3");
    const socket = await connectWs(api);
    const reply = json({ success: true, country_code: "IT" });
    egress.site().routes.set(`${IPWHO}/2.2.6.6`, (hit, res) => void setTimeout(() => reply(hit, res), 1500));
    const started = Date.now();
    const first = expectOk(await api.get("/api/bootstrap", from("2.2.6.6")), bootstrapBody);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(first.settings).toMatchObject({ uiLanguage: "ru", uiLanguageAuto: true });
    // Страна пришла позже — открытый клиент узнаёт новый язык сразу, не дожидаясь следующего запуска.
    const updated = await socket.waitFor("settings:updated", () => true, 5000);
    expect(updated.settings).toEqual({ uiLanguage: "it", uiLanguageAuto: true });
    socket.close();
    await expect.poll(async () => expectOk(await api.get("/api/bootstrap", from("2.2.6.6")), bootstrapBody).settings, { timeout: 5000 }).toMatchObject({ uiLanguage: "it" });
  });

  test("вход из другой страны — язык меняется к следующему /api/bootstrap", async () => {
    const me = await registerUser(server().baseUrl);
    country("2.2.3.3", "TR");
    const res = await new Api(server().baseUrl).post("/api/auth/login-email", { email: me.email, password: me.password }, from("2.2.3.3"));
    expect(res.status).toBe(200);
    await expect.poll(async () => (await settingsOf(me.api)).uiLanguage).toBe("tr");
  });

  test("выбор вручную выключает автоматический режим — смена страны язык больше не меняет", async () => {
    const me = await registerUser(server().baseUrl);
    const patched = expectOk(await me.api.patch("/api/settings", { uiLanguage: "en" }), settingsPatchBody).settings;
    expect(patched).toMatchObject({ uiLanguage: "en", uiLanguageAuto: false });
    // Русский, выбранный явно, — тоже выбор.
    expect(expectOk(await me.api.patch("/api/settings", { uiLanguage: "ru" }), settingsPatchBody).settings).toMatchObject({ uiLanguage: "ru", uiLanguageAuto: false });
    country("2.2.4.4", "PL");
    expect(expectOk(await me.api.get("/api/bootstrap", from("2.2.4.4")), bootstrapBody).settings).toMatchObject({ uiLanguage: "ru", uiLanguageAuto: false });
    await login(server().baseUrl, me);
    expect(await settingsOf(me.api)).toMatchObject({ uiLanguage: "ru", uiLanguageAuto: false });
  });

  test("«Автоматически (по региону)»: PATCH { uiLanguageAuto: true } сразу подбирает язык по стране", async () => {
    const me = await registerUser(server().baseUrl);
    await me.api.patch("/api/settings", { uiLanguage: "en" });
    country("2.2.5.5", "BR");
    const body = expectOk(await me.api.patch("/api/settings", { uiLanguageAuto: true, uiLanguage: "it" }, from("2.2.5.5")), settingsPatchBody);
    expect(body.settings).toMatchObject({ uiLanguage: "pt", uiLanguageAuto: true });
    // Без страны — язык браузера.
    await me.api.patch("/api/settings", { uiLanguage: "en" });
    const fallback = expectOk(await me.api.patch("/api/settings", { uiLanguageAuto: true }, { headers: { "accept-language": "ko-KR" } }), settingsPatchBody);
    expect(fallback.settings).toMatchObject({ uiLanguage: "ko", uiLanguageAuto: true });
  });

  test("uiLanguageAuto не булево — отбрасывается, как любой ключ не того типа", async () => {
    const me = await registerUser(server().baseUrl);
    const body = expectOk(await me.api.patch("/api/settings", { uiLanguageAuto: "yes" }), settingsPatchBody);
    expect(body.settings).toMatchObject({ uiLanguage: "ru", uiLanguageAuto: true });
  });
});

describe("исходящие соединения", () => {
  test("сервер ходил только к геосервисам", () => {
    expect(new Set(egress.connects.filter((c) => !c.startsWith("127.0.0.1")))).toEqual(new Set([`${IPWHO}:443`, `${GEOJS}:443`]));
  });
});
