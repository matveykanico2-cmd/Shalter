// Локальная копия заглушки внешнего мира из tests/contract/integrations/stubs.ts
// (там она завязана на хуки Vitest). Сервер сам ходит по ссылкам из сообщений
// (превью ссылок, проверка ссылки во встроенном браузере), поэтому у каждого
// сервера e2e (фикстура egress в fixtures.ts) весь исходящий fetch идёт через локальный
// CONNECT-прокси (NODE_USE_ENV_PROXY=1 + HTTP(S)_PROXY). Прокси пропускает туннель
// только к «сайту» PUBLIC_HOST:80 (TEST-NET-3, в интернете его нет; SSRF-фильтр
// сервера считает адрес публичным) — это локальный stub; всё прочее — 502.
import http from "node:http";
import net from "node:net";

export const PUBLIC_HOST = "203.0.113.10";

export type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

export interface Egress {
  /** env для startServer. */
  env: Record<string, string>;
  /** Обработчики «сайта» по точному пути; без обработчика — 404. */
  routes: Map<string, Handler>;
  /** Пути, которые запрашивал сервер. */
  hits: string[];
  stop(): Promise<void>;
}

function listen(server: http.Server): Promise<number> {
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

export async function startEgress(): Promise<Egress> {
  const routes = new Map<string, Handler>();
  const hits: string[] = [];
  const site = http.createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://stub").pathname;
    hits.push(path);
    const handler = routes.get(path);
    if (handler) return handler(req, res);
    res.statusCode = 404;
    res.end("not found");
  });
  const sitePort = await listen(site);

  const sockets = new Set<net.Socket>();
  const proxy = http.createServer((_req, res) => {
    res.statusCode = 502;
    res.end();
  });
  proxy.on("connect", (req: http.IncomingMessage, client: net.Socket, head: Buffer) => {
    sockets.add(client);
    client.on("close", () => sockets.delete(client));
    client.on("error", () => {});
    if (req.url !== `${PUBLIC_HOST}:80`) {
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
  const proxyUrl = `http://127.0.0.1:${await listen(proxy)}`;

  return {
    env: {
      NODE_USE_ENV_PROXY: "1",
      HTTP_PROXY: proxyUrl,
      HTTPS_PROXY: proxyUrl,
      http_proxy: proxyUrl,
      https_proxy: proxyUrl,
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
    routes,
    hits,
    async stop() {
      for (const s of sockets) s.destroy();
      await close(proxy);
      await close(site);
    },
  };
}

/** Ответ-HTML. */
export function html(body: string): Handler {
  return (_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(body);
  };
}
