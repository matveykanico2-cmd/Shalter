// Раздача файлов клиента из public/ без сборки (USE_BUILD=0, как у npm run dev): файлы,
// папки, архивы картинок (server/assets/packs, прежние адреса /img/emoji/… и т. п.) и
// то, что уходит в SPA. Страницы, /.well-known и /gift-scenes — в public.test.ts,
// собранная версия (/dist) — в static-built.test.ts.
import { describe, expect, test } from "vitest";
import { Api, rawStatus } from "../../support/client";
import { useServer } from "../../support/use-server";

const server = useServer();
const anon = () => new Api(server().baseUrl);

const titleOf = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1];

describe("файлы из public/", () => {
  test("тип, кэш без срока, ETag и Last-Modified; If-None-Match — 304, HEAD — без тела, Range — 206", async () => {
    const res = await anon().get("/manifest.webmanifest");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/manifest+json");
    expect(res.headers.get("cache-control")).toBe("public, max-age=0");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("last-modified")).toBeTruthy();
    const etag = res.headers.get("etag")!;
    expect(etag).toMatch(/^W\/"/);
    expect(JSON.parse(res.text)).toMatchObject({ name: "Shalter" });

    expect(await rawStatus(server().baseUrl, "/manifest.webmanifest", { "if-none-match": etag })).toBe(304);

    const head = await anon().request("HEAD", "/manifest.webmanifest");
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(String(Buffer.byteLength(res.text)));
    expect(head.text).toBe("");

    const part = await anon().get("/manifest.webmanifest", { headers: { range: "bytes=0-9" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 0-9/${Buffer.byteLength(res.text)}`);
    expect(part.text).toBe(res.text.slice(0, 10));
  });

  test("тип по расширению: sw.js, robots.txt", async () => {
    const sw = await anon().get("/sw.js");
    expect(sw.status).toBe(200);
    expect(sw.headers.get("content-type")).toBe("application/javascript; charset=UTF-8");
    const robots = await anon().get("/robots.txt");
    expect(robots.status).toBe(200);
    expect(robots.headers.get("content-type")).toBe("text/plain; charset=UTF-8");
    expect(robots.text).toContain("Disallow: /api/");
  });

  test("папка без слэша — 301 на адрес со слэшем; папка со слэшем — SPA", async () => {
    const root = await anon().get("/");
    for (const dir of ["/js", "/img", "/gift-scenes", "/.well-known"]) {
      const res = await anon().get(dir);
      expect(res.status, dir).toBe(301);
      expect(res.headers.get("location"), dir).toBe(`${dir}/`);
    }
    for (const dir of ["/js/", "/img/"]) {
      const res = await anon().get(dir);
      expect(res.status, dir).toBe(200);
      expect(res.text, dir).toBe(root.text);
    }
    const wk = await anon().get("/.well-known/");
    expect(wk.status).toBe(404);
    expect(wk.text).toBe("Not Found");
  });

  test("путь за пределы public/, скрытый файл, битая кодировка — SPA, а не файл", async () => {
    const root = await anon().get("/");
    for (const path of ["/js/%2e%2e/%2e%2e/server/app.js", "/js/%2e%2e/%2e%2e/package.json", "/.hidden", "/%E0%A4%A", "/js/%E0%A4%A"]) {
      const res = await anon().get(path);
      expect(res.status, path).toBe(200);
      expect(res.text, path).toBe(root.text);
    }
  });
});

describe("страницы: регистр, слэш в конце, строка запроса", () => {
  test.each([
    ["/PROMO", "Shalter — мессенджер "],
    ["/promo/", "Shalter — мессенджер "],
    ["/promo?from=ad", "Shalter — мессенджер "],
    ["/Knowledge/Shalter", "О Shalter — мессенджер"],
    ["/knowledge/", "Shalter Knowledge Base"],
    ["/GAMES", "Shalter Games — документация"],
  ])("%s — страница", async (path, title) => {
    const res = await anon().get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=UTF-8");
    expect(res.headers.get("cache-control")).toBe("public, max-age=0");
    expect(titleOf(res.text)).toBe(title);
  });

  test("HEAD страницы и SPA — заголовки без тела", async () => {
    for (const path of ["/promo", "/", "/chat/c_abc"]) {
      const get = await anon().get(path);
      const head = await anon().request("HEAD", path);
      expect(head.status, path).toBe(200);
      expect(head.headers.get("content-type"), path).toBe("text/html; charset=UTF-8");
      expect(head.headers.get("content-length"), path).toBe(String(Buffer.byteLength(get.text)));
      expect(head.text, path).toBe("");
    }
  });

  test("/games/… — SPA (встроенные игры лежат в public/games, но страницы у адреса нет)", async () => {
    const root = await anon().get("/");
    const res = await anon().get("/games/x");
    expect(res.status).toBe(200);
    expect(res.text).toBe(root.text);
  });

  test("не-GET вне /api — 404", async () => {
    for (const [method, path] of [["POST", "/promo"], ["DELETE", "/x"], ["PUT", "/manifest.webmanifest"]] as const) {
      expect((await anon().request(method, path)).status, `${method} ${path}`).toBe(404);
    }
  });
});

describe("архивы картинок по прежним адресам", () => {
  test.each([
    ["/img/emoji/0023-20e3.png", "image/png"],
    ["/gift-symbols/acorn.webp", "image/webp"],
    ["/gift-emoji/1f0cf.png", "image/png"],
    ["/tgs/Cake.json", "application/json"],
  ])("%s — %s, кэш на неделю, ETag; If-None-Match — 304; HEAD — длина без тела", async (path, type) => {
    // Без сжатия в Node: иначе Content-Length у ответа нет.
    const res = await anon().get(path, { headers: { "accept-encoding": "identity" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(type);
    expect(res.headers.get("cache-control")).toBe("public, max-age=604800");
    const etag = res.headers.get("etag")!;
    expect(etag).toMatch(/^"[a-z-]+-[a-z0-9.]+-[a-z0-9]+"$/);
    const length = res.headers.get("content-length");
    expect(Number(length)).toBeGreaterThan(0);

    expect(await rawStatus(server().baseUrl, path, { "if-none-match": etag })).toBe(304);

    const head = await anon().request("HEAD", path, { headers: { "accept-encoding": "identity" } });
    expect(head.status).toBe(200);
    expect(head.headers.get("etag")).toBe(etag);
    expect(head.headers.get("content-length")).toBe(length);
    expect(head.text).toBe("");
  });

  test("lottie из архива — тот JSON, что ждёт клиент", async () => {
    const res = await anon().get("/tgs/Cake.json");
    expect(res.body).toMatchObject({ fr: expect.any(Number), layers: expect.any(Array) });
  });

  test("нет в архиве, битая кодировка — SPA", async () => {
    const root = await anon().get("/");
    for (const path of ["/img/emoji/nope.png", "/img/emoji/%E0%A4%A", "/tgs/"]) {
      const res = await anon().get(path);
      expect(res.status, path).toBe(200);
      expect(res.text, path).toBe(root.text);
    }
  });
});
