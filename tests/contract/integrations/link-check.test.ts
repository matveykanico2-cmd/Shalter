// /api/link-check — можно ли открыть страницу во встроенном браузере (по
// X-Frame-Options / CSP frame-ancestors) и /api/link-check/instant-view — статья
// в режиме чтения. Сервер сам ходит по ссылке, поэтому здесь же проверяется
// защита от SSRF: частные адреса и нестандартные порты не запрашиваются вовсе.
// Внешний «сайт» — stub за прокси (см. stubs.ts), в интернет тесты не ходят.
import { describe, expect, test } from "vitest";
import { instantViewBody, linkCheckBody } from "../../schemas/integrations";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { html, PUBLIC_HOST, redirect, useEgressProxy, useStubSite } from "./stubs";

const egress = useEgressProxy();
// Отдельный локальный сайт — цель для попыток SSRF: на него не должно прийти ни одного запроса.
const internal = useStubSite({});
const server = useServer({ env: egress.env });

const ext = (path: string) => `http://${PUBLIC_HOST}${path}`;
let n = 0;
/** Уникальный путь: ответы link-check и instant-view кэшируются по адресу. */
const p = (name: string) => `/${name}-${++n}`;

const ARTICLE_TEXT =
  "Это первый абзац статьи, в нём достаточно текста, чтобы режим чтения признал страницу статьёй. ".repeat(4);

describe("GET /api/link-check — проверки", () => {
  test("без сессии — 401", async () => {
    const { baseUrl } = server();
    const anon = new Api(baseUrl);
    expectError(await anon.get("/api/link-check", { query: { url: ext("/x") } }), 401, "unauthorized");
    expectError(await anon.get("/api/link-check/instant-view", { query: { url: ext("/x") } }), 401, "unauthorized");
  });

  test("не http(s) или длиннее 2048 — 400 Некорректная ссылка", async () => {
    const { baseUrl } = server();
    const u = await registerUser(baseUrl);
    for (const route of ["/api/link-check", "/api/link-check/instant-view"]) {
      for (const url of [undefined, "", "ftp://example.com/", "javascript:alert(1)", "example.com", `http://${PUBLIC_HOST}/${"a".repeat(2048)}`]) {
        expectError(await u.api.get(route, { query: { url } }), 400, "Некорректная ссылка");
      }
    }
    expect(egress.proxy().connects).toEqual([]);
  });
});

describe("GET /api/link-check — встраивание", () => {
  test("без запрета встраивания — frameable: true и код ответа сайта", async () => {
    const { baseUrl } = server();
    const u = await registerUser(baseUrl);
    const path = p("plain");
    egress.site().routes.set(path, html("<html><body>ok</body></html>"));
    const res = expectOk(await u.api.get("/api/link-check", { query: { url: ext(path) } }), linkCheckBody);
    expect(res).toEqual({ frameable: true, status: 200 });
    // Сервер представляется браузером, который грузит iframe.
    const hit = egress.site().hits.find((h) => h.path === path)!;
    expect(hit.headers["sec-fetch-dest"]).toBe("iframe");
    expect(hit.headers["user-agent"]).toMatch(/Chrome/);
  });

  test("X-Frame-Options: DENY / SAMEORIGIN — false; ALLOWALL — разрешено", async () => {
    const { baseUrl } = server();
    const u = await registerUser(baseUrl);
    const cases: Array<[Record<string, string>, boolean]> = [
      [{ "x-frame-options": "DENY" }, false],
      [{ "x-frame-options": "SAMEORIGIN" }, false],
      [{ "x-frame-options": "ALLOWALL" }, true],
    ];
    for (const [headers, frameable] of cases) {
      const path = p("xfo");
      egress.site().routes.set(path, html("<p>x</p>", headers));
      expect(expectOk(await u.api.get("/api/link-check", { query: { url: ext(path) } }), linkCheckBody)).toEqual({ frameable, status: 200 });
    }
  });

  test("CSP frame-ancestors: 'none' — false, * — true, наш хост — true, чужой — false", async () => {
    const { baseUrl } = server();
    const u = await registerUser(baseUrl);
    // Наш origin сервер берёт из запроса: http://127.0.0.1:<порт>.
    const cases: Array<[string, boolean]> = [
      ["frame-ancestors 'none'", false],
      ["default-src 'self'; frame-ancestors *", true],
      ["frame-ancestors http://127.0.0.1", true],
      ["frame-ancestors https://127.0.0.1", false],
      ["frame-ancestors https://other.example", false],
      ["default-src 'self'", true],
    ];
    for (const [csp, frameable] of cases) {
      const path = p("csp");
      egress.site().routes.set(path, html("<p>x</p>", { "content-security-policy": csp }));
      expect(expectOk(await u.api.get("/api/link-check", { query: { url: ext(path) } }), linkCheckBody), csp).toEqual({ frameable, status: 200 });
    }
  });

  test("сайт ответил 4xx/5xx — frameable: null со статусом", async () => {
    const { baseUrl } = server();
    const u = await registerUser(baseUrl);
    const path = p("err");
    egress.site().routes.set(path, html("nope", {}, 503));
    expect(expectOk(await u.api.get("/api/link-check", { query: { url: ext(path) } }), linkCheckBody)).toEqual({ frameable: null, status: 503 });
    // Нет обработчика — stub отвечает 404.
    expect(expectOk(await u.api.get("/api/link-check", { query: { url: ext(p("missing")) } }), linkCheckBody)).toEqual({ frameable: null, status: 404 });
  });

  test("недоступный сайт — frameable: null без status", async () => {
    const { baseUrl } = server();
    const u = await registerUser(baseUrl);
    // https до 203.0.113.10:443 прокси не пропускает — как сайт, который не ответил.
    const res = expectOk(await u.api.get("/api/link-check", { query: { url: `https://${PUBLIC_HOST}/down` } }), linkCheckBody);
    expect(res).toEqual({ frameable: null });
    expect(egress.proxy().connects).toContain(`${PUBLIC_HOST}:443`);
  });

  test("ответ кэшируется по адресу: второй запрос к сайту не идёт", async () => {
    const { baseUrl } = server();
    const u = await registerUser(baseUrl);
    const path = p("cache");
    egress.site().routes.set(path, html("<p>x</p>"));
    expectOk(await u.api.get("/api/link-check", { query: { url: ext(path) } }), linkCheckBody);
    egress.site().routes.set(path, html("<p>x</p>", { "x-frame-options": "DENY" }));
    expect(expectOk(await u.api.get("/api/link-check", { query: { url: ext(path) } }), linkCheckBody)).toEqual({ frameable: true, status: 200 });
    expect(egress.site().hits.filter((h) => h.path === path)).toHaveLength(1);
  });

  test("SSRF: частные адреса, localhost и нестандартные порты не запрашиваются — frameable: null", async () => {
    const { baseUrl } = server();
    const u = await registerUser(baseUrl);
    const site = internal();
    const before = egress.proxy().connects.length;
    for (const url of [
      `${site.localUrl}/secret`,
      `http://localhost:${site.port}/secret`,
      "http://127.0.0.1/secret",
      "http://10.0.0.1/secret",
      "http://192.168.1.1/secret",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/secret",
      `http://${PUBLIC_HOST}:8080/secret`,
    ]) {
      expect(expectOk(await u.api.get("/api/link-check", { query: { url } }), linkCheckBody), url).toEqual({ frameable: null });
    }
    expect(site.hits).toEqual([]);
    expect(egress.proxy().connects.slice(before)).toEqual([]);
  });

  test("SSRF: редирект внешнего сайта на внутренний адрес не выполняется", async () => {
    const { baseUrl } = server();
    const u = await registerUser(baseUrl);
    const site = internal();
    const path = p("to-internal");
    egress.site().routes.set(path, redirect(`${site.localUrl}/secret`));
    expect(expectOk(await u.api.get("/api/link-check", { query: { url: ext(path) } }), linkCheckBody)).toEqual({ frameable: null });
    expect(site.hits).toEqual([]);

    // А на внешний — проходится, проверяется конечная страница.
    const from = p("hop");
    const to = p("landing");
    egress.site().routes.set(from, redirect(ext(to), 301));
    egress.site().routes.set(to, html("<p>x</p>", { "x-frame-options": "DENY" }));
    expect(expectOk(await u.api.get("/api/link-check", { query: { url: ext(from) } }), linkCheckBody)).toEqual({ frameable: false, status: 200 });
  });

  test("больше 4 редиректов — frameable: null", async () => {
    const { baseUrl } = server();
    const u = await registerUser(baseUrl);
    const base = p("loop");
    for (let i = 0; i < 6; i++) egress.site().routes.set(`${base}/${i}`, redirect(ext(`${base}/${i + 1}`)));
    egress.site().routes.set(`${base}/6`, html("<p>x</p>"));
    expect(expectOk(await u.api.get("/api/link-check", { query: { url: ext(`${base}/0`) } }), linkCheckBody)).toEqual({ frameable: null });
    // Первый запрос + 4 перехода, дальше сервер сдаётся.
    expect(egress.site().hits.filter((h) => h.path.startsWith(`${base}/`)).map((h) => h.path)).toEqual([0, 1, 2, 3, 4].map((i) => `${base}/${i}`));
  });
});

describe("GET /api/link-check/instant-view", () => {
  test("статья: заголовок, сайт, автор, блоки по тегам; http — unsafe", async () => {
    const { baseUrl } = server();
    const u = await registerUser(baseUrl);
    const path = p("article");
    egress.site().routes.set(
      path,
      html(`<!doctype html><html><head>
        <title>Запасной заголовок</title>
        <meta property="og:title" content="Заголовок &amp; статьи">
        <meta property="og:site_name" content="Тестовый сайт">
        <meta name="author" content="Иван Петров">
        <meta property="article:published_time" content="2026-01-02T03:04:05Z">
        <meta property="og:image" content="/cover.jpg">
      </head><body>
        <nav><p>Меню сайта, его в статье быть не должно</p></nav>
        <article>
          <h1>Главный заголовок</h1>
          <p>${ARTICLE_TEXT}</p>
          <blockquote>Цитата из текста</blockquote>
          <ul><li>Пункт один</li><li>Пункт два</li></ul>
          <pre>const x = 1;</pre>
          <img src="/photo.png" width="600">
          <img src="/icon.png" width="16">
          <script>alert("нет")</script>
          <p>Второй &laquo;абзац&raquo; статьи.</p>
        </article>
      </body></html>`),
    );
    const { view } = expectOk(await u.api.get("/api/link-check/instant-view", { query: { url: ext(path) } }), instantViewBody);
    expect(view).toEqual({
      url: ext(path),
      title: "Заголовок & статьи",
      siteName: "Тестовый сайт",
      author: "Иван Петров",
      publishedAt: "2026-01-02T03:04:05Z",
      image: ext("/cover.jpg"),
      unsafe: true,
      blocks: [
        { type: "heading", text: "Главный заголовок" },
        { type: "text", text: ARTICLE_TEXT.trim() },
        { type: "quote", text: "Цитата из текста" },
        { type: "item", text: "Пункт один" },
        { type: "item", text: "Пункт два" },
        { type: "code", text: "const x = 1;" },
        { type: "image", url: ext("/photo.png") },
        { type: "text", text: "Второй «абзац» статьи." },
      ],
    });
    // Сервер ходит своим UA, а не браузерным.
    expect(egress.site().hits.find((h) => h.path === path)!.headers["user-agent"]).toBe("Mozilla/5.0 (compatible; ShalterInstantView/1.0)");
  });

  test("без og-тегов: заголовок из <title>, сайт — имя хоста, author пустой", async () => {
    const { baseUrl } = server();
    const u = await registerUser(baseUrl);
    const path = p("bare");
    egress.site().routes.set(path, html(`<html><head><title>Просто страница</title></head><body><p>${ARTICLE_TEXT}</p></body></html>`));
    const { view } = expectOk(await u.api.get("/api/link-check/instant-view", { query: { url: ext(path) } }), instantViewBody);
    // ПОВЕДЕНИЕ-ВОПРОС: без og:image поле image не null, а адрес самой страницы —
    // absoluteUrl("", url) разрешает пустую строку относительно страницы.
    expect(view).toMatchObject({ title: "Просто страница", siteName: PUBLIC_HOST, author: "", publishedAt: null, image: ext(path), unsafe: true });
  });

  test("ошибки: не HTML — 422, мало текста — 422, ошибка сайта — 502, недоступен — 502", async () => {
    const { baseUrl } = server();
    const u = await registerUser(baseUrl);
    const notHtml = p("json");
    egress.site().routes.set(notHtml, (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
    expectError(await u.api.get("/api/link-check/instant-view", { query: { url: ext(notHtml) } }), 422, "Это не статья");

    const short = p("short");
    egress.site().routes.set(short, html("<html><body><p>Коротко.</p></body></html>"));
    expectError(await u.api.get("/api/link-check/instant-view", { query: { url: ext(short) } }), 422, "На странице не нашлось статьи");

    const broken = p("broken");
    egress.site().routes.set(broken, html("oops", {}, 500));
    expectError(await u.api.get("/api/link-check/instant-view", { query: { url: ext(broken) } }), 502, "Сайт ответил ошибкой 500");

    expectError(await u.api.get("/api/link-check/instant-view", { query: { url: `https://${PUBLIC_HOST}/down` } }), 502, "Не удалось открыть статью");
  });

  test("SSRF: частный адрес — 502 Не удалось открыть статью, запроса нет", async () => {
    const { baseUrl } = server();
    const u = await registerUser(baseUrl);
    const site = internal();
    site.routes.set("/article", html(`<p>${ARTICLE_TEXT}</p>`));
    expectError(await u.api.get("/api/link-check/instant-view", { query: { url: `${site.localUrl}/article` } }), 502, "Не удалось открыть статью");
    expectError(await u.api.get("/api/link-check/instant-view", { query: { url: "http://localhost/article" } }), 502, "Не удалось открыть статью");
    expect(site.hits).toEqual([]);
  });

  test("не больше 20 запросов в минуту на пользователя — дальше 429", async () => {
    const { baseUrl } = server();
    const u = await registerUser(baseUrl);
    const other = await registerUser(baseUrl);
    // Счётчик идёт до проверки адреса сайта, ошибочные запросы тоже считаются.
    for (let i = 0; i < 20; i++) {
      expectError(await u.api.get("/api/link-check/instant-view", { query: { url: "http://localhost/x" } }), 502, "Не удалось открыть статью");
    }
    expectError(await u.api.get("/api/link-check/instant-view", { query: { url: "http://localhost/x" } }), 429, "Слишком часто, подождите минуту");
    // Некорректная ссылка отсекается раньше лимита.
    expectError(await u.api.get("/api/link-check/instant-view", { query: { url: "ftp://x" } }), 400, "Некорректная ссылка");
    // Лимит — у каждого пользователя свой.
    expectError(await other.api.get("/api/link-check/instant-view", { query: { url: "http://localhost/x" } }), 502, "Не удалось открыть статью");
  });
});
