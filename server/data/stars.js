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
const STAR_PACKS = [
  { id: "stars_10", stars: 10, priceRub: 1 },
  { id: "stars_60", stars: 60, priceRub: 5 },
  { id: "stars_130", stars: 130, priceRub: 10 },
  { id: "stars_350", stars: 350, priceRub: 25 },
  { id: "stars_750", stars: 750, priceRub: 50 },
  { id: "stars_1600", stars: 1600, priceRub: 100 },
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
