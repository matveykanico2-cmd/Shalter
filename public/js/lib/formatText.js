import { el } from "./dom.js";
import { navigate } from "../router.js";
import { openInAppBrowser, checkLinkSafety } from "../components/inAppBrowser.js";
import { openProfileDialog } from "../components/profileDialog.js";
import { getState } from "../state.js";
import { api } from "../api.js";
import { renderCustomScene } from "./customScene.js";

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
      out.push(codeBlock(part.slice(3, -3).replace(/^[a-z0-9+#-]*\n/i, "").replace(/\n$/, "")));
      continue;
    }
    for (const line of part.replace(/^\n|\n$/g, "").split("\n")) {
      const isQuote = line.startsWith("> ");
      const content = renderInline(isQuote ? line.slice(2) : line, members, emoji);
      out.push(el("span", { class: "block" }, isQuote ? el("span", { class: "quote-line" }, content) : content));
    }
  }
  return el("span", {}, out);
}

function codeBlock(code) {
  const copy = el("button", {
    class: "code-block-copy",
    type: "button",
    onclick: (e) => {
      e.stopPropagation();
      navigator.clipboard?.writeText(code).then(() => {
        copy.textContent = "Скопировано";
        setTimeout(() => (copy.textContent = "Копировать"), 1500);
      }, () => {});
    },
  }, "Копировать");
  return el("span", { class: "code-block" }, [copy, el("pre", {}, el("code", {}, code))]);
}

function renderInline(text, members, emoji) {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~|__[^_]+__|\|\|[^|]+\|\||\[ce:\d+\]|@\w+|#[\p{L}\p{N}_]{2,64}|https?:\/\/\S+)/gu);
  return tokens.filter(Boolean).map((tok) => {
    const ce = /^\[ce:(\d+)\]$/.exec(tok);
    if (ce) {
      const scene = emoji?.[Number(ce[1])];
      if (!scene) return document.createTextNode("🎨");
      return el("span", { class: "inline-custom-emoji" }, [renderCustomScene(scene, { size: 30 })]);
    }
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
    if (tok.startsWith("http://") || tok.startsWith("https://"))
      return el(
        "a",
        {
          href: tok,
          target: "_blank",
          rel: "noreferrer",
          class: "text-link",
          onclick: (e) => {
            e.preventDefault();
            const internal = internalPath(tok);
            if (internal) return navigate(usernameToRoute(internal));
            const { unsafe, warning } = checkLinkSafety(tok);
            openInAppBrowser(tok, { unsafe, warning });
          },
        },
        tok
      );
    if (tok.startsWith("*") && tok.endsWith("*")) return el("i", {}, tok.slice(1, -1));
    return tok;
  });
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
  const span = el("span", { class: "spoiler" }, text);
  span.addEventListener("click", () => span.classList.add("revealed"), { once: true });
  return span;
}
