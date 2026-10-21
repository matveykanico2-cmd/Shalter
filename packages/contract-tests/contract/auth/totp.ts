// TOTP по RFC 6238 (HMAC-SHA1, 6 цифр, шаг 30 с) — те же параметры, что у сервера.
// Нужен, чтобы тест мог «быть приложением-аутентификатором».
import { createHmac } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Decode(str: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of str.toUpperCase().replace(/=+$/, "")) {
    const idx = ALPHABET.indexOf(ch);
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

export function hotp(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** Код на момент now; offsetSteps — сдвиг на целые шаги (для проверки окна). */
export function totp(secret: string, now = Date.now(), offsetSteps = 0): string {
  return hotp(secret, Math.floor(now / 1000 / STEP_SECONDS) + offsetSteps);
}

/** Заведомо неверный код: не совпадает ни с одним из кодов окна ±1 шаг. */
export function wrongTotp(secret: string, now = Date.now()): string {
  const valid = new Set([-1, 0, 1].map((d) => totp(secret, now, d)));
  for (let i = 0; ; i++) {
    const candidate = String(i).padStart(6, "0");
    if (!valid.has(candidate)) return candidate;
  }
}
