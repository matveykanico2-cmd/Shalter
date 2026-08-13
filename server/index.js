const dns = require("dns");
const fs = require("fs");
const path = require("path");
const http = require("http");

// Outbound HTTP from this process (link previews, translation, DonationAlerts,
// the Hugo writing checker) goes through Node's fetch, which resolves a host to
// both its A and AAAA records. On a host that has no working IPv6 route — common
// on small VPSes and inside plenty of container networks — the AAAA attempt
// stalls and the request fails with ETIMEDOUT, while curl on the same box
// succeeds because it falls back to IPv4. Preferring IPv4 in the resolver avoids
// that whole class of "works in the shell, times out in the app" failure.
// Override with DNS_RESULT_ORDER=verbatim on an IPv6-only deployment.
dns.setDefaultResultOrder(process.env.DNS_RESULT_ORDER === "verbatim" ? "verbatim" : "ipv4first");
const express = require("express");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const expressStaticGzip = require("express-static-gzip");
const { errorHandler } = require("./middleware/errors");
const { apiLimiter, authLimiter } = require("./middleware/rateLimit");
const { attachWebSocketServer } = require("./ws");
const { initPush } = require("./push");
const { ensureSystemBot } = require("./data/systemBot");
const { startAutoDeleteSweep } = require("./lib/autoDelete");
const { startDonationAlertsSweep } = require("./lib/donationAlerts");
const { startScheduledMessagesSweep } = require("./lib/scheduledMessagesSweep");

ensureSystemBot();

const app = express();
// Deployed behind nginx (see DEPLOY.md/deploy/nginx.conf.example) — trust
// its X-Forwarded-For so req.ip (rate limiting, session location tracking)
// reflects the real client instead of nginx's own address for every request.
app.set("trust proxy", 1);

// A handful of standard security headers — not pulling in `helmet` for just
// these three, since that's the entire useful subset for a same-origin app
// with no iframe embedding use case. Skips both CSP (this app loads
// CodeMirror from esm.sh at runtime — see public/js/lib/codeEditor.js — so a
// strict CSP needs real per-deployment tuning, not a one-size-fits-all
// default that'd likely break that import) and HSTS (nginx.conf.example
// deploys HTTP-only until a cert is in place; forcing HTTPS here could lock
// out a deployment mid-setup — set it in nginx's own :443 block instead once
// a cert exists).
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff"); // stop the browser from re-guessing a response's type past what Content-Type says
  res.setHeader("X-Frame-Options", "DENY"); // this app is never meant to be embedded in someone else's page (clickjacking)
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin"); // URLs here can carry tokens (QR/code login) — don't leak the full path to a third-party Referer
  next();
});

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
// These hand out sessions (or the codes that lead to one) just as much as
// login-email does, and were covered only by the general apiLimiter's much
// looser ceiling: /code/start can be triggered against any phone number, and
// /code/verify and /2fa/login are guess-a-6-digit-code endpoints.
app.use("/api/auth/code/start", authLimiter);
app.use("/api/auth/code/verify", authLimiter);
app.use("/api/auth/2fa/login", authLimiter);

app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/chats", require("./routes/chats"));
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
app.use("/api/stories", require("./routes/stories"));
app.use("/api/premium", require("./routes/premium"));
app.use("/api/gifts", require("./routes/gifts"));
app.use("/api/ads", require("./routes/ads"));
app.use("/api/donation-alerts", require("./routes/donationAlerts"));
app.use("/api/translate", require("./routes/translate"));
app.use("/api/uploads", require("./routes/uploads"));
app.use("/api/downloads", require("./routes/downloads"));
app.use("/api/hugo", require("./routes/hugo"));

if (useBuilt) {
  // Serves whichever of app.js/app.js.br/app.js.gz the client's
  // Accept-Encoding supports, straight off disk — the build already did the
  // compression, so this costs no CPU per request (unlike the `compression`
  // middleware above, which is why /dist/ is excluded from it).
  app.use("/dist", expressStaticGzip(DIST_DIR, { enableBrotli: true, orderPreference: ["br", "gz"], serveStatic: { maxAge: "1y", immutable: true } }));
}
// express.static below defaults dotfiles to "ignore" (404s anything under a
// dot-prefixed path) — fine for hiding stray .env-shaped files, but
// /.well-known/ is a real, meant-to-be-public convention (Digital Asset
// Links for the Android TWA app below, ACME/domain-verification files if
// those ever get added later), so it needs its own explicit route before
// the catch-all static handler rather than just flipping dotfiles to
// "allow" for all of public/.
app.use("/.well-known", express.static(path.join(PUBLIC_DIR, ".well-known"), { maxAge: "1h" }));

// Static assets not covered by the build (favicon, anything added to public/
// directly). No build step for these, so keep cache short-ish rather than
// immutable — long enough to skip re-fetching on every navigation, short
// enough that a deploy doesn't need a hard refresh.
app.use(express.static(PUBLIC_DIR, { maxAge: "1h" }));

// Uploaded attachments (data/uploads — see routes/uploads.js). Its own handler
// rather than express.static because a large video needs real Range support and
// these files are untrusted content served from this app's own origin, so the
// Content-Type/Content-Disposition/nosniff decisions matter (see
// lib/serveUpload.js). Must sit above the SPA catch-all below, which would
// otherwise answer /uploads/... with index.html.
const { UPLOAD_DIR } = require("./routes/uploads");
const { serveUpload } = require("./lib/serveUpload");
app.get("/uploads/:filename", serveUpload(UPLOAD_DIR));
app.head("/uploads/:filename", serveUpload(UPLOAD_DIR));

// The download page is a standalone static page, not an SPA route — without
// this, /download fell through to the catch-all below and served the app shell
// instead (only /download.html worked, which is not a URL anyone types or a
// link worth sharing).
app.get("/download", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "download.html")));

// Client-side router owns every non-API path — always serve the shell.
app.get(/^\/(?!api|ws).*/, (req, res) => {
  res.sendFile(indexHtml);
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
attachWebSocketServer(server);
startAutoDeleteSweep();
startDonationAlertsSweep();
startScheduledMessagesSweep();

// VAPID key setup must finish before anything can subscribe/send push, but
// must never block the server from coming up at all if it fails for some
// reason (the keypair lives in app.db's vapid_keys table) — push is additive, not core.
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
