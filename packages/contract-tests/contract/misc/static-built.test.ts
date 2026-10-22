// Собранная версия клиента (USE_BUILD=1, как на боевом сервере): /dist с заранее
// сжатыми файлами (brotli, gzip) и вечным кэшем, index.html приложения из public/dist,
// остальные файлы public/ — с кэшем на час. Устаревшую сборку сервер сам пересобирает
// при старте (scripts/build.js), так что public/dist заранее не нужен.
import { describe, expect, test } from "vitest";
import { Api, rawStatus } from "../../support/client";
import { useServer } from "../../support/use-server";

const server = useServer({ env: { USE_BUILD: "1" } });
const anon = () => new Api(server().baseUrl);

const IMMUTABLE = "public, max-age=31536000, immutable";
const titleOf = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1];

describe("SPA из сборки", () => {
  test("/ и пути приложения — собранный index.html (без кэша); страницы — из public/", async () => {
    const root = await anon().get("/");
    expect(root.status).toBe(200);
    expect(root.headers.get("content-type")).toBe("text/html; charset=UTF-8");
    expect(root.headers.get("cache-control")).toBe("public, max-age=0");
    expect(titleOf(root.text)).toBe("Shalter");
    expect(root.text).toContain("/dist/");
    for (const path of ["/chat/c_abc", "/settings", "/dist/nope.js"]) {
      const res = await anon().get(path);
      expect(res.status, path).toBe(200);
      expect(res.text, path).toBe(root.text);
    }
    const promo = await anon().get("/promo");
    expect(titleOf(promo.text)).toBe("Shalter — мессенджер ");
    expect(promo.headers.get("cache-control")).toBe("public, max-age=0");
  });

  test("файлы public/ — кэш на час", async () => {
    const res = await anon().get("/manifest.webmanifest");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
  });
});

describe("/dist — сжатые заранее файлы и вечный кэш", () => {
  test("по Accept-Encoding: brotli важнее gzip, без поддержки — исходный файл", async () => {
    const root = await anon().get("/");
    const script = /src="(\/dist\/app\.js[^"]*)"/.exec(root.text)?.[1];
    expect(script).toBeTruthy();

    const plain = await anon().get(script!, { headers: { "accept-encoding": "identity" } });
    expect(plain.status).toBe(200);
    expect(plain.headers.get("content-encoding")).toBeNull();
    expect(plain.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(plain.headers.get("cache-control")).toBe(IMMUTABLE);
    expect(plain.headers.get("content-length")).toBe(String(Buffer.byteLength(plain.text)));

    for (const [accept, encoding] of [["br", "br"], ["gzip", "gzip"], ["gzip, br", "br"], ["gzip, deflate", "gzip"]]) {
      const res = await anon().get(script!, { headers: { "accept-encoding": accept } });
      expect(res.status, accept).toBe(200);
      expect(res.headers.get("content-encoding"), accept).toBe(encoding);
      expect(res.headers.get("content-type"), accept).toBe("text/javascript; charset=UTF-8");
      expect(res.headers.get("cache-control"), accept).toBe(IMMUTABLE);
      expect(res.headers.get("vary"), accept).toMatch(/Accept-Encoding/);
      expect(Number(res.headers.get("content-length")), accept).toBeLessThan(Buffer.byteLength(plain.text));
      expect(res.text, accept).toBe(plain.text);
    }
  });

  test("стили: свой тип; ETag сжатого файла — свой, If-None-Match — 304", async () => {
    const css = await anon().get("/dist/styles/base.css", { headers: { "accept-encoding": "br" } });
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toBe("text/css; charset=UTF-8");
    expect(css.headers.get("content-encoding")).toBe("br");
    const plain = await anon().get("/dist/styles/base.css", { headers: { "accept-encoding": "identity" } });
    expect(plain.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(css.headers.get("etag")).not.toBe(plain.headers.get("etag"));

    expect(await rawStatus(server().baseUrl, "/dist/styles/base.css", { "accept-encoding": "br", "if-none-match": css.headers.get("etag")! })).toBe(304);
  });

  test("/dist без слэша — 301, со слэшем — index.html сборки с вечным кэшем", async () => {
    const redirect = await anon().get("/dist");
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("location")).toBe("/dist/");
    const dir = await anon().get("/dist/", { headers: { "accept-encoding": "identity" } });
    expect(dir.status).toBe(200);
    expect(dir.headers.get("cache-control")).toBe(IMMUTABLE);
    expect(titleOf(dir.text)).toBe("Shalter");
  });
});
