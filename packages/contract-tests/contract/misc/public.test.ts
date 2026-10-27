// Маршруты, объявленные прямо в server/app.js: заголовки безопасности,
// /api/version, /api/labels, /api/status-catalog, статические страницы,
// /.well-known, сцены подарков, SPA-фолбэк, неизвестные /api-пути и общий обработчик ошибок.
import { describe, expect, test } from "vitest";
import { labelsBody } from "../../schemas/admin";
import { errorBody } from "../../schemas/common";
import { versionBody } from "../../schemas/misc";
import { statusCatalogBody } from "../../schemas/profile";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";

const server = useServer();
const anon = () => new Api(server().baseUrl);

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
};

function expectSecurityHeaders(headers: Headers, what: string) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(headers.get(name), `${what}: ${name}`).toBe(value);
}

const PAGES: Array<[string, string]> = [
  ["/download", "Скачать Shalter — Windows, macOS, Linux, Android, iPhone"],
  ["/promo", "Shalter — мессенджер "],
  ["/short", "Shalter — короткие ссылки"],
  ["/premium", "Shalter Premium — больше возможностей"],
  ["/bots", "Shalter Bot API — документации"],
  ["/games", "Shalter Games — документация"],
  ["/games/", "Shalter Games — документация"],
  ["/oauth-docs", "Войти через Shalter — документация"],
  ["/knowledge", "Shalter Knowledge Base"],
  ["/knowledge/shalter", "О Shalter — мессенджер"],
  ["/knowledge/bot-api", "Shalter Bot API — справочник методов"],
  ["/knowledge/architecture", "Архитектура Shalter — техническая документация"],
];

const titleOf = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1];

describe("заголовки безопасности (первый middleware)", () => {
  test("на API, статике, SPA, 404 и редиректах", async () => {
    const paths = ["/api/version", "/api/labels", "/", "/promo", "/chat/x", "/api/nope", "/s/zzzzzz", "/.well-known/assetlinks.json", "/manifest.webmanifest"];
    for (const path of paths) expectSecurityHeaders((await anon().get(path)).headers, path);
    expectSecurityHeaders((await anon().get("/api/search")).headers, "401");
  });

  test("GET-ответы API помечены Cache-Control: no-cache (кроме тех, кто ставит свой)", async () => {
    expect((await anon().get("/api/labels")).headers.get("cache-control")).toBe("no-cache");
    expect((await anon().get("/api/search")).headers.get("cache-control")).toBe("no-cache");
    expect((await anon().get("/api/version")).headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET /api/version", () => {
  test("без сессии; версия сборки (или dev) и время старта процесса — неизменно между запросами", async () => {
    const first = expectOk(await anon().get("/api/version"), versionBody);
    const second = expectOk(await anon().get("/api/version"), versionBody);
    expect(second).toEqual(first);
    expect(Date.parse(first.startedAt)).toBeLessThanOrEqual(Date.now());
  });
});

describe("справочники", () => {
  test("GET /api/labels и /api/status-catalog — только с сессией", async () => {
    const me = await registerUser(server().baseUrl);
    expectError(await anon().get("/api/labels"), 401, "unauthorized");
    expectError(await anon().get("/api/status-catalog"), 401, "unauthorized");
    expect(expectOk(await me.api.get("/api/labels"), labelsBody).labels.length).toBeGreaterThan(0);
    expect(expectOk(await me.api.get("/api/status-catalog"), statusCatalogBody)).toEqual({ items: [] });
  });
});

describe("статические страницы", () => {
  test.each(PAGES)("%s — 200 text/html со своей страницей", async (path, title) => {
    const res = await anon().get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=UTF-8");
    expect(titleOf(res.text)).toBe(title);
  });

  test("/.well-known/assetlinks.json — JSON для Android App Links, кэш на час", async () => {
    const res = await anon().get("/.well-known/assetlinks.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(res.body).toEqual([
      expect.objectContaining({
        relation: ["delegate_permission/common.handle_all_urls"],
        target: expect.objectContaining({ namespace: "android_app", package_name: "ru.shalter.twa" }),
      }),
    ]);
  });
});

describe("сцены подарков /gift-scenes", () => {
  test("index.json — список имеющихся сцен; сцена — JSON по id подарка; чужой путь — 404, а не index.html", async () => {
    const index = await anon().get("/gift-scenes/index.json");
    expect(index.status).toBe(200);
    expect(index.headers.get("content-type")).toMatch(/^application\/json/);
    expect(Array.isArray(index.body)).toBe(true);
    expect(index.body).toContain("tw_duck_vacation");
    expect(index.body.every((id: unknown) => typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id))).toBe(true);

    const scene = await anon().get("/gift-scenes/tw_duck_vacation.json");
    expect(scene.status).toBe(200);
    expect(scene.headers.get("content-type")).toMatch(/^application\/json/);
    expect(scene.body).toEqual(expect.objectContaining({ v: 1, layers: expect.any(Array) }));
    expect(scene.body.layers.length).toBeGreaterThan(0);

    for (const path of ["/gift-scenes/no_such_gift.json", "/gift-scenes/", "/gift-scenes/a/b"]) {
      const res = await anon().get(path);
      expect(res.status, path).toBe(404);
      expect(res.text, path).not.toContain("<title>");
    }
  });
});

describe("SPA-фолбэк", () => {
  test("любой GET-путь вне /api и /ws — index.html приложения", async () => {
    const root = await anon().get("/");
    expect(root.status).toBe(200);
    expect(root.headers.get("content-type")).toBe("text/html; charset=UTF-8");
    expect(titleOf(root.text)).toBe("Shalter");

    for (const path of ["/chat/c_abc", "/settings/privacy", "/oauth/authorize?client_id=x&redirect_uri=y", "/u/someone", "/knowledge/nope", "/share/abc", "/s"]) {
      const res = await anon().get(path);
      expect(res.status, path).toBe(200);
      expect(res.text, path).toBe(root.text);
    }
    // Несуществующий файл в /.well-known — 404, а не index.html.
    const wk = await anon().get("/.well-known/apple-app-site-association");
    expect(wk.status).toBe(404);
    expect(wk.text).not.toBe(root.text);
  });

  test("/apiary и /wsx — страницы SPA; /ws (GET без upgrade) и не-GET — 404", async () => {
    const root = await anon().get("/");
    for (const path of ["/apiary", "/wsx"]) {
      const res = await anon().get(path);
      expect(res.status, path).toBe(200);
      expect(res.text, path).toBe(root.text);
    }
    for (const path of ["/ws", "/ws/x"]) {
      expect((await anon().get(path)).status, path).toBe(404);
    }
    expect((await anon().post("/chat/c_abc", {})).status).toBe(404);
  });
});

describe("неизвестные /api-пути и ошибки", () => {
  test("неизвестный /api-путь или метод — 404 JSON { error: \"not found\" }", async () => {
    for (const [method, path] of [["GET", "/api/nope"], ["POST", "/api/nope/deeper"], ["DELETE", "/api/version"], ["GET", "/api"]] as const) {
      const res = await anon().request(method, path);
      expect(expectOk(res, errorBody, 404), path).toEqual({ error: "not found" });
    }
  });

  test("неизвестный путь внутри модуля с requireUserId: без сессии — 401, с сессией — 404 JSON", async () => {
    expect((await anon().get("/api/search/unknown")).body).toEqual({ error: "unauthorized" });
    const me = await registerUser(server().baseUrl);
    expect(expectOk(await me.api.get("/api/search/unknown"), errorBody, 404)).toEqual({ error: "not found" });
  });

  test("битый JSON в теле — общий обработчик ошибок: 400 { error: \"invalid json\" }", async () => {
    const res = await anon().request("POST", "/api/oauth/token", { body: "{not json", headers: { "content-type": "application/json" } });
    expect(expectOk(res, errorBody, 400)).toEqual({ error: "invalid json" });
    expectSecurityHeaders(res.headers, "400");
  });
});
