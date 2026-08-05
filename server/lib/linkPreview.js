// Fetches basic Open Graph / <title> metadata for the first http(s) link in
// a message, server-side (avoids exposing the sender's or recipient's IP to
// the target site, and sidesteps CORS entirely since this never runs in a
// browser). Deliberately no HTML-parsing dependency — this only needs a
// handful of <meta property="og:..."> tags and <title>, which a few regexes
// cover without pulling in a real DOM/HTML parser for it.
const URL_RE = /https?:\/\/[^\s<>"]+/;
const MAX_RESPONSE_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 6000;

// Same "basic, not a real security scanner" caveat as the rest of this
// app's trust model (see server/lib/sanitizeAttachments.js) — this flags
// the common, cheap-to-detect red flags (plaintext http, the userinfo@host
// credential-phishing trick, known shorteners hiding the real destination)
// so the client can show a caution note, not a guarantee of safety.
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

// Returns null if there's no URL, the fetch fails/times out, or the target
// isn't real HTML — a missing preview is a normal, silent outcome, not an
// error worth surfacing to the sender.
async function fetchLinkPreview(text) {
  const url = extractFirstUrl(text);
  if (!url) return null;

  const safety = checkSafety(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
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
      image = new URL(image, url).toString();
    }
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

module.exports = { fetchLinkPreview, checkSafety };
