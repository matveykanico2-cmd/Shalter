const path = require("path");
const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const { errorHandler } = require("./middleware/errors");
const { attachWebSocketServer } = require("./ws");

const app = express();

// Gzip cuts network time for message/chat JSON (meaningfully so once
// attachments' base64 data is in the payload) at a modest CPU cost — worth it
// on a small box. If nginx sits in front and already gzips, set
// DISABLE_APP_GZIP=1 to skip compressing twice.
if (!process.env.DISABLE_APP_GZIP) {
  app.use(compression({ level: 6 }));
}

app.use(cookieParser());
// Message attachments (voice notes, video-notes, images) are inline base64
// data URLs — a short voice/video clip can be a few MB, so raise the limit
// well above Composer's MAX_RECORD_SEC=20 worst case.
app.use(express.json({ limit: "25mb" }));

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

// Static JS/CSS is cache-busted by nothing (no build step), so keep the
// cache short-ish rather than immutable — long enough to skip re-fetching on
// every navigation, short enough that a deploy doesn't need a hard refresh.
app.use(express.static(path.join(__dirname, "..", "public"), { maxAge: "1h" }));

// Client-side router owns every non-API path — always serve the shell.
app.get(/^\/(?!api|ws).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
attachWebSocketServer(server);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`messenger server listening on http://localhost:${PORT}`);
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
