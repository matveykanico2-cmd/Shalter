const db = require("../db");

// Stars — the in-app currency. Bought with a real transfer or, when
// DonationAlerts/DonatePay is connected, an automatic donation (server/
// routes/stars.js's /request, server/lib/fulfillOrder.js). Spent on paid
// DMs, boosting a message, and clearing one out of a conversation.
//
// Lives here rather than only in routes/stars.js because fulfillOrder.js
// needs it too — a fulfilled "stars" pending_orders row only stores
// amountRub (see server/db.js), so the pack (and its star count) is looked
// up by price rather than carrying a redundant packId column. Every price
// here is unique for exactly that reason — don't add two packs at the same
// priceRub, or this lookup becomes ambiguous.
// ~2₽/звезду — курс, по которому Telegram сам продаёт Stars за рубли
// (у них почти нет скидки за объём: и мелкий, и крупный пакет держатся в
// районе 2-2.14₽/звезду), поэтому здесь тоже плоский курс, а не нарастающая
// скидка, как было раньше.
const STAR_PACKS = [
  // Дешёвый входной пакет — вне курса 2₽/звезда специально, чтобы был
  // вариант за 1₽ (минимальная сумма для теста/маленького доната).
  { id: "stars_1", stars: 1, priceRub: 1 },
  { id: "stars_50", stars: 50, priceRub: 100 },
  { id: "stars_100", stars: 100, priceRub: 200 },
  { id: "stars_250", stars: 250, priceRub: 500 },
  { id: "stars_500", stars: 500, priceRub: 1000 },
  { id: "stars_1000", stars: 1000, priceRub: 2000 },
  { id: "stars_2500", stars: 2500, priceRub: 5000 },
];
//
// Every mutation goes through a transaction that re-reads the balance inside it.
// Spending is the reason: two requests arriving together would otherwise both
// read "10 stars", both decide 8 is affordable, and both deduct — leaving -6 and
// two paid actions for the price of one.

function balanceOf(userId) {
  const row = db.prepare("SELECT stars FROM users WHERE id = ?").get(userId);
  return row?.stars ?? 0;
}

const addStars = db.transaction((userId, amount) => {
  db.prepare("UPDATE users SET stars = stars + ? WHERE id = ?").run(amount, userId);
  return balanceOf(userId);
});

// Returns false and changes nothing when the balance is short — a returned
// value rather than a throw, because every caller has its own thing to tell the
// user about it.
const spendStars = db.transaction((userId, amount) => {
  const row = db.prepare("SELECT stars FROM users WHERE id = ?").get(userId);
  if (!row || row.stars < amount) return false;
  db.prepare("UPDATE users SET stars = stars - ? WHERE id = ?").run(amount, userId);
  return true;
});

// The paid-DM transfer: the sender pays, the recipient is credited, and both
// happen in one transaction so stars can't be destroyed or duplicated by a crash
// between the two writes.
const transferStars = db.transaction((fromId, toId, amount) => {
  const row = db.prepare("SELECT stars FROM users WHERE id = ?").get(fromId);
  if (!row || row.stars < amount) return false;
  db.prepare("UPDATE users SET stars = stars - ? WHERE id = ?").run(amount, fromId);
  db.prepare("UPDATE users SET stars = stars + ? WHERE id = ?").run(amount, toId);
  return true;
});

function setMessagePrice(userId, stars) {
  db.prepare("UPDATE users SET messagePriceStars = ? WHERE id = ?").run(stars, userId);
}

module.exports = { balanceOf, addStars, spendStars, transferStars, setMessagePrice, STAR_PACKS };
