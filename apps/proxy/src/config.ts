// Настройки прокси — только из переменных окружения (README.md, DEPLOY.md).

export type ProxyConfig = {
  /** Настоящий сервер Shalter, куда уходят запросы. */
  upstream: URL;
  /** Секрет из ссылки (?proxy=…): без него прокси для всех — обычный 404. null — открыт всем. */
  secret: string | null;
  /** Перед прокси стоит свой фронт (Caddy, nginx): адрес и схема клиента — из X-Forwarded-*. */
  trustForwarded: boolean;
  /**
   * Хосты, на чьи перенаправления (302 на файл в S3) прокси идёт сам и отдаёт клиенту уже
   * содержимое: из заблокированной сети хранилище может быть недоступно так же, как сайт.
   * «*.example.net» — любой поддомен.
   */
  relayHosts: string[];
  /** Публичный адрес прокси для ссылки «Поделиться»; null — из Host запроса. */
  publicUrl: URL | null;
};

export const DEFAULT_UPSTREAM = "https://shalter.ru";
export const DEFAULT_RELAY_HOSTS = ["storage.yandexcloud.net", "*.storage.yandexcloud.net"];

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ProxyConfig {
  const upstream = new URL(env.SHALTER_UPSTREAM || DEFAULT_UPSTREAM);
  if (upstream.protocol !== "https:" && upstream.protocol !== "http:") throw new Error(`SHALTER_UPSTREAM: нужен http(s)-адрес, а не ${upstream.href}`);
  const secret = (env.PROXY_SECRET ?? "").trim() || null;
  if (secret && !/^[A-Za-z0-9_-]{8,128}$/.test(secret)) throw new Error("PROXY_SECRET: 8–128 символов из A–Z, a–z, 0–9, «-» и «_»");
  const relay = env.PROXY_RELAY_HOSTS === undefined ? DEFAULT_RELAY_HOSTS : list(env.PROXY_RELAY_HOSTS);
  return {
    upstream: new URL(upstream.origin),
    secret,
    trustForwarded: env.PROXY_TRUST_FORWARDED === "1",
    relayHosts: relay,
    publicUrl: env.PROXY_PUBLIC_URL ? new URL(new URL(env.PROXY_PUBLIC_URL).origin) : null,
  };
}

/** Подходит ли хост под список («*.x» — поддомены x). */
export function hostAllowed(host: string, patterns: readonly string[]): boolean {
  const h = host.toLowerCase();
  return patterns.some((p) => (p.startsWith("*.") ? h.endsWith(p.slice(1)) && h.length > p.length - 1 : h === p));
}
