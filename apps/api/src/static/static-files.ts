// Всё, что не API, — то же, что вторая половина server/app.js и в том же порядке: сборка
// клиента (/assets из apps/web/dist), /.well-known, страницы документации и промо, архивы
// картинок, файлы public/, и для остальных GET вне /api и /ws — index.html клиента (SPA).
// Стоит там, где у Nest нет маршрута (legacy-fallback.adapter.ts), — после всех маршрутов API.
//
// Файлы отдают те же библиотеки, что у старого приложения (serve-static 1 и send 0.19 из
// Express 4, express-static-gzip), поэтому заголовки совпадают байт в байт: Express 5
// из Nest отдал бы тот же файл с «charset=utf-8» и без «public» в Cache-Control.
import path from "node:path";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import expressStaticGzip from "express-static-gzip";
import send from "send";
import serveStatic from "serve-static";
import { PUBLIC_DIR } from "../common/config/paths.js";
import { assetPacks } from "./lib/asset-packs.js";
import { WEB_DIST_DIR, WEB_INDEX_HTML, webClientBuilt } from "./lib/web-client.js";

type Handler = (req: Request, res: Response, next: NextFunction) => void;

// Страницы по точному адресу. Как у app.get в Express: без учёта регистра и со слэшем в конце.
// Документация и /games — раньше файлов public/: иначе serve-static увидел бы папку
// (public/knowledge, встроенные игры в public/games) и ответил 301 на адрес со слэшем.
const DOC_PAGES: Record<string, string> = {
  "/knowledge": "knowledge/index.html",
  "/knowledge/shalter": "knowledge/shalter.html",
  "/knowledge/bot-api": "knowledge/bot-api.html",
  "/knowledge/architecture": "knowledge/architecture.html",
  "/games": "games.html",
};
const PAGES: Record<string, string> = {
  "/download": "download.html",
  "/promo": "promo.html",
  "/short": "short.html",
  "/premium": "premium.html",
  "/bots": "bots.html",
  "/oauth-docs": "oauth-docs.html",
};

// Исключаются только /api, /api/…, /ws и /ws/… — «/apiary» или «/wsx» тоже страницы SPA.
const SPA_PATH = /^\/(?!(?:api|ws)(?:\/|$)).*/;

const pageKey = (pathname: string) => pathname.toLowerCase().replace(/(.)\/$/, "$1");

const isRead = (req: Request) => req.method === "GET" || req.method === "HEAD";

/**
 * Файл как res.sendFile в Express 4: send 0.19 с путём через encodeURI; папка — дальше,
 * обрыв соединения и ошибка записи — без ответа, остальные ошибки — в next.
 */
function sendFile(req: Request, res: Response, next: NextFunction, file: string) {
  send(req, encodeURI(file))
    .on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EISDIR") return next();
      if (err.code !== "ECONNABORTED" && err.syscall !== "write") next(err);
    })
    .pipe(res);
}

/** Страница по точному адресу, как app.get в Express: только GET и HEAD. */
function pages(table: Record<string, string>): Handler {
  return (req, res, next) => {
    const key = pageKey(req.path);
    if (!isRead(req) || !Object.hasOwn(table, key)) return next();
    sendFile(req, res, next, path.join(PUBLIC_DIR, table[key]));
  };
}

/**
 * Обработчики под префиксом — как app.use(prefix, …) в Express 4, для любого метода:
 * префикс целым сегментом, без учёта регистра, срезается с req.url на время вызова
 * (пустой остаток — «/») и возвращается перед next.
 */
function mount(prefix: string, ...handlers: Handler[]): Handler {
  const pattern = new RegExp(`^${prefix.replace(/[.]/g, "\\.")}\\/?(?=\\/|$)`, "i");
  return (req, res, next) => {
    const matched = pattern.exec(req.path)?.[0];
    if (matched === undefined) return next();
    const run = (i: number) => {
      if (i === handlers.length) return next();
      req.url = req.url.slice(matched.length);
      const slashAdded = !req.url.startsWith("/");
      if (slashAdded) req.url = `/${req.url}`;
      handlers[i](req, res, (err?: unknown) => {
        req.url = matched + (slashAdded ? req.url.slice(1) : req.url);
        if (err) return next(err);
        run(i + 1);
      });
    };
    run(0);
  };
}

const notFound: Handler = (_req, res) => void res.sendStatus(404);

/** Сборки клиента нет — страница приложения объясняет, что делать (а не 404 от send). */
const notBuilt: Handler = (_req, res) =>
  void res.status(503).type("text/plain; charset=utf-8").send("Клиент не собран: выполните npm run build (сборка apps/web).\n");

export function staticFiles(): RequestHandler {
  const chain: Handler[] = [
    // Сборка клиента: имена с хешем — вечный кэш; brotli и gzip сжаты заранее (scripts/build.js).
    mount(
      "/assets",
      expressStaticGzip(path.join(WEB_DIST_DIR, "assets"), { enableBrotli: true, orderPreference: ["br", "gz"], serveStatic: { maxAge: "1y", immutable: true } }),
      notFound
    ),
    mount("/.well-known", serveStatic(path.join(PUBLIC_DIR, ".well-known"), { maxAge: "1h" }), notFound),
    pages(DOC_PAGES),
    assetPacks(),
    serveStatic(PUBLIC_DIR, { index: false, maxAge: "1h" }),
    // Сцены подарков (по файлу на подарок): нет такой сцены — 404, а не index.html приложения.
    mount("/gift-scenes", notFound),
    pages(PAGES),
    (req, res, next) => {
      if (!isRead(req) || !SPA_PATH.test(req.path)) return next();
      if (!webClientBuilt()) return notBuilt(req, res, next);
      sendFile(req, res, next, WEB_INDEX_HTML);
    },
  ];
  return (req, res, next) => {
    const run = (i: number, err?: unknown) => {
      if (err || i === chain.length) return next(err);
      chain[i](req, res, (e?: unknown) => run(i + 1, e));
    };
    run(0);
  };
}
