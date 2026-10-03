const db = require("../db");

function balanceOf(userId) {
  const row = db.prepare("SELECT stars FROM users WHERE id = ?").get(userId);
  return row?.stars ?? 0;
}

const addStars = db.transaction((userId, amount) => {
  if (!Number.isSafeInteger(amount)) throw new Error("bad stars amount");
  db.prepare("UPDATE users SET stars = stars + ? WHERE id = ?").run(amount, userId);
  return balanceOf(userId);
});

// Страховка от ошибок в маршрутах: отрицательная или дробная сумма
// превратила бы списание в начисление.
const isAmount = (n) => Number.isSafeInteger(n) && n > 0;

const spendStars = db.transaction((userId, amount) => {
  if (!isAmount(amount)) return false;
  const row = db.prepare("SELECT stars FROM users WHERE id = ?").get(userId);
  if (!row || row.stars < amount) return false;
  db.prepare("UPDATE users SET stars = stars - ? WHERE id = ?").run(amount, userId);
  return true;
});

const transferStars = db.transaction((fromId, toId, amount) => {
  if (!isAmount(amount) || fromId === toId) return false;
  const row = db.prepare("SELECT stars FROM users WHERE id = ?").get(fromId);
  if (!row || row.stars < amount) return false;
  db.prepare("UPDATE users SET stars = stars - ? WHERE id = ?").run(amount, fromId);
  db.prepare("UPDATE users SET stars = stars + ? WHERE id = ?").run(amount, toId);
  return true;
});

function setMessagePrice(userId, stars) {
  db.prepare("UPDATE users SET messagePriceStars = ? WHERE id = ?").run(stars, userId);
}

module.exports = { balanceOf, addStars, spendStars, transferStars, setMessagePrice };
