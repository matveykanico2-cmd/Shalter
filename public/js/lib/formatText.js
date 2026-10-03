import { el } from "./dom.js";
import { navigate } from "../router.js";
import { openInAppBrowser, checkLinkSafety } from "../components/inAppBrowser.js";
import { openProfileDialog } from "../components/profileDialog.js";
import { getState } from "../state.js";
import { api } from "../api.js";
import { renderCustomScene } from "./customScene.js";
import { tokenize, langLabel } from "./highlight.js";

const CE_TOKEN_RE = /\[ce:\d+\]/g;

export function previewText(text) {
  return (text ?? "").replace(CE_TOKEN_RE, "🎨");
}

export function formatText(text, members, emoji) {
  // ```блок кода``` — может занимать несколько строк, внутри разметка не работает.
  const parts = text.split(/(```[\s\S]*?```)/g);
  const out = [];
  for (const part of parts) {
    if (!part) continue;
    if (part.length >= 6 && part.startsWith("```") && part.endsWith("```")) {
      const body = part.slice(3, -3);
      const lang = /^([a-z0-9+#-]*)\n/i.exec(body)?.[1] ?? "";
      out.push(codeBlock(body.replace(/^[a-z0-9+#-]*\n/i, "").replace(/\n$/, ""), lang));
      continue;
    }
    const lines = part.replace(/^\n|\n$/g, "").split("\n");
    for (let i = 0; i < lines.length; i++) {
      // Подряд идущие строки «> …» — одна цитата; длинная сворачивается.
      if (lines[i].startsWith("> ") || lines[i] === ">") {
        const quote = [];
        while (i < lines.length && (lines[i].startsWith("> ") || lines[i] === ">")) quote.push(lines[i++].slice(2));
        i--;
        out.push(quoteBlock(quote, members, emoji));
        continue;
      }
      // Таблица: строки вида «| a | b |», вторая может быть разделителем «|---|---|».
      if (isTableRow(lines[i]) && isTableRow(lines[i + 1] ?? "")) {
        const rows = [];
        while (i < lines.length && isTableRow(lines[i])) rows.push(lines[i++]);
        i--;
        out.push(tableBlock(rows, members, emoji));
        continue;
      }
      out.push(el("span", { class: "block" }, renderInline(lines[i], members, emoji)));
    }
  }
  return el("span", {}, out);
}

const QUOTE_COLLAPSE_LINES = 4;

function quoteBlock(lines, members, emoji) {
  const body = el("span", { class: "quote-line" }, lines.map((l) => el("span", { class: "block" }, renderInline(l, members, emoji))));
  if (lines.length <= QUOTE_COLLAPSE_LINES) return el("span", { class: "block" }, body);
  body.classList.add("quote-collapsed");
  const toggle = el("button", {
    class: "quote-toggle",
    type: "button",
    onclick: (e) => {
      e.stopPropagation();
      const collapsed = body.classList.toggle("quote-collapsed");
      toggle.textContent = collapsed ? "Показать полностью" : "Свернуть";
    },
  }, "Показать полностью");
  return el("span", { class: "block quote-expandable" }, [body, toggle]);
}

function isTableRow(line) {
  const t = line.trim();
  return t.length > 2 && t.startsWith("|") && t.endsWith("|");
}

function tableCells(line) {
  return line.trim().slice(1, -1).split("|").map((c) => c.trim());
}

function tableBlock(rows, members, emoji) {
  const isDivider = (row) => tableCells(row).every((c) => /^:?-{2,}:?$/.test(c));
  const hasHeader = rows.length > 1 && isDivider(rows[1]);
  const body = rows.filter((r, i) => !(hasHeader && i === 1));
  const cols = Math.min(10, Math.max(...body.map((r) => tableCells(r).length)));
  const row = (line, tag) =>
    el("tr", {}, Array.from({ length: cols }, (_, c) => el(tag, {}, renderInline(tableCells(line)[c] ?? "", members, emoji))));
  const table = el("table", { class: "message-table" }, [
    hasHeader ? el("thead", {}, row(body[0], "th")) : null,
    el("tbody", {}, (hasHeader ? body.slice(1) : body).map((r) => row(r, "td"))),
  ]);
  return el("span", { class: "block message-table-wrap" }, table);
}

function codeBlock(code, lang) {
  const copy = el("button", {
    class: "code-block-copy",
    type: "button",
    title: "Копировать код",
    onclick: (e) => {
      e.stopPropagation();
      navigator.clipboard?.writeText(code).then(() => {
        copy.textContent = "Скопировано";
        setTimeout(() => (copy.textContent = "Копировать"), 1500);
      }, () => {});
    },
  }, "Копировать");
  const label = langLabel(lang);
  const tokens = code.length <= 20000 ? tokenize(code, lang) : [[null, code]];
  const highlighted = tokens.map(([cls, text]) => (cls ? el("span", { class: cls }, text) : document.createTextNode(text)));
  return el("span", { class: "code-block" }, [
    el("span", { class: "code-block-head" }, [el("span", { class: "code-block-lang" }, label || "Код"), copy]),
    el("pre", {}, el("code", {}, highlighted)),
  ]);
}

function renderInline(text, members, emoji) {
  const tokens = text.split(/(\[[^\]\n]{1,200}\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~|__[^_]+__|\|\|[^|]+\|\||\[ce:\d+\]|@\w+|#[\p{L}\p{N}_]{2,64}|https?:\/\/\S+)/gu);
  return tokens.filter(Boolean).map((tok) => {
    const ce = /^\[ce:(\d+)\]$/.exec(tok);
    if (ce) {
      const scene = emoji?.[Number(ce[1])];
      if (!scene) return document.createTextNode("🎨");
      return el("span", { class: "inline-custom-emoji" }, [renderCustomScene(scene, { size: 30 })]);
    }
    const md = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(tok);
    if (md) return linkNode(md[2], md[1]);
    if (tok.startsWith("**") && tok.endsWith("**")) return el("b", {}, tok.slice(2, -2));
    if (tok.startsWith("`") && tok.endsWith("`")) return el("code", { class: "inline-code" }, tok.slice(1, -1));
    if (tok.startsWith("~~") && tok.endsWith("~~")) return el("s", { class: "strike" }, tok.slice(2, -2));
    if (tok.startsWith("__") && tok.endsWith("__") && tok.length > 4) return el("u", {}, tok.slice(2, -2));
    if (tok.startsWith("#") && tok.length > 2)
      return el(
        "button",
        {
          class: "mention hashtag-link",
          onclick: (e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("shalter:hashtag", { detail: tok }));
          },
        },
        tok
      );
    if (tok.startsWith("||") && tok.endsWith("||")) return spoiler(tok.slice(2, -2));
    if (tok.startsWith("@")) {
      const handle = tok.slice(1).toLowerCase();
      const member = members?.find((u) => u.username && u.username.toLowerCase() === handle);
      return el(
        "button",
        {
          class: "mention mention-link",
          onclick: async () => {
            const me = getState().user;
            if (me && me.username && me.username.toLowerCase() === handle) return openProfileDialog(me.id);
            if (member) return openProfileDialog(member.id);
            try {
              const { user } = await api.findUserByUsername(handle);
              if (user?.id) return openProfileDialog(user.id);
              navigate(`/u/${handle}`);
            } catch {
              navigate(`/u/${handle}`);
            }
          },
        },
        tok
      );
    }
    if (tok.startsWith("http://") || tok.startsWith("https://")) return linkNode(tok, tok);
    if (tok.startsWith("*") && tok.endsWith("*")) return el("i", {}, tok.slice(1, -1));
    return tok;
  });
}

// Ссылка с подписью [текст](url): адрес показываем в title, чтобы было видно,
// куда она ведёт на самом деле, а проверка безопасности идёт по реальному url.
function linkNode(href, label) {
  return el(
    "a",
    {
      href,
      target: "_blank",
      rel: "noreferrer",
      class: "text-link",
      title: label === href ? null : href,
      onclick: (e) => {
        e.preventDefault();
        const internal = internalPath(href);
        if (internal) return navigate(usernameToRoute(internal));
        const { unsafe, warning } = checkLinkSafety(href);
        openInAppBrowser(href, { unsafe, warning });
      },
    },
    label
  );
}

const RESERVED_USERNAME_PATHS = new Set([
  "u", "chat", "call", "call-join", "join", "folder", "nearby", "contacts",
  "discover-channels", "market", "calls", "archive", "settings", "login",
  "download", "promo", "bots", "oauth-docs",
]);
function usernameToRoute(path) {
  const m = path.match(/^\/@?([A-Za-z0-9_]{3,32})\/?(\?.*|#.*)?$/);
  if (m && !RESERVED_USERNAME_PATHS.has(m[1].toLowerCase())) return `/u/${m[1]}${m[2] ?? ""}`;
  return path;
}

function internalPath(href) {
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function spoiler(text) {
  const span = el("span", { class: "spoiler", role: "button", tabindex: "0", "aria-label": "Скрытый текст — нажмите, чтобы показать" }, text);
  const reveal = (e) => {
    if (span.classList.contains("revealed")) return;
    e.stopPropagation();
    span.classList.add("revealed");
    span.removeAttribute("role");
    span.removeAttribute("tabindex");
    span.removeAttribute("aria-label");
  };
  span.addEventListener("click", reveal);
  span.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      reveal(e);
    }
  });
  return span;
}
