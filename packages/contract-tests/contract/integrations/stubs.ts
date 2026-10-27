// Заглушки внешнего мира для модулей, которые сами ходят в интернет
// (перевод, проверка ссылок, LanguageTool, релизы GitHub).
//
// Тесты не должны выходить в сеть. У части сервисов адрес задаётся переменной
// окружения (LANGUAGETOOL_URL) — туда ставится локальный stub-сервер. Остальные
// адреса зашиты в код (translate.googleapis.com, api.github.com, любые ссылки
// из link-check), поэтому весь исходящий fetch сервера заворачивается в локальный
// прокси: NODE_USE_ENV_PROXY=1 + HTTP(S)_PROXY. Прокси принимает только CONNECT
// и пропускает туннель лишь к «сайтам», зарегистрированным в тесте (адрес вида
// 203.0.113.x:80 — документационная сеть TEST-NET-3, в интернете её нет; сервер
// не считает её частной, поэтому SSRF-фильтр её пропускает). Всё прочее — отказ 502,
// а запрошенный адрес записывается: так видно, куда сервер пытался сходить.
//
// Порядок важен: stub/прокси поднимаются в своём beforeAll, который регистрируется
// ДО useServer(), и заполняют объект env, переданный в useServer по ссылке —
// startServer читает его уже после старта заглушек.
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll } from "vitest";

export type Handler = (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void;

export interface StubSite {
  /** Сколько запросов пришло на сайт (по путям). */
  hits: Array<{ method: string; path: string; headers: http.IncomingHttpHeaders; body: string; raw: Buffer }>;
  /** Обработчик по точному пути (без query); без обработчика — 404. */
  routes: Map<string, Handler>;
  port: number;
  /** Адрес сайта напрямую: http://127.0.0.1:port */
  localUrl: string;
}

function listen(server: http.Server | net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve((server.address() as net.AddressInfo).port));
  });
}

function close(server: http.Server | net.Server): Promise<void> {
  return new Promise((resolve) => {
    (server as http.Server).closeAllConnections?.();
    server.close(() => resolve());
  });
}

// Сертификат заглушек HTTPS-сервисов с зашитым адресом (нейросети Shalter AI): самоподписанный,
// только для тестов; сервер ему доверяет через NODE_EXTRA_CA_CERTS. Имена — в subjectAltName.
const TLS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "tls");
export const STUB_CA = path.join(TLS_DIR, "ai-stub.crt");

async function startSite({ tls = false } = {}): Promise<{ site: StubSite; server: http.Server }> {
  const site: StubSite = { hits: [], routes: new Map(), port: 0, localUrl: "" };
  const handler: http.RequestListener = (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const body = raw.toString("utf8");
      const pathname = new URL(req.url ?? "/", "http://stub").pathname;
      site.hits.push({ method: req.method ?? "", path: pathname, headers: req.headers, body, raw });
      const route = site.routes.get(pathname);
      if (route) return route(req, res, body);
      res.statusCode = 404;
      res.end("not found");
    });
  };
  const server = tls
    ? https.createServer({ cert: fs.readFileSync(STUB_CA), key: fs.readFileSync(path.join(TLS_DIR, "ai-stub.key")) }, handler)
    : http.createServer(handler);
  site.port = await listen(server);
  site.localUrl = `http://127.0.0.1:${site.port}`;
  return { site, server };
}

/** Локальный HTTP-сервер под LANGUAGETOOL_URL и т.п. env — значение переменной ставится в env[key]. */
export function useStubSite(env: Record<string, string>, key?: string, path = "/"): () => StubSite {
  let started: { site: StubSite; server: http.Server } | undefined;
  beforeAll(async () => {
    started = await startSite();
    if (key) env[key] = `${started.site.localUrl}${path}`;
  });
  afterAll(async () => {
    if (started) await close(started.server);
  });
  return () => {
    if (!started) throw new Error("stub ещё не поднят");
    return started.site;
  };
}

export interface StubProxy {
  /** Все CONNECT-запросы сервера: "host:port". */
  connects: string[];
  /** Публичные адреса «сайтов» → локальный stub. */
  sites: Map<string, StubSite>;
}

/** Публичный (по мнению сервера) адрес «сайта» — 203.0.113.x на порту 80. */
export const PUBLIC_HOST = "203.0.113.10";

/**
 * Прокси для всего исходящего fetch сервера. Возвращает env для useServer и
 * доступ к журналу CONNECT; сайт по адресу PUBLIC_HOST:80 — локальный stub.
 */
export function useEgressProxy({ tlsHosts = [] }: { tlsHosts?: string[] } = {}): {
  env: Record<string, string>;
  proxy: () => StubProxy;
  site: () => StubSite;
  /** HTTPS-заглушка для tlsHosts («openrouter.ai:443»): один сайт на все эти адреса. */
  tlsSite: () => StubSite;
} {
  const env: Record<string, string> = {};
  const proxyState: StubProxy = { connects: [], sites: new Map() };
  let proxyServer: http.Server | undefined;
  let siteStarted: { site: StubSite; server: http.Server } | undefined;
  let tlsStarted: { site: StubSite; server: http.Server } | undefined;
  const sockets = new Set<net.Socket>();

  beforeAll(async () => {
    siteStarted = await startSite();
    proxyState.sites.set(`${PUBLIC_HOST}:80`, siteStarted.site);
    if (tlsHosts.length) {
      tlsStarted = await startSite({ tls: true });
      for (const host of tlsHosts) proxyState.sites.set(host, tlsStarted.site);
    }
    proxyServer = http.createServer((_req, res) => {
      // Обычные (не CONNECT) запросы через прокси — тоже наружу; не пускаем.
      res.statusCode = 502;
      res.end();
    });
    proxyServer.on("connect", (req: http.IncomingMessage, client: net.Socket, head: Buffer) => {
      const target = req.url ?? "";
      proxyState.connects.push(target);
      sockets.add(client);
      client.on("close", () => sockets.delete(client));
      client.on("error", () => {});
      const site = proxyState.sites.get(target);
      if (!site) {
        client.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n");
        return;
      }
      const upstream = net.connect(site.port, "127.0.0.1", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      sockets.add(upstream);
      upstream.on("close", () => sockets.delete(upstream));
      upstream.on("error", () => client.destroy());
    });
    const port = await listen(proxyServer);
    const url = `http://127.0.0.1:${port}`;
    Object.assign(env, {
      NODE_USE_ENV_PROXY: "1",
      HTTP_PROXY: url,
      HTTPS_PROXY: url,
      http_proxy: url,
      https_proxy: url,
      // Локальные заглушки (LANGUAGETOOL_URL и т.п.) и 127.0.0.1:9 — мимо прокси.
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
      ...(tlsHosts.length ? { NODE_EXTRA_CA_CERTS: STUB_CA } : {}),
    });
  });
  afterAll(async () => {
    for (const s of sockets) s.destroy();
    if (proxyServer) await close(proxyServer);
    if (siteStarted) await close(siteStarted.server);
    if (tlsStarted) await close(tlsStarted.server);
  });
  return {
    env,
    proxy: () => proxyState,
    site: () => {
      if (!siteStarted) throw new Error("прокси ещё не поднят");
      return siteStarted.site;
    },
    tlsSite: () => {
      if (!tlsStarted) throw new Error("HTTPS-заглушка не поднята (tlsHosts пуст?)");
      return tlsStarted.site;
    },
  };
}

/** Ответ-HTML с заголовками. */
export function html(body: string, headers: Record<string, string> = {}, status = 200): Handler {
  return (_req, res) => {
    res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
    res.end(body);
  };
}

/** Ответ-JSON. */
export function json(value: unknown, status = 200): Handler {
  return (_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(value));
  };
}

/** Перенаправление. */
export function redirect(location: string, status = 302): Handler {
  return (_req, res) => {
    res.writeHead(status, { location });
    res.end();
  };
}
