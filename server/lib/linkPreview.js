const dns = require("dns").promises;
const net = require("net");

const URL_RE = /https?:\/\/[^\s<>"]+/;
const MAX_RESPONSE_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 6000;

const SHORTENER_HOSTS = new Set(["bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "buff.ly"]);

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchPublic(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ShalterLinkPreview/1.0)" },
    });
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok || !contentType.includes("text/html")) {
      return { url, unsafe: safety.unsafe, warning: safety.warning };
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

    if (!title && !description && !image) return { url, unsafe: safety.unsafe, warning: safety.warning };

    return {
      url,
      title: title?.slice(0, 200) || null,
      description: description?.slice(0, 300) || null,
      image: image || null,
      siteName,
      unsafe: safety.unsafe,
      warning: safety.warning,
    };
  } catch {
    return { url, unsafe: safety.unsafe, warning: safety.warning };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { fetchLinkPreview, checkSafety, assertPublicUrl };
