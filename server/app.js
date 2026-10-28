// Express-приложение целиком: маршруты, статика, обработчик ошибок. Без сервера и
// фоновых задач — их запускает runtime.js. Подключают его server/index.js и каркас
// NestJS (apps/api), который отдаёт сюда всё, что ещё не перенесено в Nest.
require("./lib/loadConfig");

// Если сервер остался от уже закрытого терминала, его stdout/stderr указывают на
// удалённый pts и каждая запись падает с EIO. node-media-server вешает глобальный
// uncaughtException-обработчик, который пишет ошибку в лог, — запись снова падает,
// и процесс уходит в бесконечный цикл, съедая CPU и переставая отвечать на запросы
// (список чатов в клиенте в это время просто пустой). Гасим ошибки записи в логи.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", () => {});
}

const dns = require("dns");
const fs = require("fs");
const path = require("path");

dns.setDefaultResultOrder(process.env.DNS_RESULT_ORDER === "verbatim" ? "verbatim" : "ipv4first");
const express = require("express");
const expressStaticGzip = require("express-static-gzip");
const { errorHandler } = require("./middleware/errors");
const { getCurrentUserId, requireUserId } = require("./middleware/auth");
const { ensureSystemBot } = require("./data/systemBot");
const { ensureHugoAccount } = require("./data/hugoBot");
const { ensureShalterAiAccount } = require("./data/shalterAiBot");
const { ensureHelperBotAccount } = require("./data/helperBot");

ensureSystemBot();
ensureHugoAccount();
ensureShalterAiAccount();
ensureHelperBotAccount();

const SERVER_STARTED_AT = new Date().toISOString();

const app = express();
app.set("trust proxy", 1);
app.set("json replacer", require("./lib/publicJson").publicJsonReplacer);

// Заголовки, сжатие, cookie, JSON-тело, лимиты — общие с NestJS (front.js).
app.use(require("./front").front);

const PUBLIC_DIR = path.join(__dirname, "..", "public");
// Клиент — сборка apps/web (npm run build); SHALTER_WEB_DIST — другая папка сборки.
const WEB_DIST_DIR = process.env.SHALTER_WEB_DIST ? path.resolve(process.env.SHALTER_WEB_DIST) : path.join(__dirname, "..", "apps", "web", "dist");
const indexHtml = path.join(WEB_DIST_DIR, "index.html");
const webClientBuilt = () => fs.existsSync(indexHtml);

// Все /api-маршруты перенесены в NestJS (apps/api/src/modules).
// Оставлены только спецмаршруты, не имеющие Nest-эквивалента.

// Режим контрактных тестов: один проход обхода по таймеру сейчас (по таймеру они в этом
// режиме не идут). Проход идёт там же, где на боевом сервере, — в фоновом процессе.
// now — момент, от которого обход считает сроки («старше суток», «сегодня день рождения»).
const { SWEEPS, runSweep, TEST_MODE } = require("./lib/sweeps");
if (TEST_MODE) {
  const workerBridge = require("./lib/workerBridge");
  app.post("/api/test/sweeps/:name", async (req, res) => {
    const { name } = req.params;
    if (!Object.hasOwn(SWEEPS, name)) return res.status(404).json({ error: "Нет такого обхода" });
    const now = req.body?.now === undefined ? new Date() : new Date(req.body.now);
    if (Number.isNaN(now.getTime())) return res.status(400).json({ error: "Некорректное время" });
    try {
      if (workerBridge.enabled) await workerBridge.askWorker("sweep", { name, now: now.toISOString() });
      else await runSweep(name, now);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// Сборка клиента: имена с хешем — вечный кэш; brotli и gzip сжаты заранее (scripts/build.js).
app.use("/assets", expressStaticGzip(path.join(WEB_DIST_DIR, "assets"), { enableBrotli: true, orderPreference: ["br", "gz"], serveStatic: { maxAge: "1y", immutable: true } }));
app.use("/assets", (_req, res) => res.sendStatus(404));
app.use("/.well-known", express.static(path.join(PUBLIC_DIR, ".well-known"), { maxAge: "1h" }));
// Несуществующий файл в /.well-known — честный 404, а не index.html приложения.
app.use("/.well-known", (_req, res) => res.sendStatus(404));

// Knowledge base pages — before express.static to prevent 301 redirect for /knowledge
app.get("/knowledge", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "knowledge", "index.html")));
app.get("/knowledge/shalter", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "knowledge", "shalter.html")));
app.get("/knowledge/bot-api", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "knowledge", "bot-api.html")));
app.get("/knowledge/architecture", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "knowledge", "architecture.html")));
// /games — тоже до express.static: иначе он видит папку public/games (встроенные игры) и отвечает 301 на /games/.
app.get("/games", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "games.html")));

// Эмодзи, узоры подарков, анимации — из архивов server/assets/packs (по прежним адресам)
app.use(require("./lib/assetPacks").assetPacks());
app.use(express.static(PUBLIC_DIR, { index: false, maxAge: "1h" }));
// Сцены подарков (по файлу на подарок): нет такой сцены — 404, а не index.html приложения.
app.use("/gift-scenes", (_req, res) => res.sendStatus(404));

const { serveUpload } = require("./lib/serveUpload");
const { canAccessUpload } = require("./lib/uploadAccess");
const requireUserForUploads = (req, res, next) => {
  const uid = getCurrentUserId(req);
  if (!uid) return res.status(401).json({ error: "unauthorized" });
  // Неверное имя файла — 404 без тела (serveUpload).
  if (!/^[a-z0-9]+_[a-f0-9]{16}(\.[a-z0-9]{1,12})?$/.test(req.params.filename ?? "")) return next();
  if (!canAccessUpload(uid, req.params.filename)) return res.status(404).json({ error: "not found" });
  next();
};
app.get("/uploads/:filename", requireUserForUploads, serveUpload());
app.head("/uploads/:filename", requireUserForUploads, serveUpload());

app.get("/download", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "download.html")));
app.get("/promo", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "promo.html")));
app.get("/short", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "short.html")));
app.get("/premium", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "premium.html")));
app.get("/bots", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "bots.html")));
app.get("/oauth-docs", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "oauth-docs.html")));

// Исключаются только /api, /api/…, /ws и /ws/… — «/apiary» или «/wsx» тоже страницы SPA.
app.get(/^\/(?!(?:api|ws)(?:\/|$)).*/, (req, res) => {
  if (!webClientBuilt()) return res.status(503).type("text/plain; charset=utf-8").send("Клиент не собран: выполните npm run build (сборка apps/web).\n");
  res.sendFile(indexHtml);
});

// Неизвестный /api-путь (или метод) — JSON, как и остальные ошибки API, а не HTML-страница Express.
// Внутри разделов, которые целиком требовали входа (router.use(requireUserId) в бывших
// server/routes), без сессии по-прежнему 401, а не 404.
const AUTH_ONLY_API = new Set([
  "admin", "ads", "ai", "avatars", "bootstrap", "bots", "business", "calls", "channels", "chats", "communities",
  "contacts", "custom-emoji", "donation-alerts", "export", "folders", "games", "geo", "gifts", "hugo", "link-check",
  "live", "nearby", "oauth", "partners", "posts", "premium", "profile-track", "promotions", "push", "reports",
  "search", "sessions", "settings", "stars", "status", "stickers", "stories", "support", "translate", "uploads",
  "usernames", "users",
]);
app.use("/api", (req, res, next) => {
  const section = req.path.split("/")[1] ?? "";
  if (AUTH_ONLY_API.has(section)) return requireUserId(req, res, next);
  next();
});
app.use("/api", (_req, res) => res.status(404).json({ error: "not found" }));

app.use(errorHandler);

module.exports = { app, webClientBuilt, WEB_DIST_DIR };
