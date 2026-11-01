// Ссылки прокси Shalter (apps/proxy): https://<прокси>/?proxy=<секрет> — открывается в браузере
// как есть; shalter://settings/proxy?url=<ссылка> — открывает этот раздел в приложении.

export type ProxyLink = {
  /** Ссылка, которой делятся: адрес прокси и секрет. */
  link: string;
  origin: string;
  host: string;
  secret: string | null;
};

const SECRET = /^[A-Za-z0-9_-]{8,128}$/;

/** Разобрать вставленное: ссылка прокси, адрес без схемы или ссылка на этот раздел; не ссылка — null. */
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

/** Ссылка для приложения: открывает «Настройки → Прокси» с этой ссылкой. */
export const proxyDeepLink = (link: string) => `shalter://settings/proxy?url=${encodeURIComponent(link)}`;
