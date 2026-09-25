const db = require("../db");
const { genId } = require("../lib/genId");

// Только живые сеансы.
//
// Раньше отдавались все строки подряд, вместе с завершёнными: человек нажимал
// «Завершить», устройство честно теряло доступ — но оставалось в списке ровно
// на прежнем месте. Со стороны это выглядит как «кнопка не работает», и именно
// так об этом и сообщили. Завершённой сессии в списке сеансов делать нечего.
async function listSessions(userId) {
  return db.prepare("SELECT * FROM sessions WHERE userId = ? AND revokedAt IS NULL ORDER BY lastActive DESC").all(userId);
}

async function getSession(userId, deviceId) {
  return db.prepare("SELECT * FROM sessions WHERE userId = ? AND deviceId = ?").get(userId, deviceId);
}

// One row per (userId, deviceId) — logging in again from the same browser
// refreshes the existing row (device label + lastActive) instead of piling
// up duplicates every time. Also clears revokedAt: a fresh login is a
// legitimate new session even on a device that was terminated before, same
// as re-entering your password in Telegram after being kicked from a device.
async function upsertSession({ userId, deviceId, device, location }) {
  const lastActive = new Date().toISOString();
  const existing = db.prepare("SELECT id FROM sessions WHERE userId = ? AND deviceId = ?").get(userId, deviceId);
  const id = existing?.id ?? genId("sess");
  db.prepare(
    `INSERT INTO sessions (id, userId, deviceId, device, location, lastActive, revokedAt) VALUES (@id, @userId, @deviceId, @device, @location, @lastActive, NULL)
     ON CONFLICT(userId, deviceId) DO UPDATE SET device = @device, location = @location, lastActive = @lastActive, revokedAt = NULL`
  ).run({ id, userId, deviceId, device, location, lastActive });
  return { session: db.prepare("SELECT * FROM sessions WHERE userId = ? AND deviceId = ?").get(userId, deviceId), isNewDevice: !existing };
}

// Освежает существующую запись устройства по ходу работы: время последней
// активности и, если сменился, IP. Новую строку НЕ создаёт (это делает вход,
// recordSession) — иначе оповещение «вход с нового устройства» можно было бы
// обойти. Поэтому UPDATE, а не upsert: нет строки — значит устройство ещё не
// входило под этим аккаунтом, и трогать нечего.
//
// location пишется через COALESCE(NULLIF(...)) — пустой IP (за кривым прокси)
// не должен затирать ранее известный.
function touchSession(userId, deviceId, location) {
  db.prepare(
    `UPDATE sessions SET lastActive = ?, location = COALESCE(NULLIF(?, ''), location)
       WHERE userId = ? AND deviceId = ? AND revokedAt IS NULL`
  ).run(new Date().toISOString(), location ?? "", userId, deviceId);
}

// "Terminate session" (Settings → Устройства → «Завершить»). Sets a flag
// rather than deleting the row — see server/middleware/auth.js's
// requireUserId for why a *missing* row must never be treated the same as an
// *explicitly revoked* one.
async function revokeSession(userId, deviceId) {
  db.prepare("UPDATE sessions SET revokedAt = ? WHERE userId = ? AND deviceId = ?").run(new Date().toISOString(), userId, deviceId);
}

// "Завершить все остальные сессии" — revokes every session for this account
// except the one making the request.
async function revokeOtherSessions(userId, exceptDeviceId) {
  db.prepare("UPDATE sessions SET revokedAt = ? WHERE userId = ? AND deviceId <> ?").run(new Date().toISOString(), userId, exceptDeviceId);
}

// Signs out every device, including the one asking. For a password reset or a
// recovery: whoever knew the old password is out with it.
//
// Not the same as removeAllSessionsForUser below, and the difference is the
// whole point. Deleting the rows does *not* sign anyone out: middleware/auth.js
// deliberately treats a missing row as "no information" and lets the request
// through, so only an explicit revokedAt closes a session. Recovery used the
// deleting one and promised in writing that other sessions were terminated —
// they were not, and a thief holding the account kept their session right
// through the owner recovering it.
async function revokeAllSessions(userId) {
  db.prepare("UPDATE sessions SET revokedAt = ? WHERE userId = ?").run(new Date().toISOString(), userId);
}

// Account deletion (server/lib/deleteAccount.js) only — unlike revokeSession/
// revokeOtherSessions above (kicking a *specific other* device while the
// account keeps existing), this is cleanup after the account itself is gone.
async function removeAllSessionsForUser(userId) {
  db.prepare("DELETE FROM sessions WHERE userId = ?").run(userId);
}

module.exports = { listSessions, getSession, upsertSession, touchSession, revokeSession, revokeOtherSessions, revokeAllSessions, removeAllSessionsForUser };
