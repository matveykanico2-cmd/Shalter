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
  const lines = text.split("\n");
  return el(
    "span",
    {},
    lines.map((line, i) => {
      const isQuote = line.startsWith("> ");
      const content = renderInline(isQuote ? line.slice(2) : line, members, emoji);
      return el("span", { class: "block" }, isQuote ? el("span", { class: "quote-line" }, content) : content);
    })
  );
}

function renderInline(text, members, emoji) {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~|\|\|[^|]+\|\||\[ce:\d+\]|@\w+|https?:\/\/\S+)/g);
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
