// Backing store for /short (server/lib/helperBot/utility.js) and the public
// redirect route (server/routes/shortLinks.js).
const db = require("../db");

const CODE_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 6) {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

function createShortLink(targetUrl, creatorId) {
  // Collisions are astronomically unlikely at this alphabet/length, but a
  // fixed number of retries keeps this from ever looping forever.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const exists = db.prepare("SELECT 1 FROM short_links WHERE code = ?").get(code);
    if (exists) continue;
    db.prepare("INSERT INTO short_links (code, targetUrl, creatorId, createdAt, clicks) VALUES (?, ?, ?, ?, 0)").run(
      code,
      targetUrl,
      creatorId,
      new Date().toISOString()
    );
    return code;
  }
  throw new Error("could not allocate a short code");
}

function getShortLink(code) {
  return db.prepare("SELECT * FROM short_links WHERE code = ?").get(code);
}

function registerClick(code) {
  db.prepare("UPDATE short_links SET clicks = clicks + 1 WHERE code = ?").run(code);
}

module.exports = { createShortLink, getShortLink, registerClick };
