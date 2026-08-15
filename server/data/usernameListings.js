const db = require("../db");

// Объявления о продаже юзернеймов — рынок перепродажи.
//
// Хранится только само объявление: кто продаёт, что и почём. Владение при этом
// остаётся у продавца до момента покупки (правда о владельце — в users.username,
// и второго места, где то же самое записано иначе, заводить нельзя: они разойдутся).
// Поэтому объявление проверяется на актуальность при каждом чтении: продавец мог
// сменить юзернейм после того, как выставил его.

function rowToListing(row) {
  return {
    id: row.id,
    username: row.username,
    sellerId: row.sellerId,
    priceStars: row.priceStars,
    status: row.status,
    buyerId: row.buyerId ?? null,
    soldAt: row.soldAt ?? null,
    createdAt: row.createdAt,
  };
}

function listOpen() {
  return db.prepare("SELECT * FROM username_listings WHERE status = 'open' ORDER BY priceStars ASC").all().map(rowToListing);
}

function listAll() {
  return db.prepare("SELECT * FROM username_listings ORDER BY createdAt DESC").all().map(rowToListing);
}

function getListing(id) {
  const row = db.prepare("SELECT * FROM username_listings WHERE id = ?").get(id);
  return row ? rowToListing(row) : null;
}

function findOpenByUsername(username) {
  const row = db
    .prepare("SELECT * FROM username_listings WHERE status = 'open' AND lower(username) = lower(?)")
    .get(String(username ?? ""));
  return row ? rowToListing(row) : null;
}

function createListing({ username, sellerId, priceStars }) {
  const listing = {
    id: `ul_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    username,
    sellerId,
    priceStars,
    status: "open",
    buyerId: null,
    soldAt: null,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO username_listings (id, username, sellerId, priceStars, status, buyerId, soldAt, createdAt)
     VALUES (@id, @username, @sellerId, @priceStars, @status, @buyerId, @soldAt, @createdAt)`
  ).run(listing);
  return listing;
}

function closeListing(id, { status, buyerId = null }) {
  db.prepare("UPDATE username_listings SET status = ?, buyerId = ?, soldAt = ? WHERE id = ?").run(
    status,
    buyerId,
    new Date().toISOString(),
    id
  );
  return getListing(id);
}

module.exports = { listOpen, listAll, getListing, findOpenByUsername, createListing, closeListing };
