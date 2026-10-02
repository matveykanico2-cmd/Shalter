const crypto = require("crypto");

const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW_STEPS = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of String(str ?? "").toUpperCase().replace(/=+$/, "")) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function codeForCounter(secret, counter) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

function sameCode(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyCode(secret, code, now = Date.now()) {
  const cleaned = String(code ?? "").replace(/\D/g, "");
  if (cleaned.length !== DIGITS || !secret) return false;
  const counter = Math.floor(now / 1000 / STEP_SECONDS);
  for (let drift = -WINDOW_STEPS; drift <= WINDOW_STEPS; drift++) {
    if (sameCode(codeForCounter(secret, counter + drift), cleaned)) return true;
  }
  return false;
}

function otpauthUri(secret, accountLabel) {
  const label = encodeURIComponent(`Shalter:${accountLabel}`);
  const params = new URLSearchParams({ secret, issuer: "Shalter", algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

const RECOVERY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function generateRecoveryCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    let code = "";
    for (let j = 0; j < 10; j++) code += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
    codes.push(`${code.slice(0, 5)}-${code.slice(5)}`);
  }
  return codes;
}

function hashRecoveryCode(code) {
  return crypto
    .createHash("sha256")
    .update(String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .digest("hex");
}

module.exports = {
  generateSecret,
  verifyCode,
  otpauthUri,
  generateRecoveryCodes,
  hashRecoveryCode,
  codeForCounter,
  STEP_SECONDS,
};
