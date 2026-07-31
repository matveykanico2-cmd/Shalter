const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const expressStaticGzip = require("express-static-gzip");
const { errorHandler } = require("./middleware/errors");
const { apiLimiter, authLimiter } = require("./middleware/rateLimit");
const { attachWebSocketServer } = require("./ws");
const { initPush } = require("./push");

const app = express();
// Deployed behind nginx (see DEPLOY.md/deploy/nginx.conf.example) — trust
// its X-Forwarded-For so req.ip (rate limiting, session location tracking)
// reflects the real client instead of nginx's own address for every request.
app.set("trust proxy", 1);

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const DIST_DIR = path.join(PUBLIC_DIR, "dist");
// `npm run build` (scripts/build.js) bundles+minifies+precompresses the
// client into public/dist — use it only once it's actually there, so
// `npm start` in production without a prior build still serves something
// (the raw, unbundled files) instead of a blank page.
const useBuilt = process.env.NODE_ENV === "production" && fs.existsSync(path.join(DIST_DIR, "index.html"));
const indexHtml = path.join(useBuilt ? DIST_DIR : PUBLIC_DIR, "index.html");

// Gzip cuts network time for message/chat JSON (meaningfully so once
// attachments' base64 data is in the payload) at a modest CPU cost — worth it
// on a small box. Static assets are handled separately below (precompressed
// at build time when available, so no per-request CPU cost there at all).
// If nginx sits in front and already gzips, set DISABLE_APP_GZIP=1 to skip
// compressing twice.
if (!process.env.DISABLE_APP_GZIP) {
  app.use(compression({ level: 6, filter: (req) => !req.path.startsWith("/dist/") }));
}

app.use(cookieParser());
// Message attachments (voice notes, video-notes, images) are inline base64
// data URLs — a short voice/video clip can be a few MB, so raise the limit
// well above Composer's MAX_RECORD_SEC=20 worst case.
app.use(express.json({ limit: "25mb" }));

app.use("/api", apiLimiter);
app.use("/api/auth/login-email", authLimiter);
app.use("/api/auth/register-email", authLimiter);

app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/chats", require("./routes/chats"));
app.use("/api/contacts", require("./routes/contacts"));
app.use("/api/folders", require("./routes/folders"));
app.use("/api/calls", require("./routes/calls"));
app.use("/api/sessions", require("./routes/sessions"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/bots", require("./routes/bots"));
app.use("/api/posts", require("./routes/posts"));
app.use("/api/search", require("./routes/search"));
app.use("/api/push", require("./routes/push"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/stories", require("./routes/stories"));

if (useBuilt) {
  // Serves whichever of app.js/app.js.br/app.js.gz the client's
  // Accept-Encoding supports, straight off disk — the build already did the
  // compression, so this costs no CPU per request (unlike the `compression`
  // middleware above, which is why /dist/ is excluded from it).
  app.use("/dist", expressStaticGzip(DIST_DIR, { enableBrotli: true, orderPreference: ["br", "gz"], serveStatic: { maxAge: "1y", immutable: true } }));
}
// Static assets not covered by the build (favicon, anything added to public/
// directly). No build step for these, so keep cache short-ish rather than
// immutable — long enough to skip re-fetching on every navigation, short
// enough that a deploy doesn't need a hard refresh.
app.use(express.static(PUBLIC_DIR, { maxAge: "1h" }));

// Client-side router owns every non-API path — always serve the shell.
app.get(/^\/(?!api|ws).*/, (req, res) => {
  res.sendFile(indexHtml);
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
attachWebSocketServer(server);

// VAPID key setup must finish before anything can subscribe/send push, but
// must never block the server from coming up at all if it fails for some
// reason (e.g. a corrupt data/vapidKeys.json) — push is additive, not core.
initPush()
  .catch((err) => console.error("push init failed, push notifications disabled:", err))
  .finally(() => {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`shalter server listening on http://localhost:${PORT}`);
    });
  });

// Stop accepting new connections and let in-flight requests finish before
// exiting — an abrupt kill mid-write was the cause of a real data-loss bug
// (see server/data/store.js's cross-process lock comment).
function shutdown() {
  console.log("shutting down…");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
