import { timingSafeEqual } from "node:crypto";
import type { User } from "../../users/model/domain.js";

// Проверки «Входа через Shalter» — как в server/routes/oauth.js.

/** Сравнение за постоянное время: иначе секрет можно подбирать по задержке ответа. */
export function sameSecret(expected: unknown, given: unknown): boolean {
  const a = Buffer.from(String(expected ?? ""));
  const b = Buffer.from(String(given ?? ""));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/**
 * redirect_uri — только http(s): клиент делает window.location.href = redirectUrl, и
 * javascript:/data:-адрес выполнился бы в origin Shalter. http — лишь для localhost
 * (разработка). Проверяется и при регистрации, и при каждом согласии/обмене — на случай
 * приложений, созданных до этой проверки.
 */
export function isAllowedRedirectUri(value: unknown): boolean {
  let parsed: URL;
  try {
    parsed = new URL(String(value ?? ""));
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") return true;
  return parsed.protocol === "http:" && parsed.hostname === "localhost";
}

/** Что о пользователе узнаёт стороннее приложение. */
export function oauthProfile(user: User) {
  return { id: user.id, name: user.name, username: user.username || null, avatarImage: user.avatarImage || null };
}
