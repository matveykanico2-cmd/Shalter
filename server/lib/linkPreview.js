const dns = require("dns").promises;
const net = require("net");

const URL_RE = /https?:\/\/[^\s<>"]+/;
const MAX_RESPONSE_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 6000;

const SHORTENER_HOSTS = new Set(["bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "buff.ly"]);

// Настоящий браузер вместо «Mozilla/5.0 (compatible; ShalterLinkPreview/1.0)»:
// YouTube, VK и часть новостных сайтов боту отдают страницу без og: тегов,
// и превью приходилось пустым.
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

function checkSafety(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { unsafe: true, warning: "Некорректная ссылка" };
  }
  if (u.username || u.password) {
    return { unsafe: true, warning: "Ссылка содержит логин перед адресом сайта — частый приём фишинга" };
  }
  if (u.protocol !== "https:") {
    return { unsafe: true, warning: "Небезопасное соединение (не https)" };
  }
  if (SHORTENER_HOSTS.has(u.hostname.replace(/^www\./, ""))) {
    return { unsafe: false, warning: "Сокращённая ссылка — настоящий адрес скрыт" };
  }
  return { unsafe: false, warning: null };
}

function extractFirstUrl(text) {
  const match = URL_RE.exec(text ?? "");
  return match ? match[0] : null;
}

function metaTag(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i");
  const match = re.exec(html) || new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, "i").exec(html);
  return match ? match[1] : null;
}

function decodeEntities(str) {
  return (str ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Сервер сам ходит по ссылке из сообщения — значит, без проверки любой мог бы
// заставить его открыть http://127.0.0.1:…, панель Dokploy во внутренней сети
// или метаданные облака и прочитать заголовок страницы в превью (SSRF).
function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("ff");
}

async function assertPublicUrl(raw) {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad protocol");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("bad port");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error("private address");
  return u;
}

// Редиректы проходим вручную, проверяя каждый адрес: иначе внешний сайт мог бы
// перенаправить на внутренний.
async function fetchPublic(url, init, maxRedirects = 4) {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...init, redirect: "manual" });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return res;
    res.body?.cancel?.().catch(() => {});
    current = new URL(location, current).toString();
  }
  throw new Error("too many redirects");
}

async function fetchLinkPreview(text) {
  const url = extractFirstUrl(text);
  if (!url) return null;

  const safety = checkSafety(url);
  // Что известно по одной ссылке: у видео — заставка по id ролика и плеер.
  const known = videoFields(url);
  const bare = { url, ...known, unsafe: safety.unsafe, warning: safety.warning };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchPublic(url, {
      signal: controller.signal,
      headers: { "User-Agent": BROWSER_UA, "accept-language": "ru-RU,ru;q=0.9,en;q=0.8" },
    });
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok || !contentType.includes("text/html")) {
      return known.video ? bare : { url, unsafe: safety.unsafe, warning: safety.warning };
    }

    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      let received = 0;
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        html += decoder.decode(value, { stream: true });
        if (received > MAX_RESPONSE_BYTES) {
          reader.cancel().catch(() => {});
          break;
        }
      }
    } else {
      html = await res.text();
    }

    const title = decodeEntities(metaTag(html, "og:title") || /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]);
    const description = decodeEntities(metaTag(html, "og:description") || metaTag(html, "description"));
    let image = metaTag(html, "og:image");
    if (image && !/^https?:\/\//.test(image)) {
      try {
        image = new URL(image, url).toString();
      } catch {
        image = null;
      }
    }
    if (image && !/^https?:\/\//.test(image)) image = null;
    const siteName = decodeEntities(metaTag(html, "og:site_name")) || new URL(url).hostname.replace(/^www\./, "");

    if (!title && !description && !image) return known.video ? bare : { url, unsafe: safety.unsafe, warning: safety.warning };

    return {
      url,
      title: title?.slice(0, 200) || null,
      description: description?.slice(0, 300) || null,
      // Заставку ролика с i.ytimg.com не перебиваем случайной картинкой с страницы.
      image: known.image || image || null,
      images: known.images ?? (image ? [image] : undefined),
      video: known.video,
      siteName: known.siteName || siteName,
      unsafe: safety.unsafe,
      warning: safety.warning,
    };
  } catch {
    return known.video ? bare : { url, unsafe: safety.unsafe, warning: safety.warning };
  } finally {
    clearTimeout(timeout);
  }
}

// Видеосервисы. Страницу ролика удаётся разобрать не всегда (YouTube боту отдаёт
// пустую), поэтому заставку и плеер собираем из id ролика — как в Telegram,
// где в превью ролика показывается его первый кадр.
function videoPreviewFor(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "").toLowerCase();
  const VIDEO_ID_RE = /^[A-Za-z0-9_-]{6,20}$/;

  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    if (VIDEO_ID_RE.test(id)) return youtubePreview(id);
    return null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = u.searchParams.get("v");
    if (v && VIDEO_ID_RE.test(v)) return youtubePreview(v);
    const m = /^\/(embed|shorts|live|v)\/([A-Za-z0-9_-]{6,20})/.exec(u.pathname);
    return m ? youtubePreview(m[2]) : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean).find((p) => /^\d+$/.test(p));
    if (id) return { siteName: "Vimeo", video: { id, embedUrl: `https://player.vimeo.com/video/${id}` } };
  }
  return null;
}

function youtubePreview(id) {
  return {
    siteName: "YouTube",
    video: {
      id,
      // maxresdefault есть не у всех роликов — клиент перебирает варианты по порядку.
      images: [
        `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
        `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      ],
    },
  };
}

// Поля превью, которые известны по одной ссылке, без захода на страницу.
function videoFields(url) {
  const known = videoPreviewFor(url);
  if (!known) return {};
  const image = known.video?.images?.[0] ?? null;
  return {
    siteName: known.siteName,
    image,
    images: known.video?.images ?? undefined,
    video: known.video,
  };
}

// Можно ли показать страницу во встроенном браузере (iframe): многие сайты
// запрещают это заголовками X-Frame-Options / CSP frame-ancestors, и тогда
// iframe молча остаётся пустым. Результат кэшируется на 10 минут.
const frameCache = new Map();
const FRAME_CACHE_MS = 10 * 60_000;

function frameAncestorsAllow(csp, ourOrigin) {
  const directive = csp
    .split(",")
    .flatMap((policy) => policy.split(";"))
    .map((d) => d.trim())
    .find((d) => /^frame-ancestors\b/i.test(d));
  if (!directive) return true;
  const sources = directive.split(/\s+/).slice(1).map((x) => x.toLowerCase());
  if (sources.includes("'none'")) return false;
  if (sources.includes("*")) return true;
  const ours = new URL(ourOrigin);
  return sources.some((src) => {
    const m = /^(?:(https?):\/\/)?(\*\.)?([^/:]+)(?::\d+)?\/?$/.exec(src);
    if (!m) return src === `${ours.protocol}`;
    if (m[1] && `${m[1]}:` !== ours.protocol) return false;
    return m[2] ? ours.hostname.endsWith(`.${m[3]}`) : ours.hostname === m[3];
  });
}

async function checkFrameable(url, ourOrigin) {
  const key = `${ourOrigin} ${url}`;
  const cached = frameCache.get(key);
  if (cached && cached.at > Date.now() - FRAME_CACHE_MS) return cached.result;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let result;
  try {
    // Представляемся обычным браузером: некоторые сайты боту отвечают без
    // запрета на встраивание, а браузеру — с ним.
    const res = await fetchPublic(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
        "sec-fetch-dest": "iframe",
        "sec-fetch-mode": "navigate",
      },
    });
    res.body?.cancel?.().catch(() => {});
    const xfo = (res.headers.get("x-frame-options") ?? "").trim().toLowerCase();
    const csp = res.headers.get("content-security-policy") ?? "";
    if (xfo && xfo !== "allowall") {
      result = { frameable: false, status: res.status };
    } else if (res.status >= 400) {
      // Ошибка или защита от ботов — что увидит браузер, неизвестно.
      result = { frameable: null, status: res.status };
    } else {
      result = { frameable: frameAncestorsAllow(csp, ourOrigin), status: res.status };
    }
  } catch {
    result = { frameable: null }; // не удалось проверить — пусть клиент попробует сам
  } finally {
    clearTimeout(timeout);
  }
  if (frameCache.size > 1000) frameCache.clear();
  frameCache.set(key, { at: Date.now(), result });
  return result;
}

module.exports = { fetchLinkPreview, checkSafety, assertPublicUrl, checkFrameable, fetchPublic, decodeEntities, metaTag, videoPreviewFor };
