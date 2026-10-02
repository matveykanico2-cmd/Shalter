const { randomBytes } = require("crypto");
const { asyncRoute } = require("./errors");
const { getSession, touchSession } = require("../data/sessions");
const { getUser, cancelAccountDeletion } = require("../data/users");

const SESSIONS_COOKIE = "session_uids";
const ACTIVE_COOKIE = "active_uid";
const DEVICE_COOKIE = "device_id";
const COOKIE_OPTS = { httpOnly: true, sameSite: "lax", path: "/", maxAge: 400 * 24 * 60 * 60 * 1000 };
const DEVICE_COOKIE_OPTS = { httpOnly: true, sameSite: "lax", path: "/", maxAge: 400 * 24 * 60 * 60 * 1000 };

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

function addAccountSession(req, res, userId) {
  const ids = getSessionUserIds(req);
  const alreadyLinked = ids.includes(userId);
  const next = alreadyLinked ? ids : [...ids, userId];
  writeSessions(res, next, userId);
  try { cancelAccountDeletion(userId); } catch {}
  return alreadyLinked;
}

function switchActiveAccount(req, res, userId) {
  const ids = getSessionUserIds(req);
  if (!ids.includes(userId)) return;
  writeSessions(res, ids, userId);
}

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

const requireUserId = asyncRoute(async (req, res, next) => {
  const uid = getCurrentUserId(req);
  if (!uid) return res.status(401).json({ error: "unauthorized" });
  const deviceId = req.cookies?.[DEVICE_COOKIE];
  if (deviceId) {
    const session = await getSession(uid, deviceId);
    if (session?.revokedAt) return res.status(401).json({ error: "session_revoked" });
    if (session && !session.revokedAt) {
      const ip = req.ip || "";
      const stale = Date.now() - Date.parse(session.lastActive || 0) > 60_000;
      const ipChanged = !!ip && !!session.location && session.location !== ip;
      if (stale || ipChanged) {
        try {
          touchSession(uid, deviceId, ip);
        } catch {
        }
      }
    }
  }
  const user = await getUser(uid);
  if (user?.isBanned) return res.status(403).json({ error: "banned", banReason: user.banReason ?? null });
  req.uid = uid;
  next();
});

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
