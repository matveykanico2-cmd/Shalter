const crypto = require("crypto");
const db = require("../db");

function rowToAuction(row) {
  if (!row) return undefined;
  const bids = JSON.parse(row.bids ?? "[]");
  const top = bids[bids.length - 1] ?? null;
  return {
    id: row.id,
    username: row.username,
    startPriceStars: row.startPriceStars,
    bids,
    topBid: top?.stars ?? null,
    topBidderId: top?.userId ?? null,
    currentPriceStars: top?.stars ?? row.startPriceStars,
    endsAt: row.endsAt,
    status: row.status,
    winnerId: row.winnerId ?? undefined,
    soldForStars: row.soldForStars ?? undefined,
    createdAt: row.createdAt,
    settledAt: row.settledAt ?? undefined,
    expired: row.status === "open" && row.endsAt <= new Date().toISOString(),
  };
}

function listAuctions() {
  return db.prepare("SELECT * FROM username_auctions ORDER BY createdAt DESC").all().map(rowToAuction);
}

function getAuction(id) {
  return rowToAuction(db.prepare("SELECT * FROM username_auctions WHERE id = ?").get(id));
}

function findOpenByUsername(username) {
  return rowToAuction(
    db
      .prepare("SELECT * FROM username_auctions WHERE lower(username) = ? AND status = 'open'")
      .get(String(username ?? "").toLowerCase())
  );
}

function createAuction({ username, startPriceStars, endsAt }) {
  const id = `ua_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
  db.prepare(
    `INSERT INTO username_auctions (id, username, startPriceStars, bids, endsAt, status, createdAt)
     VALUES (?, ?, ?, '[]', ?, 'open', ?)`
  ).run(id, username, startPriceStars, endsAt, new Date().toISOString());
  return getAuction(id);
}

function addBid(id, userId, stars) {
  const auction = getAuction(id);
  if (!auction) return undefined;
  const bids = [...auction.bids, { userId, stars, at: new Date().toISOString() }];
  db.prepare("UPDATE username_auctions SET bids = ? WHERE id = ?").run(JSON.stringify(bids), id);
  return getAuction(id);
}

function settleAuction(id, { winnerId, soldForStars, status }) {
  db.prepare("UPDATE username_auctions SET status = ?, winnerId = ?, soldForStars = ?, settledAt = ? WHERE id = ?").run(
    status,
    winnerId ?? null,
    soldForStars ?? null,
    new Date().toISOString(),
    id
  );
  return getAuction(id);
}

function deleteAuction(id) {
  db.prepare("DELETE FROM username_auctions WHERE id = ?").run(id);
}

module.exports = { listAuctions, getAuction, findOpenByUsername, createAuction, addBid, settleAuction, deleteAuction };
