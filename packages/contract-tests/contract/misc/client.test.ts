// Клиент — сборка apps/web: index.html на всех путях приложения (без кэша) и /assets с
// заранее сжатыми файлами (brotli, gzip) и вечным кэшем. Отдаёт её и NestJS, и старый
// сервер (откат). Здесь — заглушка сборки fixtures/web-dist (её же версия в /api/version).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { versionBody } from "../../schemas/misc";
import { Api, rawStatus } from "../../support/client";
import { expectOk } from "../../support/expect";
import { useServer } from "../../support/use-server";

const server = useServer();
const anon = () => new Api(server().baseUrl);

const IMMUTABLE = "public, max-age=31536000, immutable";
const titleOf = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1];

describe("SPA — index.html сборки", () => {
  test("/ и пути приложения — index.html сборки без кэша; страницы — из public/", async () => {
    const root = await anon().get("/");
    expect(root.status).toBe(200);
    expect(root.headers.get("content-type")).toBe("text/html; charset=UTF-8");
    expect(root.headers.get("cache-control")).toBe("public, max-age=0");
    expect(titleOf(root.text)).toBe("Shalter");
    expect(root.text).toContain('src="/assets/app-test.js"');
    for (const p of ["/chat/c_abc", "/settings", "/settings/privacy", "/@someone"]) {
      const res = await anon().get(p);
      expect(res.status, p).toBe(200);
      expect(res.text, p).toBe(root.text);
    }
    const promo = await anon().get("/promo");
    expect(titleOf(promo.text)).toBe("Shalter — мессенджер ");
  });

  test("/api/version — версия из build.json сборки", async () => {
    expect(expectOk(await anon().get("/api/version"), versionBody).version).toBe("test-build");
  });
});

describe("/assets — сжатые заранее файлы и вечный кэш", () => {
  test("по Accept-Encoding: brotli важнее gzip, без поддержки — исходный файл", async () => {
    const plain = await anon().get("/assets/app-test.js", { headers: { "accept-encoding": "identity" } });
    expect(plain.status).toBe(200);
    expect(plain.headers.get("content-encoding")).toBeNull();
    expect(plain.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(plain.headers.get("cache-control")).toBe(IMMUTABLE);
    expect(plain.headers.get("content-length")).toBe(String(Buffer.byteLength(plain.text)));

    for (const [accept, encoding] of [["br", "br"], ["gzip", "gzip"], ["gzip, br", "br"], ["gzip, deflate", "gzip"]]) {
      const res = await anon().get("/assets/app-test.js", { headers: { "accept-encoding": accept } });
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
    const css = await anon().get("/assets/app-test.css", { headers: { "accept-encoding": "br" } });
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toBe("text/css; charset=UTF-8");
    expect(css.headers.get("content-encoding")).toBe("br");
    const plain = await anon().get("/assets/app-test.css", { headers: { "accept-encoding": "identity" } });
    expect(plain.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(css.headers.get("etag")).not.toBe(plain.headers.get("etag"));

    expect(await rawStatus(server().baseUrl, "/assets/app-test.css", { "accept-encoding": "br", "if-none-match": css.headers.get("etag")! })).toBe(304);
  });

  test("нет такого файла сборки — 404, а не index.html (старая вкладка просит прежний чанк)", async () => {
    for (const p of ["/assets/nope.js", "/assets/", "/assets/chat-OLD123.js"]) {
      const res = await anon().get(p);
      expect(res.status, p).toBe(404);
      expect(titleOf(res.text), p).toBeUndefined();
    }
  });
});

describe("без сборки клиента", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "shalter-no-web-"));
  const bare = useServer({ webDist: empty });
  afterAll(() => fs.rmSync(empty, { recursive: true, force: true }));

  test("страницы приложения — 503 с подсказкой; API и страницы public/ работают", async () => {
    const res = await new Api(bare().baseUrl).get("/chat/c_abc");
    expect(res.status).toBe(503);
    expect(res.text).toContain("npm run build");
    expect((await new Api(bare().baseUrl).get("/promo")).status).toBe(200);
    expect(expectOk(await new Api(bare().baseUrl).get("/api/version"), versionBody).version).toBe("dev");
  });
});
