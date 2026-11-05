// Ссылки прокси Shalter (apps/proxy): https://<прокси>/?proxy=<секрет> — открывается в браузере
// как есть; shalter://settings/proxy?url=<ссылка> — открывает этот раздел в приложении.
// Также поддерживается формат ip:port:user:pass для обычного HTTP/SOCKS5-прокси.

export type ProxyLink = {
  /** Ссылка, которой делятся: адрес прокси и секрет. */
  link: string;
  origin: string;
  host: string;
  secret: string | null;
  /** Прямой прокси (IP:порт:логин:пароль) вместо ссылки. */
  direct?: { type: "http" | "socks5"; host: string; port: number; username: string; password: string };
};

const SECRET = /^[A-Za-z0-9_-]{8,128}$/;
// ip:port или ip:port:user:pass — прямой прокси без схемы ссылки.
const DIRECT_PROXY = /^([0-9a-fA-F:.]+|\[[0-9a-fA-F:.]+\]|[^\s/:?#]+):(\d{1,5})(?::([^:]*))?(?::([^:]*))?$/;

/** Разобрать вставленное: ссылка прокси, ip:порт[:логин[:пароль]] или ссылка на этот раздел; не ссылка — null. */
export function parseProxyLink(raw: string, depth = 0): ProxyLink | null {
  const text = raw.trim();
  if (!text || depth > 2) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  // Ссылка на раздел (shalter://settings/proxy?url=… или https://…/settings/proxy?url=…).
  const nested = url.searchParams.get("url");
  if (nested && (url.protocol === "shalter:" || /\/settings\/proxy\/?$/.test(url.pathname))) return parseProxyLink(nested, depth + 1);
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname || url.username || url.password) return null;
  const secret = url.searchParams.get("proxy");
  if (secret !== null && !SECRET.test(secret)) return null;
  return { link: `${url.origin}/${secret ? `?proxy=${secret}` : ""}`, origin: url.origin, host: url.host, secret };
}

/** Разобрать прямой прокси ip:порт[:логин[:пароль]]. */
export function parseDirectProxy(raw: string): ProxyLink | null {
  const text = raw.trim();
  if (!text) return null;
  const m = DIRECT_PROXY.exec(text);
  if (!m) return null;
  const host = m[1]!;
  const port = Number(m[2]!);
  if (port < 1 || port > 65535) return null;
  const username = m[3] ?? "";
  const password = m[4] ?? "";
  const type = /^socks5/i.test(text) ? "socks5" : "http";
  const link = `${type}://${username ? encodeURIComponent(username) + (password ? `:${encodeURIComponent(password)}` : "") + "@" : ""}${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${port}`;
  return {
    link,
    origin: host,
    host,
    secret: null,
    direct: { type: type as "http" | "socks5", host, port, username, password },
  };
}

/** Ссылка для приложения: открывает «Настройки → Прокси» с этой ссылкой. */
export const proxyDeepLink = (link: string) => `shalter://settings/proxy?url=${encodeURIComponent(link)}`;
