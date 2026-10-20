// Коды восстановления пароля по паре «почта + телефон»: код уходит письмом на
// адрес аккаунта. Без него хватало знать почту и номер, а это не секреты
// (номер при регистрации не подтверждается).
const crypto = require("crypto");

const TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const pending = new Map();

function start(userId) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  pending.set(userId, { code, expiresAt: Date.now() + TTL_MS, attempts: 0 });
  return code;
}

// true — код верный (и больше не действует); после MAX_ATTEMPTS ошибок код сгорает.
function confirm(userId, code) {
  const entry = pending.get(userId);
  if (!entry || entry.expiresAt < Date.now()) {
    pending.delete(userId);
    return false;
  }
  const given = Buffer.from(String(code ?? "").replace(/\s/g, ""));
  const expected = Buffer.from(entry.code);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) pending.delete(userId);
    return false;
  }
  pending.delete(userId);
  return true;
}

module.exports = { start, confirm, TTL_MS, MAX_ATTEMPTS };
