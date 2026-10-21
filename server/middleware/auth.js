const { randomBytes } = require("crypto");
const { asyncRoute } = require("./errors");
const { getSession, touchSession, isSessionActive } = require("../data/sessions");
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

// Cookie со списком аккаунтов не подписан — подделать его может кто угодно.
// Поэтому аккаунт засчитывается, только если в базе есть живая сессия для пары
// (пользователь, device_id): device_id — случайный httpOnly-cookie, его не угадать.
function activeIdsFromCookies(cookies) {
  const deviceId = cookies?.[DEVICE_COOKIE];
  if (!deviceId) return [];
  return parseIds(cookies?.[SESSIONS_COOKIE]).filter((id) => isSessionActive(id, deviceId));
}

function pickActive(cookies, ids) {
  const active = cookies?.[ACTIVE_COOKIE] ?? null;
  if (active && ids.includes(active)) return active;
  return ids[0] ?? null;
}

// Сырой список из cookie, без проверки — только для записи cookie обратно.
function cookieUserIds(req) {
  return parseIds(req.cookies?.[SESSIONS_COOKIE]);
}

function getSessionUserIds(req) {
  return activeIdsFromCookies(req.cookies);
}

function getCurrentUserId(req) {
  return pickActive(req.cookies, getSessionUserIds(req));
}

// Битое %-кодирование оставляет значение как есть (так же делает cookie-parser у HTTP):
// исключение здесь, в обработчике upgrade у /ws, роняло весь процесс.
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = safeDecode(value);
  }
  return out;
}

function getCurrentUserIdFromCookieHeader(header) {
  const cookies = parseCookieHeader(header);
  return pickActive(cookies, activeIdsFromCookies(cookies));
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
  const ids = cookieUserIds(req);
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
  const ids = cookieUserIds(req);
  const next = ids.filter((id) => id !== userId);
  const active = req.cookies?.[ACTIVE_COOKIE];
  writeSessions(res, next, active === userId ? next[0] ?? null : active ?? null);
  return next;
}

function clearAllSessions(req, res) {
  writeSessions(res, [], null);
}

// Текст 401: аккаунт в cookie есть, но сессию завершили с другого устройства, —
// «session_revoked», иначе — «unauthorized».
function noSessionError(req) {
  return cookieUserIds(req).length > 0 ? "session_revoked" : "unauthorized";
}

const requireUserId = asyncRoute(async (req, res, next) => {
  const uid = getCurrentUserId(req);
  if (!uid) return res.status(401).json({ error: noSessionError(req) });
  const deviceId = req.cookies?.[DEVICE_COOKIE];
  const session = await getSession(uid, deviceId);
  const ip = req.ip || "";
  const stale = Date.now() - Date.parse(session?.lastActive || 0) > 60_000;
  const ipChanged = !!ip && !!session?.location && session.location !== ip;
  if (stale || ipChanged) {
    try {
      touchSession(uid, deviceId, ip);
    } catch {
    }
  }
  const user = await getUser(uid);
  // Заблокированный входит в аккаунт, но всё, кроме экрана блокировки, ему закрыто:
  // клиент по этому ответу показывает причину и сколько осталось.
  if (user?.isBanned) {
    return res.status(403).json({
      error: "banned",
      banReason: user.banReason ?? null,
      bannedAt: user.bannedAt ?? null,
      bannedUntil: user.bannedUntil ?? null,
    });
  }
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
  noSessionError,
  getCurrentUserIdFromCookieHeader,
  deviceIdFromCookieHeader: (header) => parseCookieHeader(header)[DEVICE_COOKIE] ?? null,
  getOrCreateDeviceId,
};
