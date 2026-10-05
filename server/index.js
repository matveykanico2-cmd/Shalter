require("./lib/loadConfig");
const dns = require("dns");
const fs = require("fs");
const path = require("path");
const http = require("http");

dns.setDefaultResultOrder(process.env.DNS_RESULT_ORDER === "verbatim" ? "verbatim" : "ipv4first");
const express = require("express");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const expressStaticGzip = require("express-static-gzip");
const { errorHandler } = require("./middleware/errors");
const { apiLimiter, authLimiter } = require("./middleware/rateLimit");
const { attachWebSocketServer } = require("./ws");
const { getCurrentUserId } = require("./middleware/auth");
const { takeSharePayload } = require("./routes/shareTarget");
const { initPush } = require("./push");
const { ensureSystemBot } = require("./data/systemBot");
const { ensureHugoAccount } = require("./data/hugoBot");
const { ensureHelperBotAccount } = require("./data/helperBot");
const { startAutoDeleteSweep } = require("./lib/autoDelete");
const { startDonationAlertsSweep } = require("./lib/donationAlerts");
const { startDonatePaySweep } = require("./lib/donatePay");
const { startBirthdaySweep } = require("./lib/birthdaySweep");
const { startHolidaySweep } = require("./lib/holidaySweep");
const { startScheduledMessagesSweep } = require("./lib/scheduledMessagesSweep");
const { startReminderSweep } = require("./lib/reminderSweep");
const { startAccountDeletionSweep } = require("./lib/accountDeletionSweep");

ensureSystemBot();
ensureHugoAccount();
ensureHelperBotAccount();

const app = express();
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const DIST_DIR = path.join(PUBLIC_DIR, "dist");
if (process.env.USE_BUILD !== "0") {
  try {
    const builder = require("../scripts/build");
    if (builder.isStale()) {
      console.log("[static] собранная версия устарела — пересобираю…");
      const started = Date.now();
      require("child_process").execFileSync(process.execPath, [path.join(__dirname, "..", "scripts", "build.js")], { stdio: "inherit" });
      console.log(`[static] сборка готова за ${Date.now() - started} мс`);
    }
  } catch (err) {
    console.error("[static] пересобрать не удалось, отдаю что есть:", err.message);
  }
}

const useBuilt = process.env.USE_BUILD !== "0" && fs.existsSync(path.join(DIST_DIR, "index.html"));
const indexHtml = path.join(useBuilt ? DIST_DIR : PUBLIC_DIR, "index.html");

if (!process.env.DISABLE_APP_GZIP) {
  app.use(
    compression({
      level: 6,
      filter: (req, res) => !req.path.startsWith("/dist/") && compression.filter(req, res),
    })
  );
}

app.use(cookieParser());
app.use(express.json({ limit: "25mb" }));

app.use("/api", apiLimiter);
app.use("/api/auth/login-email", authLimiter);
app.use("/api/auth/register-email", authLimiter);
app.use("/api/auth/code/start", authLimiter);
app.use("/api/auth/code/verify", authLimiter);
app.use("/api/auth/2fa/login", authLimiter);
app.use("/api/auth/recover", authLimiter);
app.use("/api/auth/change-password", authLimiter);
app.use("/api/auth/email", authLimiter);
app.use("/api/auth/passkey/login", authLimiter);

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
app.use("/api/bot-api", require("./routes/botApi"));
app.use("/api/posts", require("./routes/posts"));
app.use("/api/search", require("./routes/search"));
app.use("/api/push", require("./routes/push"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/admin", require("./routes/admin"));
app.get("/api/labels", (req, res) => res.json({ labels: require("./data/safetyLabels").listLabels() }));
app.use("/api/stories", require("./routes/stories"));
app.use("/api/premium", require("./routes/premium"));
app.use("/api/business", require("./routes/business"));
app.use("/api/nearby", require("./routes/nearby"));
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
app.use("/api/partners", require("./routes/partners"));
app.use("/api/oauth", require("./routes/oauth"));
app.use("/api/avatars", require("./routes/avatars"));
app.use("/api/profile-track", require("./routes/profileTrack"));
app.use("/api/status", require("./routes/profileStatus"));
app.get("/api/status-catalog", (req, res) => res.json({ items: require("./data/profileStatuses").listCatalog() }));
app.use("/api/usernames", require("./routes/usernames"));
app.use("/api/communities", require("./routes/communities"));
app.use("/api/bootstrap", require("./routes/bootstrap"));
app.use("/s", require("./routes/shortLinks"));
// Системное «Поделиться»: принимаем содержимое из меню «Поделиться» и отдаём
// его приложению по одноразовому токену.
app.use("/share-target", require("./routes/shareTarget"));
app.get("/api/share/:token", require("./middleware/auth").requireUserId, (req, res) => {
  const payload = takeSharePayload(req.params.token);
  if (!payload) return res.status(404).json({ error: "Ссылка устарела — поделитесь ещё раз" });
  res.json({ share: payload });
});

if (useBuilt) {
  app.use("/dist", expressStaticGzip(DIST_DIR, { enableBrotli: true, orderPreference: ["br", "gz"], serveStatic: { maxAge: "1y", immutable: true } }));
}
app.use("/.well-known", express.static(path.join(PUBLIC_DIR, ".well-known"), { maxAge: "1h" }));

app.use(express.static(PUBLIC_DIR, { index: false, maxAge: useBuilt ? "1h" : 0 }));

const { serveUpload } = require("./lib/serveUpload");
const { canAccessUpload } = require("./lib/uploadAccess");
const requireUserForUploads = (req, res, next) => {
  const uid = getCurrentUserId(req);
  if (!uid) return res.status(401).json({ error: "unauthorized" });
  if (!canAccessUpload(uid, req.params.filename)) return res.status(404).json({ error: "not found" });
  next();
};
app.get("/uploads/:filename", requireUserForUploads, serveUpload());
app.head("/uploads/:filename", requireUserForUploads, serveUpload());

app.get("/download", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "download.html")));
app.get("/promo", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "promo.html")));
app.get("/premium", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "premium.html")));
app.get("/bots", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "bots.html")));
app.get("/oauth-docs", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "oauth-docs.html")));

app.get(/^\/(?!api|ws).*/, (req, res) => {
  res.sendFile(indexHtml);
});

app.get("/api/version", (req, res) => {
  let version = "dev";
  try {
    if (fs.existsSync(path.join(DIST_DIR, "build.json"))) {
      version = JSON.parse(fs.readFileSync(path.join(DIST_DIR, "build.json"), "utf-8")).version ?? "dev";
    }
  } catch {
  }
  res.set("Cache-Control", "no-store");
  res.json({ version, startedAt: SERVER_STARTED_AT });
});

app.use(errorHandler);

const SERVER_STARTED_AT = new Date().toISOString();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
attachWebSocketServer(server);
startAutoDeleteSweep();
startDonationAlertsSweep();
startDonatePaySweep();
startBirthdaySweep();
startHolidaySweep();
startScheduledMessagesSweep();
startReminderSweep();
startAccountDeletionSweep();
require("./lib/orphanSweep").startOrphanSweep();
require("./lib/uploadsMigration").startAutoMigration();

try {
  const rtmp = require("./rtmp");
  const { broadcastToUsers } = require("./ws");
  const { getChat } = require("./data/chats");
  rtmp.start({
    onStreamChange: async (stream) => {
      const chat = await getChat(stream.chatId).catch(() => null);
      if (!chat) return;
      broadcastToUsers(chat.memberIds, { type: "live:state", streamId: stream.id });
    },
  });
  console.log(`[rtmp] поднимаем приём эфиров из OBS на rtmp://0.0.0.0:${rtmp.RTMP_PORT}/live`);
} catch (err) {
  console.error("[rtmp] не поднялся, вещание из OBS недоступно:", err.message);
}

initPush()
  .catch((err) => console.error("push init failed, push notifications disabled:", err))
  .finally(() => {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`shalter server listening on http://localhost:${PORT}`);
      console.log(
        useBuilt
          ? "[static] отдаём собранную версию из public/dist (один файл, сжатый заранее)"
          : "[static] отдаём исходники из public/ — для боевого сервера выполните npm run build"
      );
    });
  });

function shutdown() {
  console.log("shutting down…");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
