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
const { takeSharePayload } = require("./routes/shareTarget");
const { ensureSystemBot } = require("./data/systemBot");
const { ensureHugoAccount } = require("./data/hugoBot");
const { ensureShalterAiAccount } = require("./data/shalterAiBot");
const { ensureHelperBotAccount } = require("./data/helperBot");
const { shapeBodyForViewer } = require("./lib/chatForViewer");

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

// Подписчиков канала в ответах видят только его админы (lib/chatForViewer.js).
app.use("/api", (req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => json(shapeBodyForViewer(body, req.uid));
  next();
});

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

app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/chats", require("./routes/chats"));
app.use("/api/link-check", require("./routes/linkCheck"));
app.use("/api/channels", require("./routes/channels"));
app.use("/api/contacts", require("./routes/contacts"));
app.use("/api/folders", require("./routes/folders"));
app.use("/api/calls", require("./routes/calls"));
app.use("/api/sessions", require("./routes/sessions"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/bots", require("./routes/bots"));
app.use("/api/games", require("./routes/games"));
app.use("/api/game-api", require("./routes/gameApi"));
app.use("/api/bot-api", require("./routes/botApi"));
app.use("/api/posts", require("./routes/posts"));
app.use("/api/search", require("./routes/search"));
app.use("/api/push", require("./routes/push"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/export", require("./routes/export"));
app.get("/api/labels", requireUserId, (req, res) => res.json({ labels: require("./data/safetyLabels").listLabels() }));
app.use("/api/stories", require("./routes/stories"));
app.use("/api/premium", require("./routes/premium"));
app.use("/api/business", require("./routes/business"));
app.use("/api/nearby", require("./routes/nearby"));
app.use("/api/geo", require("./routes/geo"));
app.use("/api/gifts", require("./routes/gifts"));
app.use("/api/ads", require("./routes/ads"));
app.use("/api/donation-alerts", require("./routes/donationAlerts"));
app.use("/api/translate", require("./routes/translate"));
app.use("/api/uploads", require("./routes/uploads"));
app.use("/api/live", require("./routes/live"));
app.use("/app", require("./routes/miniAppHost"));
app.use("/api/downloads", require("./routes/downloads"));
app.use("/api/hugo", require("./routes/hugo"));
app.use("/api/stickers", require("./routes/stickers"));
app.use("/api/custom-emoji", require("./routes/customEmoji"));
app.use("/api/stars", require("./routes/stars"));
app.use("/api/support", require("./routes/support"));
app.use("/api/ai", require("./routes/shalterAi"));
app.use("/api/partners", require("./routes/partners"));
app.use("/api/oauth", require("./routes/oauth"));
app.use("/api/avatars", require("./routes/avatars"));
app.use("/api/profile-track", require("./routes/profileTrack"));
app.use("/api/status", require("./routes/profileStatus"));
app.get("/api/status-catalog", requireUserId, (req, res) => res.json({ items: require("./data/profileStatuses").listCatalog() }));
app.use("/api/usernames", require("./routes/usernames"));
app.use("/api/communities", require("./routes/communities"));
app.use("/api/bootstrap", require("./routes/bootstrap"));
app.use("/api/promotions", require("./routes/promotions"));
app.use("/s", require("./routes/shortLinks"));
app.get("/api/short-links", (_req, res) => {
  try {
    res.json(require("./data/shortLinks").countLinks());
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
});
// Системное «Поделиться»: принимаем содержимое из меню «Поделиться» и отдаём
// его приложению по одноразовому токену.
app.use("/share-target", require("./routes/shareTarget"));
app.get("/api/share/:token", requireUserId, (req, res) => {
  const payload = takeSharePayload(req.params.token);
  if (!payload) return res.status(404).json({ error: "Ссылка устарела — поделитесь ещё раз" });
  res.json({ share: payload });
});

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

app.get("/api/version", (req, res) => {
  let version = "dev";
  try {
    if (fs.existsSync(path.join(WEB_DIST_DIR, "build.json"))) {
      version = JSON.parse(fs.readFileSync(path.join(WEB_DIST_DIR, "build.json"), "utf-8")).version ?? "dev";
    }
  } catch {
  }
  res.set("Cache-Control", "no-store");
  res.json({ version, startedAt: SERVER_STARTED_AT });
});

// Неизвестный /api-путь (или метод) — JSON, как и остальные ошибки API, а не HTML-страница Express.
app.use("/api", (_req, res) => res.status(404).json({ error: "not found" }));

app.use(errorHandler);

module.exports = { app, webClientBuilt, WEB_DIST_DIR };
