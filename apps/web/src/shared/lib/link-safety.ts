// Проверки ссылок перед открытием — как public/js/components/inAppBrowser.js.
const SHORTENER_HOSTS = new Set(["bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "buff.ly"]);

export type LinkSafety = { unsafe: boolean; warning: string | null };

/** checkLinkSafety: подозрительная ссылка — с предупреждением. */
export function linkSafety(href: string): LinkSafety {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return { unsafe: true, warning: "Некорректная ссылка" };
  }
  if (u.username || u.password) return { unsafe: true, warning: "Ссылка содержит логин перед адресом сайта — частый приём фишинга" };
  if (u.protocol !== "https:") return { unsafe: true, warning: "Небезопасное соединение (не https)" };
  if (SHORTENER_HOSTS.has(u.hostname.replace(/^www\./, ""))) return { unsafe: false, warning: "Сокращённая ссылка — настоящий адрес скрыт" };
  return { unsafe: false, warning: null };
}

/** Ролик YouTube или Vimeo — их плеер, он открывается во фрейме. */
export function embedUrlFor(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (/^\d+$/.test(id ?? "")) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    // Некорректная ссылка — как есть.
  }
  return url;
}

export const isEmbedPlayer = (url: string) => /^https:\/\/(www\.youtube\.com\/embed\/|player\.vimeo\.com\/video\/)/.test(url);

// Крупные сайты, которые точно запрещают показ внутри других сайтов
// (X-Frame-Options / frame-ancestors). Их сразу открываем в новой вкладке —
// синхронно, пока ещё идёт клик, иначе браузер заблокирует всплывающее окно.
const NEVER_FRAMEABLE = [
  "github.com", "gitlab.com", "google.com", "google.ru", "youtube.com", "x.com", "twitter.com",
  "facebook.com", "instagram.com", "linkedin.com", "reddit.com", "stackoverflow.com",
  "vk.com", "vk.ru", "ok.ru", "mail.ru", "yandex.ru", "ya.ru", "dzen.ru", "ozon.ru",
  "wildberries.ru", "avito.ru", "habr.com", "amazon.com", "apple.com", "microsoft.com",
  "openai.com", "chatgpt.com", "claude.ai", "anthropic.com", "discord.com", "twitch.tv",
  "tiktok.com", "pinterest.com", "spotify.com", "netflix.com", "paypal.com", "notion.so",
  "figma.com", "medium.com", "npmjs.com", "telegram.org", "web.telegram.org", "steamcommunity.com",
  "store.steampowered.com", "gosuslugi.ru", "sberbank.ru", "tinkoff.ru", "tbank.ru",
];

export function isNeverFrameable(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return NEVER_FRAMEABLE.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export const hostOf = (url: string) => (URL.canParse(url) ? new URL(url).hostname : url);
