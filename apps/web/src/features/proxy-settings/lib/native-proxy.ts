// Прокси самого приложения (не ссылка на прокси Shalter, а свой HTTP/SOCKS5 с IP, портом,
// логином и паролем): весь трафик окна идёт через него. Применяет нативная оболочка —
// Tauri (window.shalterDesktop.setProxy, src-tauri/src/main.rs) или Android-плагин
// Capacitor «AppProxy», если он есть в сборке. В браузере такой настройки нет.
export type NativeProxyType = "http" | "socks5";
export type NativeProxy = { type: NativeProxyType; host: string; port: number; username: string; password: string };

type Bridge = {
  setProxy: (url: string | null) => Promise<unknown>;
  getProxy: () => Promise<string | null | undefined>;
  restart?: () => Promise<unknown>;
};

type NativeWindow = Window & {
  shalterDesktop?: { setProxy?: Bridge["setProxy"]; getProxy?: Bridge["getProxy"]; restart?: Bridge["restart"] };
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: { AppProxy?: { set: (o: { url: string | null }) => Promise<unknown>; get: () => Promise<{ url?: string | null }> } };
  };
};

/** Мост оболочки, если она умеет прокси; null — браузер или старая версия приложения. */
export function nativeProxyBridge(): Bridge | null {
  const w = window as NativeWindow;
  const desktop = w.shalterDesktop;
  if (desktop?.setProxy && desktop.getProxy) return { setProxy: desktop.setProxy, getProxy: desktop.getProxy, restart: desktop.restart };
  const plugin = w.Capacitor?.isNativePlatform?.() ? w.Capacitor.Plugins?.AppProxy : undefined;
  if (plugin) return { setProxy: (url) => plugin.set({ url }), getProxy: async () => (await plugin.get())?.url ?? null };
  return null;
}

/** Хост — IP или имя без схемы, пути и пробелов; порт 1–65535. */
export function validateNativeProxy(p: NativeProxy): string | null {
  const host = p.host.trim();
  if (!host || /[\s/@?#]/.test(host)) return "Укажите IP-адрес или имя сервера прокси";
  if (!Number.isInteger(p.port) || p.port < 1 || p.port > 65535) return "Порт — число от 1 до 65535";
  if (p.password && !p.username) return "Пароль без логина не передать — укажите логин";
  return null;
}

export function nativeProxyUrl(p: NativeProxy): string {
  const host = p.host.trim();
  // IPv6 — в квадратных скобках.
  const hostPart = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  const user = p.username ? `${encodeURIComponent(p.username)}${p.password ? `:${encodeURIComponent(p.password)}` : ""}@` : "";
  return `${p.type}://${user}${hostPart}:${p.port}`;
}

export function parseNativeProxyUrl(raw: string | null | undefined): NativeProxy | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const type = u.protocol.replace(/:$/, "");
    if (type !== "http" && type !== "socks5") return null;
    const port = Number(u.port);
    if (!u.hostname || !port) return null;
    return {
      type,
      host: u.hostname.replace(/^\[|\]$/g, ""),
      port,
      username: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
    };
  } catch {
    return null;
  }
}
