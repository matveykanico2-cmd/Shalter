// HTTPS-заглушки внешнего мира для push (web-push шлёт только по https) и geo
// (ipwho.is, get.geojs.io, nominatim.openstreetmap.org зашиты в код).
//
// Сертификат заглушки — самоподписанный, лежит в fixtures/ (срок — 100 лет,
// SAN: localhost, 127.0.0.1, три геосервиса и PUSH_HOST — «публичный» push-сервис
// из TEST-NET-3). Сервер доверяет ему через NODE_EXTRA_CA_CERTS. Пересборка (в папке
// fixtures/; с существующим ключом — без -newkey/-nodes, с -key stub-tls.key):
//   openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
//     -keyout stub-tls.key -out stub-tls.crt -days 36500 -subj "/CN=Shalter test stub" \
//     -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,DNS:ipwho.is,DNS:get.geojs.io,DNS:nominatim.openstreetmap.org,IP:203.0.113.80" \
//     -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,digitalSignature,keyCertSign"
//
// Порядок важен (как в integrations/stubs.ts): заглушка поднимается в своём
// beforeAll, зарегистрированном ДО useServer(), и дописывает env по ссылке.
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll } from "vitest";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
export const STUB_CA_PATH = path.join(FIXTURES, "stub-tls.crt");
/** «Публичный» адрес push-сервиса (TEST-NET-3, без DNS): сервер шлёт на него через useTlsEgress. */
export const PUSH_HOST = "203.0.113.80";

export interface TlsHit {
  method: string;
  host: string;
  path: string;
  query: URLSearchParams;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

export type TlsHandler = (hit: TlsHit, res: http.ServerResponse) => void;

export interface TlsSite {
  hits: TlsHit[];
  /** Обработчики по ключу "host/path" (host без порта, path без query); без обработчика — 404. */
  routes: Map<string, TlsHandler>;
  /** https://127.0.0.1:port */
  url: string;
}

function listen(server: net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve((server.address() as net.AddressInfo).port));
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

async function startTlsSite(): Promise<{ site: TlsSite; server: https.Server; port: number }> {
  const site: TlsSite = { hits: [], routes: new Map(), url: "" };
  const server = https.createServer(
    { cert: fs.readFileSync(STUB_CA_PATH), key: fs.readFileSync(path.join(FIXTURES, "stub-tls.key")) },
    (req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const u = new URL(req.url ?? "/", "https://stub");
        const host = String(req.headers.host ?? "").replace(/:\d+$/, "");
        const hit: TlsHit = { method: req.method ?? "", host, path: u.pathname, query: u.searchParams, headers: req.headers, body: Buffer.concat(chunks) };
        site.hits.push(hit);
        const handler = site.routes.get(`${host}${u.pathname}`);
        if (handler) return handler(hit, res);
        res.statusCode = 404;
        res.end("not found");
      });
    }
  );
  const port = await listen(server);
  site.url = `https://127.0.0.1:${port}`;
  return { site, server, port };
}

/** HTTPS-сайт на 127.0.0.1 (для push-endpoint'ов); сервер ему доверяет. */
export function useTlsSite(env: Record<string, string>): () => TlsSite {
  let started: Awaited<ReturnType<typeof startTlsSite>> | undefined;
  beforeAll(async () => {
    started = await startTlsSite();
    env.NODE_EXTRA_CA_CERTS = STUB_CA_PATH;
  });
  afterAll(async () => {
    if (started) await close(started.server);
  });
  return () => {
    if (!started) throw new Error("TLS-заглушка ещё не поднята");
    return started.site;
  };
}

/**
 * Весь исходящий fetch сервера — через локальный CONNECT-прокси. Туннель к
 * hosts:443 уходит в TLS-заглушку (её сертификат подписан на эти имена), прочее —
 * 502. connects — журнал всех CONNECT ("host:port").
 */
export function useTlsEgress(env: Record<string, string>, hosts: string[]): { site: () => TlsSite; connects: string[] } {
  let started: Awaited<ReturnType<typeof startTlsSite>> | undefined;
  let proxy: http.Server | undefined;
  const connects: string[] = [];
  const sockets = new Set<net.Socket>();
  const allowed = new Set(hosts.map((h) => `${h}:443`));

  beforeAll(async () => {
    started = await startTlsSite();
    const sitePort = started.port;
    proxy = http.createServer((_req, res) => {
      res.statusCode = 502;
      res.end();
    });
    proxy.on("connect", (req: http.IncomingMessage, client: net.Socket, head: Buffer) => {
      const target = req.url ?? "";
      connects.push(target);
      sockets.add(client);
      client.on("close", () => sockets.delete(client));
      client.on("error", () => {});
      if (!allowed.has(target)) {
        client.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n");
        return;
      }
      const upstream = net.connect(sitePort, "127.0.0.1", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      sockets.add(upstream);
      upstream.on("close", () => sockets.delete(upstream));
      upstream.on("error", () => client.destroy());
    });
    const url = `http://127.0.0.1:${await listen(proxy)}`;
    Object.assign(env, {
      NODE_EXTRA_CA_CERTS: STUB_CA_PATH,
      NODE_USE_ENV_PROXY: "1",
      HTTP_PROXY: url,
      HTTPS_PROXY: url,
      http_proxy: url,
      https_proxy: url,
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    });
  });
  afterAll(async () => {
    for (const s of sockets) s.destroy();
    if (proxy) await close(proxy);
    if (started) await close(started.server);
  });
  return {
    connects,
    site: () => {
      if (!started) throw new Error("TLS-заглушка ещё не поднята");
      return started.site;
    },
  };
}

/** Ответ-JSON. */
export function json(value: unknown, status = 200): TlsHandler {
  return (_hit, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(value));
  };
}
