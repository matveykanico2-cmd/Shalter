// Instant View: статья по ссылке в виде простого текста — заголовки, абзацы,
// цитаты, пункты списков и картинки. HTML страницы клиенту не отдаём вовсе
// (только строки), поэтому чужие скрипты и стили в Shalter не попадают.
const { fetchPublic, decodeEntities, metaTag, checkSafety } = require("./linkPreview");

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_BLOCKS = 400;
const MIN_TEXT = 300;

const cache = new Map();
const CACHE_MS = 30 * 60 * 1000;

async function readBody(res) {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.from(await res.arrayBuffer());
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size > MAX_BYTES) {
      reader.cancel().catch(() => {});
      break;
    }
  }
  return Buffer.concat(chunks);
}

// Кодировка из заголовка или <meta charset> — многие русские сайты всё ещё в windows-1251.
function decodeHtml(buf, contentType) {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType)?.[1];
  const head = buf.subarray(0, 4096).toString("latin1");
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  const charset = (fromHeader || fromMeta || "utf-8").toLowerCase();
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

function cleanText(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&mdash;/g, "—")
      .replace(/&ndash;/g, "–")
      .replace(/&laquo;/g, "«")
      .replace(/&raquo;/g, "»")
      .replace(/&hellip;/g, "…")
  )
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

// Основная часть страницы: <article>, иначе <main>, иначе <body>.
function mainPart(html) {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|template|iframe|form|button|select)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, "");
  for (const tag of ["article", "main"]) {
    const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*)</${tag}>`, "i").exec(stripped);
    if (m && cleanText(m[1]).length >= MIN_TEXT) return m[1];
  }
  return /<body[^>]*>([\s\S]*)<\/body>/i.exec(stripped)?.[1] ?? stripped;
}

function absoluteUrl(src, base) {
  try {
    const u = new URL(decodeEntities(src), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function extractBlocks(part, baseUrl) {
  const blocks = [];
  const re = /<(h[1-4]|p|blockquote|li|pre|img|figcaption)\b([^>]*)>([\s\S]*?)(?=<\/\1>|<(?:h[1-4]|p|blockquote|li|pre|figcaption)\b|$)/gi;
  let m;
  while ((m = re.exec(part)) && blocks.length < MAX_BLOCKS) {
    const tag = m[1].toLowerCase();
    if (tag === "img") {
      const src = /\bsrc=["']([^"']+)["']/i.exec(m[2])?.[1];
      const width = Number(/\bwidth=["']?(\d+)/i.exec(m[2])?.[1] ?? 0);
      if (width && width < 100) continue; // иконки и значки
      const url = src && absoluteUrl(src, baseUrl);
      if (url && !/\.svg(\?|$)/i.test(url) && !/(pixel|counter|tracking|1x1)/i.test(url)) blocks.push({ type: "image", url });
      continue;
    }
    const text = cleanText(m[3]);
    if (!text) continue;
    const type = tag.startsWith("h") ? "heading" : tag === "blockquote" ? "quote" : tag === "li" ? "item" : tag === "pre" ? "code" : tag === "figcaption" ? "caption" : "text";
    if (type === "text" && text.length < 2) continue;
    const prev = blocks[blocks.length - 1];
    if (prev && prev.text === text) continue;
    blocks.push({ type, text: text.slice(0, 8000) });
  }
  return blocks;
}

async function buildInstantView(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.view;

  const res = await fetchPublic(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ShalterInstantView/1.0)", Accept: "text/html" },
  });
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) throw Object.assign(new Error(`Сайт ответил ошибкой ${res.status}`), { status: 502 });
  if (!contentType.includes("text/html")) throw Object.assign(new Error("Это не статья"), { status: 422 });

  const html = decodeHtml(await readBody(res), contentType);
  const blocks = extractBlocks(mainPart(html), url);
  const textLength = blocks.reduce((n, b) => n + (b.text?.length ?? 0), 0);
  if (textLength < MIN_TEXT) throw Object.assign(new Error("На странице не нашлось статьи"), { status: 422 });

  const view = {
    url,
    title: cleanText(metaTag(html, "og:title") || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || ""),
    siteName: cleanText(metaTag(html, "og:site_name") || "") || new URL(url).hostname.replace(/^www\./, ""),
    author: cleanText(metaTag(html, "author") || metaTag(html, "article:author") || ""),
    publishedAt: metaTag(html, "article:published_time") || null,
    image: absoluteUrl(metaTag(html, "og:image") || "", url),
    blocks,
    unsafe: checkSafety(url).unsafe || undefined,
  };
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  cache.set(url, { at: Date.now(), view });
  return view;
}

module.exports = { buildInstantView };
