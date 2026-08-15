const crypto = require("crypto");

// A pending "change my e-mail to this address" request, waiting on the code
// that was sent to the *new* address.
//
// Код уходит на НОВЫЙ адрес, а не на прежний, и это важнее, чем кажется: адрес
// теперь половина того, чем аккаунт восстанавливают (routes/auth.js,
// /recover/pair/*). Непроверенный адрес хуже, чем никакого — опечатка оставляет
// аккаунт с дверью, которая не откроется, и выясняется это ровно в тот день,
// когда она понадобится.
//
// Хранится в памяти процесса: одна ожидающая смена на аккаунт, повторный запрос
// заменяет прежнюю, перезапуск стирает всё. Терять их при перезапуске правильно
// — код, которым не воспользовались за пятнадцать минут, и не должен жить.
const TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const pending = new Map();

function start(userId, email) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  pending.set(userId, { code, email, expiresAt: Date.now() + TTL_MS, attempts: 0 });
  return code;
}

// Returns the address to switch to, or null. The address comes from here rather
// than from the request that confirms the code, so a caller cannot confirm a
// code sent to one address and have a different one saved.
function confirm(userId, code) {
  const entry = pending.get(userId);
  if (!entry || entry.expiresAt < Date.now()) {
    pending.delete(userId);
    return null;
  }
  if (entry.code !== String(code ?? "").trim()) {
    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) pending.delete(userId);
    return null;
  }
  pending.delete(userId);
  return entry.email;
}

function pendingEmail(userId) {
  const entry = pending.get(userId);
  return entry && entry.expiresAt > Date.now() ? entry.email : null;
}

module.exports = { start, confirm, pendingEmail, TTL_MS, MAX_ATTEMPTS };
