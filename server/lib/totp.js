const crypto = require("crypto");

// RFC 6238 TOTP — the standard 6-digit rotating code any authenticator app
// (Google Authenticator, Aegis, 1Password, Bitwarden…) produces. Implemented
// here rather than pulled in as a dependency: it's HMAC-SHA1 over a counter,
// which Node's crypto already does, and this app deliberately keeps its
// dependency list short (see AGENTS.md).
//
// Why TOTP and not "a second password": the point of the second factor is that
// it isn't something an attacker can obtain by knowing things *about* you. A
// phone number is not a secret — it's on your profile, people have it in their
// contacts — so any flow that treats "proves they know the number" as
// authentication is only ever one factor. A TOTP secret lives on a device the
// account owner holds.

const STEP_SECONDS = 30;
const DIGITS = 6;
// How many 30s windows either side of "now" are accepted. One step covers the
// realistic case of a clock a little out of sync or a code typed as it rolls
// over, without widening the guessable window more than necessary.
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
    if (idx === -1) continue; // tolerate spaces/dashes people paste in
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// 160 bits, the length RFC 4226 recommends for an HMAC-SHA1 key.
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

// Constant-time comparison so a caller can't learn the code digit by digit from
// how long the check took.
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

// The otpauth:// URI an authenticator app expects. The client turns this into a
// QR code with the vendored generator it already uses for QR login
// (public/js/lib/qrcode.js) — no new dependency, and the secret never leaves
// this response.
function otpauthUri(secret, accountLabel) {
  const label = encodeURIComponent(`Shalter:${accountLabel}`);
  const params = new URLSearchParams({ secret, issuer: "Shalter", algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// Single-use codes for the "lost my phone" case, which is the failure mode that
// actually locks people out of 2FA. Stored hashed (see data/users.js) so the DB
// never holds a usable one, same reasoning as password hashing.
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
