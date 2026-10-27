// Разметка текста сообщения — разбор formatText из public/js/lib/formatText.js. Здесь
// только дерево блоков; рисует его ui/message-text.tsx.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold" | "italic" | "code" | "strike" | "underline" | "spoiler" | "hashtag"; text: string }
  | { kind: "link"; href: string; label: string }
  | { kind: "mention"; handle: string; text: string }
  | { kind: "emoji"; index: number };

export type Block =
  | { kind: "line"; inline: Inline[] }
  | { kind: "code"; code: string; lang: string }
  | { kind: "quote"; lines: Inline[][] }
  | { kind: "table"; header: Inline[][] | null; rows: Inline[][][] }
  // Только в теле статьи (parseText(text, { markdown: true })): «## …» и списки «- …».
  | { kind: "heading"; level: 2 | 3 | 4 | 5 | 6; inline: Inline[] }
  | { kind: "list"; items: Inline[][] };

/** Цитата длиннее этого сворачивается. */
export const QUOTE_COLLAPSE_LINES = 4;
const MAX_TABLE_COLS = 10;

/**
 * markdown — тело статьи: ещё заголовки «## »…«###### » и списки «- »/«* ». В обычных
 * сообщениях их нет: «# привет» остаётся текстом с хештегом.
 */
export function parseText(text: string, { markdown = false }: { markdown?: boolean } = {}): Block[] {
  // ```блок кода``` — может занимать несколько строк, внутри разметка не работает.
  const out: Block[] = [];
  for (const part of text.split(/(```[\s\S]*?```)/g)) {
    if (!part) continue;
    if (part.length >= 6 && part.startsWith("```") && part.endsWith("```")) {
      const body = part.slice(3, -3);
      const lang = /^([a-z0-9+#-]*)\n/i.exec(body)?.[1] ?? "";
      out.push({ kind: "code", code: body.replace(/^[a-z0-9+#-]*\n/i, "").replace(/\n$/, ""), lang });
      continue;
    }
    const lines = part.replace(/^\n|\n$/g, "").split("\n");
    for (let i = 0; i < lines.length; i++) {
      // Подряд идущие строки «> …» — одна цитата.
      if (isQuoteLine(lines[i]!)) {
        const quote: Inline[][] = [];
        while (i < lines.length && isQuoteLine(lines[i]!)) quote.push(parseInline(lines[i++]!.slice(2)));
        i--;
        out.push({ kind: "quote", lines: quote });
        continue;
      }
      if (markdown) {
        const heading = HEADING_RE.exec(lines[i]!);
        if (heading) {
          out.push({ kind: "heading", level: Math.max(2, heading[1]!.length) as 2 | 3 | 4 | 5 | 6, inline: parseInline(heading[2]!) });
          continue;
        }
        if (LIST_RE.test(lines[i]!)) {
          const items: Inline[][] = [];
          while (i < lines.length && LIST_RE.test(lines[i]!)) items.push(parseInline(lines[i++]!.replace(LIST_RE, "")));
          i--;
          out.push({ kind: "list", items });
          continue;
        }
      }
      // Таблица: строки вида «| a | b |», вторая может быть разделителем «|---|---|».
      if (isTableRow(lines[i]!) && isTableRow(lines[i + 1] ?? "")) {
        const rows: string[] = [];
        while (i < lines.length && isTableRow(lines[i]!)) rows.push(lines[i++]!);
        i--;
        out.push(table(rows));
        continue;
      }
      out.push({ kind: "line", inline: parseInline(lines[i]!) });
    }
  }
  return out;
}

const HEADING_RE = /^(#{1,6}) +(\S.*)$/;
const LIST_RE = /^[-*] +/;

const isQuoteLine = (line: string) => line.startsWith("> ") || line === ">";

function isTableRow(line: string) {
  const t = line.trim();
  return t.length > 2 && t.startsWith("|") && t.endsWith("|");
}

const tableCells = (line: string) =>
  line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());

function table(rows: string[]): Block {
  const isDivider = (row: string) => tableCells(row).every((c) => /^:?-{2,}:?$/.test(c));
  const hasHeader = rows.length > 1 && isDivider(rows[1]!);
  const body = rows.filter((_, i) => !(hasHeader && i === 1));
  const cols = Math.min(MAX_TABLE_COLS, Math.max(...body.map((r) => tableCells(r).length)));
  const row = (line: string) => Array.from({ length: cols }, (_, c) => parseInline(tableCells(line)[c] ?? ""));
  return { kind: "table", header: hasHeader ? row(body[0]!) : null, rows: (hasHeader ? body.slice(1) : body).map(row) };
}

const INLINE_RE =
  /(\[[^\]\n]{1,200}\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~|__[^_]+__|\|\|[^|]+\|\||\[ce:\d+\]|@\w+|#[\p{L}\p{N}_]{2,64}|https?:\/\/\S+)/gu;

export function parseInline(text: string): Inline[] {
  return text
    .split(INLINE_RE)
    .filter(Boolean)
    .map((tok): Inline => {
      const ce = /^\[ce:(\d+)\]$/.exec(tok);
      if (ce) return { kind: "emoji", index: Number(ce[1]) };
      const md = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(tok);
      if (md) return { kind: "link", href: md[2]!, label: md[1]! };
      if (tok.startsWith("**") && tok.endsWith("**")) return { kind: "bold", text: tok.slice(2, -2) };
      if (tok.startsWith("`") && tok.endsWith("`")) return { kind: "code", text: tok.slice(1, -1) };
      if (tok.startsWith("~~") && tok.endsWith("~~")) return { kind: "strike", text: tok.slice(2, -2) };
      if (tok.startsWith("__") && tok.endsWith("__") && tok.length > 4) return { kind: "underline", text: tok.slice(2, -2) };
      if (tok.startsWith("#") && tok.length > 2) return { kind: "hashtag", text: tok };
      if (tok.startsWith("||") && tok.endsWith("||")) return { kind: "spoiler", text: tok.slice(2, -2) };
      if (tok.startsWith("@")) return { kind: "mention", handle: tok.slice(1).toLowerCase(), text: tok };
      if (tok.startsWith("http://") || tok.startsWith("https://")) return { kind: "link", href: tok, label: tok };
      if (tok.startsWith("*") && tok.endsWith("*")) return { kind: "italic", text: tok.slice(1, -1) };
      return { kind: "text", text: tok };
    });
}

// Ссылки на свои страницы открываем внутри приложения; /имя — профиль (/u/имя).
const RESERVED_USERNAME_PATHS = new Set([
  "u", "chat", "call", "call-join", "join", "folder", "nearby", "contacts",
  "discover-channels", "market", "calls", "archive", "settings", "login",
  "download", "promo", "bots", "oauth-docs",
]);

/** Путь внутри приложения для ссылки на свой origin, иначе null. */
export function internalRoute(href: string, origin: string) {
  let path: string;
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin) return null;
    path = `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
  const m = path.match(/^\/@?([A-Za-z0-9_]{3,32})\/?(\?.*|#.*)?$/);
  if (m && !RESERVED_USERNAME_PATHS.has(m[1]!.toLowerCase())) return `/u/${m[1]}${m[2] ?? ""}`;
  return path;
}
