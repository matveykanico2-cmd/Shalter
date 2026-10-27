import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

// Коды из приложения-аутентификатора (RFC 6238) и коды восстановления — как
// server/lib/totp.js: секреты и хэши кодов в базе общие для обоих бэкендов.

export const STEP_SECONDS = 30;
export const WINDOW_STEPS = 1;
const DIGITS = 6;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
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

function base32Decode(str: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of str.toUpperCase().replace(/=+$/, "")) {
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

export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

function codeForCounter(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) | ((hmac[offset + 1]! & 0xff) << 16) | ((hmac[offset + 2]! & 0xff) << 8) | (hmac[offset + 3]! & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

function sameCode(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Номер шага, которому соответствует код (в окне ±WINDOW_STEPS), или null.
// Нужен, чтобы не принять один и тот же код дважды (RFC 6238 §5.2).
export function matchStep(secret: string | undefined, code: string, now = Date.now()): number | null {
  const cleaned = code.replace(/\D/g, "");
  if (cleaned.length !== DIGITS || !secret) return null;
  const counter = Math.floor(now / 1000 / STEP_SECONDS);
  for (let drift = -WINDOW_STEPS; drift <= WINDOW_STEPS; drift++) {
    if (sameCode(codeForCounter(secret, counter + drift), cleaned)) return counter + drift;
  }
  return null;
}

export function otpauthUri(secret: string, accountLabel: string): string {
  const label = encodeURIComponent(`Shalter:${accountLabel}`);
  const params = new URLSearchParams({ secret, issuer: "Shalter", algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

const RECOVERY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let code = "";
    for (let j = 0; j < 10; j++) code += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
    codes.push(`${code.slice(0, 5)}-${code.slice(5)}`);
  }
  return codes;
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256")
    .update(code.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .digest("hex");
}
