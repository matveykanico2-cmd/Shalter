const { randomBytes } = require("crypto");

const SESSIONS_COOKIE = "session_uids";
const ACTIVE_COOKIE = "active_uid";
const DEVICE_COOKIE = "device_id";
// maxAge matches DEVICE_COOKIE_OPTS below (400 days, the Chrome-imposed cap
// on Set-Cookie expiry) — without it these were session cookies that died
// whenever the browser fully closed, which on a standalone/installed PWA
// (see manifest.webmanifest) can happen between every single launch, making
// "log in once per device" not actually hold.
const COOKIE_OPTS = { httpOnly: true, sameSite: "lax", path: "/", maxAge: 400 * 24 * 60 * 60 * 1000 };
// Long-lived and independent of login state — it identifies *this browser*,
// not any particular account, so the Settings → Devices list (server/data/
// sessions.js) can tell "same device, logged in again" from "a new device"
// across logins/logouts/account switches.
const DEVICE_COOKIE_OPTS = { httpOnly: true, sameSite: "lax", path: "/", maxAge: 400 * 24 * 60 * 60 * 1000 };

// Identifies this browser for the Devices/Sessions list — issues a stable id
// on first request and reuses it after. Call on any request that should be
// attributable to a device (currently: login, register, switch account).
function getOrCreateDeviceId(req, res) {
  let id = req.cookies?.[DEVICE_COOKIE];
  if (!id) {
    id = randomBytes(12).toString("hex");
    res.cookie(DEVICE_COOKIE, id, DEVICE_COOKIE_OPTS);
  }
  return id;
}

function parseIds(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function getSessionUserIds(req) {
  return parseIds(req.cookies?.[SESSIONS_COOKIE]);
}

function getCurrentUserId(req) {
  const active = req.cookies?.[ACTIVE_COOKIE] ?? null;
  const ids = getSessionUserIds(req);
  if (active && ids.includes(active)) return active;
  return ids[0] ?? null;
}

// Raw "Cookie" header parsing for contexts without cookie-parser (the WS
// upgrade handshake in server/ws.js isn't a normal Express request).
function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function getCurrentUserIdFromCookieHeader(header) {
  const cookies = parseCookieHeader(header);
  const active = cookies[ACTIVE_COOKIE] ?? null;
  const ids = parseIds(cookies[SESSIONS_COOKIE]);
  if (active && ids.includes(active)) return active;
  return ids[0] ?? null;
}

function writeSessions(res, ids, active) {
  if (ids.length === 0) {
    res.clearCookie(SESSIONS_COOKIE, COOKIE_OPTS);
    res.clearCookie(ACTIVE_COOKIE, COOKIE_OPTS);
    return;
  }
  res.cookie(SESSIONS_COOKIE, JSON.stringify(ids), COOKIE_OPTS);
  if (active) res.cookie(ACTIVE_COOKIE, active, COOKIE_OPTS);
  else res.clearCookie(ACTIVE_COOKIE, COOKIE_OPTS);
}

// Adds (or switches to, if already present) an account on this browser
// without signing out any other accounts already open — the "add account"
// flow from the nav-rail switcher.
function addAccountSession(req, res, userId) {
  const ids = getSessionUserIds(req);
  const next = ids.includes(userId) ? ids : [...ids, userId];
  writeSessions(res, next, userId);
}

function switchActiveAccount(req, res, userId) {
  const ids = getSessionUserIds(req);
  if (!ids.includes(userId)) return;
  writeSessions(res, ids, userId);
}

// Removes one account from this browser's session list. If it was the
// active one, falls back to whichever account is left.
function removeAccountSession(req, res, userId) {
  const ids = getSessionUserIds(req);
  const next = ids.filter((id) => id !== userId);
  const active = req.cookies?.[ACTIVE_COOKIE];
  writeSessions(res, next, active === userId ? next[0] ?? null : active ?? null);
  return next;
}

function clearAllSessions(req, res) {
  writeSessions(res, [], null);
}

// Express middleware: attaches req.uid, or short-circuits with 401.
function requireUserId(req, res, next) {
  const uid = getCurrentUserId(req);
  if (!uid) return res.status(401).json({ error: "unauthorized" });
  req.uid = uid;
  next();
}

module.exports = {
  getSessionUserIds,
  getCurrentUserId,
  addAccountSession,
  switchActiveAccount,
  removeAccountSession,
  clearAllSessions,
  requireUserId,
  getCurrentUserIdFromCookieHeader,
  getOrCreateDeviceId,
};
