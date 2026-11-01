// Прокси Shalter: весь сайт (страницы, API, файлы, WebSocket /ws) через себя к настоящему
// серверу — как прокси MTProto у Telegram, только для веб-клиента. Поднимается на любом
// сервере (README.md), раздаётся ссылкой https://<прокси>/?proxy=<секрет> или QR-кодом.
//
// Сервер Shalter ничего не знает о прокси: запрос приходит к нему с его же Host, Origin и
// Referer, адрес клиента — в X-Forwarded-For. Cookie сессии ставятся на адрес прокси
// (без Domain, Secure — только по https), перенаправления на сам сервер становятся
// относительными, а перенаправления на файлы в S3 прокси проходит сам (relayHosts).
import crypto from "node:crypto";
import http, { type IncomingHttpHeaders, type IncomingMessage, type OutgoingHttpHeaders, type ServerResponse } from "node:http";
import https from "node:https";
import type { Duplex } from "node:stream";

import { hostAllowed, type ProxyConfig } from "./config.ts";

export const GATE_COOKIE = "shalter_proxy";
/** Ответ прокси о себе: клиент по нему показывает «Вы подключены через прокси». На сервере Shalter такого пути нет (404). */
export const INFO_PATH = "/api/proxy-info";
const GATE_MAX_AGE = 400 * 24 * 60 * 60;
const MAX_RELAY_HOPS = 3;

// Заголовки одного соединения (RFC 9110 §7.6.1) — дальше не передаются.
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade"]);
// Адрес клиента прокси выставляет сам: присланные клиентом заголовки — подделка.
const CLIENT_SUPPLIED = new Set(["x-forwarded-for", "x-forwarded-proto", "x-forwarded-host", "x-forwarded-port", "x-real-ip", "forwarded", "via"]);
// Что передаём хранилищу, когда сами идём по перенаправлению на файл.
const RELAY_REQUEST_HEADERS = ["range", "if-range", "if-none-match", "if-modified-since", "accept", "accept-encoding", "user-agent"];

const agents = {
  "http:": new http.Agent({ keepAlive: true, maxSockets: 256 }),
  "https:": new https.Agent({ keepAlive: true, maxSockets: 256 }),
};

const clientOf = (url: URL) => (url.protocol === "https:" ? https : http);

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function hopHeaders(headers: IncomingHttpHeaders): Set<string> {
  const extra = first(headers.connection)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...HOP_BY_HOP, ...extra]);
}

function parseCookies(header: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return out;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const stripV4Mapped = (ip: string) => ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, "");

export function createProxy(config: ProxyConfig) {
  const { upstream, secret } = config;
  // В cookie — не сам секрет, а подпись от него: из cookie секрет не узнать.
  const gateToken = secret ? crypto.createHmac("sha256", secret).update("shalter-proxy-gate").digest("base64url") : null;

  /** Адрес клиента: свой сокет или (за своим фронтом) последний адрес, который тот дописал. */
  function clientIp(req: IncomingMessage): string {
    if (config.trustForwarded) {
      const chain = first(req.headers["x-forwarded-for"]).split(",").map((s) => s.trim()).filter(Boolean);
      if (chain.length) return stripV4Mapped(chain[chain.length - 1]!);
    }
    return stripV4Mapped(req.socket.remoteAddress ?? "");
  }

  function isHttps(req: IncomingMessage): boolean {
    if ("encrypted" in req.socket && req.socket.encrypted) return true;
    return config.trustForwarded && first(req.headers["x-forwarded-proto"]).split(",")[0]!.trim() === "https";
  }

  /** Адрес прокси, по которому его открыл клиент (или PROXY_PUBLIC_URL). */
  function publicOrigin(req: IncomingMessage): string {
    if (config.publicUrl) return config.publicUrl.origin;
    return `${isHttps(req) ? "https" : "http"}://${req.headers.host ?? "localhost"}`;
  }

  function shareLink(req: IncomingMessage): string {
    return secret ? `${publicOrigin(req)}/?proxy=${encodeURIComponent(secret)}` : `${publicOrigin(req)}/`;
  }

  function hasGateCookie(req: IncomingMessage): boolean {
    if (!gateToken) return true;
    const got = parseCookies(req.headers.cookie).get(GATE_COOKIE);
    return !!got && safeEqual(got, gateToken);
  }

  /** Заголовки запроса к серверу: его Host, его Origin/Referer, адрес клиента, без cookie прокси. */
  function upstreamHeaders(req: IncomingMessage, { upgrade = false } = {}): OutgoingHttpHeaders {
    const skip = hopHeaders(req.headers);
    const out: OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined || name === "host" || skip.has(name) || CLIENT_SUPPLIED.has(name)) continue;
      out[name] = value;
    }
    out.host = upstream.host;
    const self = req.headers.host?.toLowerCase();
    for (const name of ["origin", "referer"] as const) {
      const v = first(req.headers[name]);
      if (!v || !self) continue;
      try {
        const u = new URL(v);
        if (u.host.toLowerCase() === self) out[name] = name === "origin" ? upstream.origin : `${upstream.origin}${u.pathname}${u.search}`;
      } catch {
        delete out[name];
      }
    }
    if (gateToken && req.headers.cookie) {
      const rest = req.headers.cookie
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith(`${GATE_COOKIE}=`));
      if (rest.length) out.cookie = rest.join("; ");
      else delete out.cookie;
    }
    out["x-forwarded-for"] = clientIp(req);
    if (upgrade) {
      out.connection = "Upgrade";
      out.upgrade = first(req.headers.upgrade);
    }
    return out;
  }

  /** Cookie сервера — на адрес прокси: без Domain; Secure — только если прокси на https. */
  function rewriteSetCookie(value: string, secure: boolean): string {
    const parts = value.split(";").map((s) => s.trim());
    const kept = parts.filter((p, i) => {
      if (i === 0) return true;
      const key = p.split("=")[0]!.trim().toLowerCase();
      if (key === "domain") return false;
      if (key === "secure" && !secure) return false;
      return true;
    });
    // SameSite=None без Secure браузер отбрасывает — по http такая cookie становится Lax.
    return kept.map((p) => (!secure && /^samesite\s*=\s*none$/i.test(p) ? "SameSite=Lax" : p)).join("; ");
  }

  /** Перенаправление на сам сервер — относительное, чтобы клиент остался на прокси. */
  function rewriteLocation(value: string): string {
    try {
      const u = new URL(value, upstream);
      if (u.origin === upstream.origin) return `${u.pathname}${u.search}${u.hash}`;
    } catch {}
    return value;
  }

  function responseHeaders(res: IncomingMessage, secure: boolean, { location = true } = {}): OutgoingHttpHeaders {
    const skip = hopHeaders(res.headers);
    const out: OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries(res.headers)) {
      if (value === undefined || skip.has(name)) continue;
      if (name === "set-cookie") out[name] = (value as string[]).map((c) => rewriteSetCookie(c, secure));
      else if (name === "location" && location) out[name] = rewriteLocation(String(value));
      else out[name] = value;
    }
    return out;
  }

  function relayTarget(status: number, location: string | undefined, method: string): URL | null {
    if (status < 300 || status > 399 || !location || (method !== "GET" && method !== "HEAD")) return null;
    try {
      const u = new URL(location, upstream);
      if ((u.protocol === "https:" || u.protocol === "http:") && u.origin !== upstream.origin && hostAllowed(u.hostname, config.relayHosts)) return u;
    } catch {}
    return null;
  }

  function fail(res: ServerResponse, status = 502) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end(status === 502 ? "Сервер Shalter недоступен через этот прокси\n" : "");
  }

  function notFound(res: ServerResponse) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found\n");
  }

  /** Перенаправление на файл в хранилище: идём сами, клиенту — само содержимое. */
  function relay(target: URL, req: IncomingMessage, res: ServerResponse, secure: boolean, hops: number) {
    const headers: OutgoingHttpHeaders = {};
    for (const name of RELAY_REQUEST_HEADERS) if (req.headers[name]) headers[name] = req.headers[name];
    // Подпись ссылки — на GET: HEAD хранилище отклонило бы, поэтому всегда GET, а тело для HEAD не отдаём.
    const out = clientOf(target).request(target, { method: "GET", headers, agent: agents[target.protocol as "http:" | "https:"] }, (up) => {
      const next = relayTarget(up.statusCode ?? 502, up.headers.location, "GET");
      if (next && hops < MAX_RELAY_HOPS) {
        up.resume();
        relay(next, req, res, secure, hops + 1);
        return;
      }
      const h = responseHeaders(up, secure, { location: false });
      delete h["set-cookie"];
      res.writeHead(up.statusCode ?? 502, h);
      if (req.method === "HEAD") {
        res.end();
        up.destroy();
      } else up.pipe(res);
    });
    out.on("error", () => fail(res));
    res.on("close", () => {
      if (!res.writableFinished) out.destroy();
    });
    out.end();
  }

  function handleRequest(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://proxy.invalid");
    const secure = isHttps(req);

    if (secret) {
      const given = url.searchParams.get("proxy");
      if (given !== null && safeEqual(given, secret)) {
        // Открыли ссылку с секретом: запоминаем в cookie и убираем секрет из адресной строки.
        url.searchParams.delete("proxy");
        res.writeHead(302, {
          location: `${url.pathname}${url.search}`,
          "set-cookie": `${GATE_COOKIE}=${gateToken}; Path=/; Max-Age=${GATE_MAX_AGE}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`,
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
        });
        res.end();
        return;
      }
      if (!hasGateCookie(req)) {
        req.resume();
        notFound(res);
        return;
      }
    }

    if (url.pathname === INFO_PATH && (req.method === "GET" || req.method === "HEAD")) {
      const body = JSON.stringify({ proxy: true, link: shareLink(req), upstream: upstream.origin, private: !!secret });
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : body);
      return;
    }

    const method = req.method ?? "GET";
    const out = clientOf(upstream).request(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstream.port || undefined,
        servername: upstream.hostname,
        method,
        path: req.url ?? "/",
        headers: upstreamHeaders(req),
        agent: agents[upstream.protocol as "http:" | "https:"],
      },
      (up) => {
        const target = relayTarget(up.statusCode ?? 502, up.headers.location, method);
        if (target) {
          up.resume();
          relay(target, req, res, secure, 1);
          return;
        }
        res.writeHead(up.statusCode ?? 502, up.statusMessage, responseHeaders(up, secure));
        up.pipe(res);
        up.on("error", () => res.destroy());
      }
    );
    out.on("error", () => fail(res));
    // Клиент ушёл (закрыл вкладку, отменил загрузку) — обрываем и запрос к серверу.
    res.on("close", () => {
      if (!res.writableFinished) out.destroy();
    });
    req.pipe(out);
  }

  function rawResponse(status: number, message: string, rawHeaders: string[], secure: boolean): string {
    let head = `HTTP/1.1 ${status} ${message}\r\n`;
    for (let i = 0; i < rawHeaders.length; i += 2) {
      const name = rawHeaders[i]!;
      const lower = name.toLowerCase();
      let value = rawHeaders[i + 1]!;
      if (status !== 101 && HOP_BY_HOP.has(lower)) continue;
      if (lower === "set-cookie") value = rewriteSetCookie(value, secure);
      head += `${name}: ${value}\r\n`;
    }
    return `${head}\r\n`;
  }

  /** WebSocket (/ws): тот же запрос upgrade к серверу, после 101 — труба в обе стороны. */
  function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    socket.on("error", () => socket.destroy());
    if (!hasGateCookie(req)) {
      socket.end("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
      return;
    }
    const secure = isHttps(req);
    const out = clientOf(upstream).request({
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port || undefined,
      servername: upstream.hostname,
      method: req.method ?? "GET",
      path: req.url ?? "/",
      headers: upstreamHeaders(req, { upgrade: true }),
      agent: false,
    });
    out.on("upgrade", (up, upSocket, upHead) => {
      socket.write(rawResponse(101, up.statusMessage || "Switching Protocols", up.rawHeaders, secure));
      if (upHead.length) socket.write(upHead);
      if (head.length) upSocket.write(head);
      for (const s of [socket, upSocket]) {
        if ("setNoDelay" in s && typeof s.setNoDelay === "function") s.setNoDelay(true);
        if ("setTimeout" in s && typeof s.setTimeout === "function") s.setTimeout(0);
      }
      upSocket.on("error", () => socket.destroy());
      socket.on("close", () => upSocket.destroy());
      upSocket.on("close", () => socket.destroy());
      upSocket.pipe(socket);
      socket.pipe(upSocket);
    });
    // Сервер отказал (401 без сессии, 404 чужой путь) — его ответ как есть, и закрываем.
    out.on("response", (up) => {
      socket.write(rawResponse(up.statusCode ?? 502, up.statusMessage ?? "", [...up.rawHeaders, "Connection", "close"], secure));
      up.pipe(socket);
    });
    out.on("error", () => socket.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"));
    socket.on("close", () => out.destroy());
    out.end();
  }

  return { handleRequest, handleUpgrade, gateToken };
}

/** Слушающий сервер: http, а с tls — https (сертификат и ключ). */
export function createProxyServer(config: ProxyConfig, tls?: { cert: Buffer; key: Buffer }) {
  const proxy = createProxy(config);
  const server = tls ? https.createServer({ cert: tls.cert, key: tls.key }) : http.createServer();
  // Загрузка большого файла по медленной сети идёт долго — общий лимит запроса не ставим.
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;
  server.keepAliveTimeout = 65_000;
  server.on("request", proxy.handleRequest);
  server.on("upgrade", proxy.handleUpgrade);
  server.on("clientError", (_err, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    else socket.destroy();
  });
  return server;
}
