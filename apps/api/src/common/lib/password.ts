import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Пароли — scrypt с солью, как в server/security.js: хэши в базе общие для обоих бэкендов.
const KEY_LEN = 64;

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(password, salt, KEY_LEN);
  const stored = Buffer.from(hash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

// Пароль пользователя (или облачный) задан и совпадает.
export function passwordMatches(password: string, hash: string | null | undefined, salt: string | null | undefined): boolean {
  return !!hash && !!salt && verifyPassword(password, hash, salt);
}
