import { publicOrigin } from "./public-link";

const RESERVED_PATHS = new Set([
  "u", "chat", "call", "call-join", "join", "folder", "nearby", "contacts",
  "discover-channels", "market", "calls", "archive", "settings", "login",
  "download", "promo", "bots", "oauth-docs",
]);

/** Внутренний адрес рекламы: чат, профиль или @бот на домене Shalter. */
export function internalAdRoute(href: string) {
  let url: URL;
  try {
    url = new URL(href, publicOrigin());
  } catch {
    return null;
  }
  if (url.origin !== publicOrigin()) return null;
  const suffix = `${url.search}${url.hash}`;
  const username = url.pathname.match(/^\/@?([A-Za-z0-9_]{3,32})\/?$/);
  if (username && !RESERVED_PATHS.has(username[1]!.toLowerCase())) return `/u/${username[1]}${suffix}`;
  return `${url.pathname}${suffix}`;
}
