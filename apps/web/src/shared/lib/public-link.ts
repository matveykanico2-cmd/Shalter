// Публичная ссылка — как public/js/lib/publicLink.js: из приложения и при локальной
// разработке origin — localhost или tauri://, у других такая не откроется.
const PUBLIC_ORIGIN = "https://shalter.ru";

export function publicOrigin() {
  const { protocol, hostname, origin } = window.location;
  if (protocol !== "https:" && protocol !== "http:") return PUBLIC_ORIGIN;
  if (/^(localhost|127\.|10\.|192\.168\.|tauri\.)/.test(hostname) || hostname.endsWith(".localhost")) return PUBLIC_ORIGIN;
  return origin;
}

export const publicUrl = (path: string) => `${publicOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
