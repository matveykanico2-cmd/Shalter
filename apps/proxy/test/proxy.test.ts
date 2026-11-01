// Прокси против поддельного сервера Shalter (node:http + ws): HTTP в обе стороны, cookie,
// Range, перенаправления, файл из «S3» через прокси, WebSocket и вход по секрету.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http, { type IncomingHttpHeaders, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";

import { WebSocket, WebSocketServer } from "ws";

import { configFromEnv, hostAllowed, type ProxyConfig } from "../src/config.ts";
import { createProxyServer, GATE_COOKIE } from "../src/proxy.ts";

type Seen = { method: string; url: string; headers: IncomingHttpHeaders; bodyHash: string; bodyLength: number };
type Reply = { status: number; headers: IncomingHttpHeaders; body: Buffer };

const FILE = crypto.randomBytes(100_000);
const listen = (server: Server) => new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
const close = (server: Server) =>
  new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });

function request(port: number, opts: { method?: string; path?: string; headers?: Record<string, string>; body?: Buffer } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: opts.method ?? "GET", path: opts.path ?? "/", headers: opts.headers, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end(opts.body);
  });
}

/** Отдать кусок FILE по Range — как serveUpload/хранилище. */
function sendFile(req: IncomingMessage, res: http.ServerResponse, extra: Record<string, string> = {}) {
  const m = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ""));
  if (m) {
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : FILE.length - 1;
    res.writeHead(206, { ...extra, "content-type": "application/octet-stream", "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${FILE.length}`, "content-length": end - start + 1 });
    res.end(FILE.subarray(start, end + 1));
    return;
  }
  res.writeHead(200, { ...extra, "content-type": "application/octet-stream", "accept-ranges": "bytes", "content-length": FILE.length });
  res.end(FILE);
}

describe("прокси Shalter", () => {
  const seen: Seen[] = [];
  let upstream: Server;
  let storage: Server;
  let upstreamPort = 0;
  let storagePort = 0;
  const wsCookies: string[] = [];

  before(async () => {
    storage = http.createServer((req, res) => {
      if (req.url?.startsWith("/bucket/file.bin?X-Amz-Signature=ok")) return sendFile(req, res, { "cache-control": "private, max-age=31536000, immutable" });
      res.writeHead(403).end();
    });
    storagePort = await listen(storage);

    upstream = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        seen.push({ method: req.method!, url: req.url!, headers: req.headers, bodyHash: crypto.createHash("sha256").update(body).digest("hex"), bodyLength: body.length });
        const url = new URL(req.url!, "http://x");
        if (url.pathname === "/api/echo") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ length: body.length, hash: crypto.createHash("sha256").update(body).digest("hex") }));
        } else if (url.pathname === "/api/login") {
          res.writeHead(200, {
            "set-cookie": ["session_uids=%5B%22u1%22%5D; Max-Age=100; Path=/; HttpOnly; SameSite=Lax", "device_id=d1; Domain=shalter.example; Path=/; Secure; HttpOnly"],
          });
          res.end("{}");
        } else if (url.pathname === "/go-home") {
          res.writeHead(302, { location: `http://127.0.0.1:${upstreamPort}/chat/1?x=1` });
          res.end();
        } else if (url.pathname === "/elsewhere") {
          res.writeHead(302, { location: "https://example.org/page" });
          res.end();
        } else if (url.pathname === "/uploads/media.bin") {
          sendFile(req, res);
        } else if (url.pathname === "/uploads/s3.bin") {
          res.writeHead(302, { location: `http://localhost:${storagePort}/bucket/file.bin?X-Amz-Signature=ok`, "cache-control": "private, max-age=600" });
          res.end();
        } else {
          res.writeHead(200, { "content-type": "text/html" });
          res.end("<!doctype html><title>Shalter</title>");
        }
      });
    });
    const wss = new WebSocketServer({ noServer: true });
    upstream.on("upgrade", (req, socket, head) => {
      if (req.url !== "/ws") {
        socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
        return;
      }
      if (!String(req.headers.cookie ?? "").includes("session_uids=")) {
        socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
        return;
      }
      wsCookies.push(String(req.headers.cookie));
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.send(JSON.stringify({ type: "hello", host: req.headers.host, origin: req.headers.origin }));
        ws.on("message", (data) => ws.send(`echo:${String(data)}`));
      });
    });
    upstreamPort = await listen(upstream);
  });

  after(async () => {
    await close(upstream);
    await close(storage);
  });

  const config = (over: Partial<ProxyConfig> = {}): ProxyConfig => ({
    upstream: new URL(`http://127.0.0.1:${upstreamPort}`),
    secret: null,
    trustForwarded: false,
    relayHosts: ["localhost"],
    publicUrl: null,
    ...over,
  });

  async function withProxy(over: Partial<ProxyConfig>, fn: (port: number) => Promise<void>) {
    const server = createProxyServer(config(over));
    const port = await listen(server);
    try {
      await fn(port);
    } finally {
      await close(server);
    }
  }

  test("страница: Host, Origin и Referer — сервера, адрес клиента — X-Forwarded-For прокси", async () => {
    await withProxy({}, async (port) => {
      const res = await request(port, {
        path: "/settings?tab=1",
        headers: { host: `proxy.test:${port}`, origin: `http://proxy.test:${port}`, referer: `http://proxy.test:${port}/chat/5?a=b`, "x-forwarded-for": "6.6.6.6", "x-real-ip": "6.6.6.6" },
      });
      assert.equal(res.status, 200);
      assert.match(res.body.toString(), /Shalter/);
      const got = seen.at(-1)!;
      assert.equal(got.url, "/settings?tab=1");
      assert.equal(got.headers.host, `127.0.0.1:${upstreamPort}`);
      assert.equal(got.headers.origin, `http://127.0.0.1:${upstreamPort}`);
      assert.equal(got.headers.referer, `http://127.0.0.1:${upstreamPort}/chat/5?a=b`);
      assert.equal(got.headers["x-forwarded-for"], "127.0.0.1");
      assert.equal(got.headers["x-real-ip"], undefined);
    });
  });

  test("за своим фронтом (PROXY_TRUST_FORWARDED) адрес клиента — последний в X-Forwarded-For", async () => {
    await withProxy({ trustForwarded: true }, async (port) => {
      await request(port, { headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.9" } });
      assert.equal(seen.at(-1)!.headers["x-forwarded-for"], "203.0.113.9");
    });
  });

  test("тело запроса и ответа идёт потоком (5 МБ туда и обратно)", async () => {
    await withProxy({}, async (port) => {
      const body = crypto.randomBytes(5 * 1024 * 1024);
      const res = await request(port, { method: "POST", path: "/api/echo", headers: { "content-type": "application/octet-stream" }, body });
      assert.equal(res.status, 200);
      const json = JSON.parse(res.body.toString()) as { length: number; hash: string };
      assert.equal(json.length, body.length);
      assert.equal(json.hash, crypto.createHash("sha256").update(body).digest("hex"));
    });
  });

  test("Set-Cookie — на адрес прокси: без Domain, без Secure по http", async () => {
    await withProxy({}, async (port) => {
      const res = await request(port, { method: "POST", path: "/api/login" });
      const cookies = res.headers["set-cookie"]!;
      assert.equal(cookies.length, 2);
      assert.equal(cookies[0], "session_uids=%5B%22u1%22%5D; Max-Age=100; Path=/; HttpOnly; SameSite=Lax");
      assert.equal(cookies[1], "device_id=d1; Path=/; HttpOnly");
    });
  });

  test("Secure остаётся, если клиент пришёл по https (через свой фронт)", async () => {
    await withProxy({ trustForwarded: true }, async (port) => {
      const res = await request(port, { method: "POST", path: "/api/login", headers: { "x-forwarded-proto": "https" } });
      assert.equal(res.headers["set-cookie"]![1], "device_id=d1; Path=/; Secure; HttpOnly");
    });
  });

  test("перенаправление на сам сервер становится относительным, на чужой сайт — как есть", async () => {
    await withProxy({}, async (port) => {
      const home = await request(port, { path: "/go-home" });
      assert.equal(home.status, 302);
      assert.equal(home.headers.location, "/chat/1?x=1");
      const other = await request(port, { path: "/elsewhere" });
      assert.equal(other.headers.location, "https://example.org/page");
    });
  });

  test("Range: 206 и нужный кусок", async () => {
    await withProxy({}, async (port) => {
      const res = await request(port, { path: "/uploads/media.bin", headers: { range: "bytes=100-199" } });
      assert.equal(res.status, 206);
      assert.equal(res.headers["content-range"], `bytes 100-199/${FILE.length}`);
      assert.deepEqual(res.body, FILE.subarray(100, 200));
    });
  });

  test("302 на файл в хранилище прокси проходит сам: клиенту — содержимое, Range тоже", async () => {
    await withProxy({}, async (port) => {
      const whole = await request(port, { path: "/uploads/s3.bin" });
      assert.equal(whole.status, 200);
      assert.deepEqual(whole.body, FILE);
      assert.equal(whole.headers["cache-control"], "private, max-age=31536000, immutable");
      const part = await request(port, { path: "/uploads/s3.bin", headers: { range: "bytes=10-19" } });
      assert.equal(part.status, 206);
      assert.deepEqual(part.body, FILE.subarray(10, 20));
      const head = await request(port, { method: "HEAD", path: "/uploads/s3.bin" });
      assert.equal(head.status, 200);
      assert.equal(head.body.length, 0);
    });
  });

  test("хранилище не из списка — 302 уходит клиенту как есть", async () => {
    await withProxy({ relayHosts: ["storage.yandexcloud.net"] }, async (port) => {
      const res = await request(port, { path: "/uploads/s3.bin" });
      assert.equal(res.status, 302);
      assert.match(String(res.headers.location), /^http:\/\/localhost:\d+\/bucket\/file\.bin/);
    });
  });

  test("WebSocket /ws: cookie доходит, Host и Origin — сервера, сообщения в обе стороны", async () => {
    await withProxy({}, async (port) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie: "session_uids=%5B%22u1%22%5D", origin: `http://127.0.0.1:${port}` } });
      const messages: string[] = [];
      await new Promise<void>((resolve, reject) => {
        ws.on("message", (data) => {
          messages.push(String(data));
          if (messages.length === 1) ws.send("ping-1");
          if (messages.length === 2) resolve();
        });
        ws.on("error", reject);
      });
      const hello = JSON.parse(messages[0]!) as { host: string; origin: string };
      assert.equal(hello.host, `127.0.0.1:${upstreamPort}`);
      assert.equal(hello.origin, `http://127.0.0.1:${upstreamPort}`);
      assert.equal(messages[1], "echo:ping-1");
      ws.close();
    });
  });

  test("WebSocket без сессии — ответ сервера (401) клиенту", async () => {
    await withProxy({}, async (port) => {
      const status = await new Promise<number>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
        ws.on("error", () => {});
      });
      assert.equal(status, 401);
    });
  });

  describe("с секретом (PROXY_SECRET)", () => {
    const secret = "s3cr3t-Link_42";

    test("без ссылки — 404 на всё, и на WebSocket тоже", async () => {
      await withProxy({ secret }, async (port) => {
        const before = seen.length;
        assert.equal((await request(port)).status, 404);
        assert.equal((await request(port, { path: "/api/proxy-info" })).status, 404);
        assert.equal((await request(port, { path: "/?proxy=wrong-secret" })).status, 404);
        assert.equal(seen.length, before, "до сервера ничего не дошло");
        const status = await new Promise<number>((resolve) => {
          const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie: "session_uids=x" } });
          ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
          ws.on("error", () => {});
        });
        assert.equal(status, 404);
      });
    });

    test("ссылка с секретом ставит cookie и убирает секрет из адреса; дальше всё работает, cookie прокси серверу не уходит", async () => {
      await withProxy({ secret }, async (port) => {
        const enter = await request(port, { path: `/settings?proxy=${secret}&tab=2` });
        assert.equal(enter.status, 302);
        assert.equal(enter.headers.location, "/settings?tab=2");
        const cookie = enter.headers["set-cookie"]![0]!;
        assert.match(cookie, new RegExp(`^${GATE_COOKIE}=[\\w-]+; Path=/; Max-Age=\\d+; HttpOnly; SameSite=Lax$`));
        assert.ok(!cookie.includes(secret), "в cookie — не сам секрет");
        const gate = cookie.split(";")[0]!;

        const page = await request(port, { path: "/chat/1", headers: { cookie: `${gate}; session_uids=abc` } });
        assert.equal(page.status, 200);
        assert.equal(seen.at(-1)!.headers.cookie, "session_uids=abc");

        const info = await request(port, { path: "/api/proxy-info", headers: { cookie: gate, host: "proxy.test:8443" } });
        assert.equal(info.status, 200);
        assert.deepEqual(JSON.parse(info.body.toString()), { proxy: true, link: `http://proxy.test:8443/?proxy=${secret}`, upstream: `http://127.0.0.1:${upstreamPort}`, private: true });

        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie: `${gate}; session_uids=abc` } });
        const first = await new Promise<string>((resolve, reject) => {
          ws.on("message", (d) => resolve(String(d)));
          ws.on("error", reject);
        });
        assert.match(first, /hello/);
        assert.equal(wsCookies.at(-1), "session_uids=abc");
        ws.close();
      });
    });
  });

  test("без секрета /api/proxy-info отвечает ссылкой на сам прокси (PROXY_PUBLIC_URL)", async () => {
    await withProxy({ publicUrl: new URL("https://p.example.net") }, async (port) => {
      const info = JSON.parse((await request(port, { path: "/api/proxy-info" })).body.toString()) as { link: string; private: boolean };
      assert.equal(info.link, "https://p.example.net/");
      assert.equal(info.private, false);
    });
  });

  test("сервер недоступен — 502 с понятным текстом", async () => {
    await withProxy({ upstream: new URL("http://127.0.0.1:9") }, async (port) => {
      const res = await request(port);
      assert.equal(res.status, 502);
      assert.match(res.body.toString(), /недоступен/);
    });
  });
});

describe("настройки", () => {
  test("из окружения", () => {
    const c = configFromEnv({ SHALTER_UPSTREAM: "https://shalter.example/some/path", PROXY_SECRET: "abcdefgh12", PROXY_TRUST_FORWARDED: "1", PROXY_RELAY_HOSTS: "s3.example.com, *.cdn.example" });
    assert.equal(c.upstream.origin, "https://shalter.example");
    assert.equal(c.secret, "abcdefgh12");
    assert.equal(c.trustForwarded, true);
    assert.deepEqual(c.relayHosts, ["s3.example.com", "*.cdn.example"]);
    assert.equal(configFromEnv({}).upstream.origin, "https://shalter.ru");
    assert.throws(() => configFromEnv({ PROXY_SECRET: "short" }));
  });

  test("список хостов хранилища", () => {
    const list = ["storage.yandexcloud.net", "*.storage.yandexcloud.net"];
    assert.ok(hostAllowed("storage.yandexcloud.net", list));
    assert.ok(hostAllowed("bucket.storage.yandexcloud.net", list));
    assert.ok(!hostAllowed("evilstorage.yandexcloud.net", list));
    assert.ok(!hostAllowed("example.org", list));
  });
});
