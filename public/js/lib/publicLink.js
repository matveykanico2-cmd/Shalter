// Публичная ссылка для «Скопировать ссылку» / QR: shalter.ru/u/<ник>. В десктопном
// приложении и при локальной разработке origin — localhost или tauri://, такая
// ссылка у других не откроется, поэтому подставляем адрес сайта.
const PUBLIC_ORIGIN = "https://shalter.ru";

export function publicOrigin() {
  const { protocol, hostname, origin } = window.location;
  if (protocol !== "https:" && protocol !== "http:") return PUBLIC_ORIGIN;
  if (/^(localhost|127\.|10\.|192\.168\.|tauri\.)/.test(hostname) || hostname.endsWith(".localhost")) return PUBLIC_ORIGIN;
  return origin;
}

export function publicUrl(path) {
  return `${publicOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}

// Ссылка на пользователя, канал или группу по нику.
export function usernameUrl(username) {
  return publicUrl(`/u/${String(username).replace(/^@/, "")}`);
}
