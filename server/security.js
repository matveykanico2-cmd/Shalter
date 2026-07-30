const { randomBytes, scryptSync, timingSafeEqual } = require("crypto");

const KEY_LEN = 64;

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const candidate = scryptSync(password, salt, KEY_LEN);
  const stored = Buffer.from(hash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

module.exports = { hashPassword, verifyPassword };
