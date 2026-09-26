import { el } from "./dom.js";
import { navigate } from "../router.js";
import { openInAppBrowser, checkLinkSafety } from "../components/inAppBrowser.js";
import { openProfileDialog } from "../components/profileDialog.js";
import { getState } from "../state.js";
import { api } from "../api.js";

// Vanilla-JS port of components/chat/formatText.tsx — same markdown-like
// shortcuts (**bold**, *italic*, `code`, ~~strike~~, ||spoiler||, > quote,
// @mentions, bare URLs). Builds real DOM nodes with textContent (never
// innerHTML) so message text can never be interpreted as markup.
//
// `members` (optional — the chat's member list, see messageBubble.js) lets
// an @mention resolve to a real user and become clickable; a token that
// doesn't match anyone in the chat (a stray "@handle" from a pasted link,
// someone no longer in the group, etc.) just renders as plain styled text,
// same as before this list existed.
export function formatText(text, members) {
  const lines = text.split("\n");
  return el(
    "span",
    {},
    lines.map((line, i) => {
      const isQuote = line.startsWith("> ");
      const content = renderInline(isQuote ? line.slice(2) : line, members);
      return el("span", { class: "block" }, isQuote ? el("span", { class: "quote-line" }, content) : content);
    })
  );
}

function renderInline(text, members) {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~|\|\|[^|]+\|\||@\w+|https?:\/\/\S+)/g);
  return tokens.filter(Boolean).map((tok) => {
    if (tok.startsWith("**") && tok.endsWith("**")) return el("b", {}, tok.slice(2, -2));
    if (tok.startsWith("`") && tok.endsWith("`")) return el("code", { class: "inline-code" }, tok.slice(1, -1));
    if (tok.startsWith("~~") && tok.endsWith("~~")) return el("s", { class: "strike" }, tok.slice(2, -2));
    if (tok.startsWith("||") && tok.endsWith("||")) return spoiler(tok.slice(2, -2));
    if (tok.startsWith("@")) {
      const handle = tok.slice(1).toLowerCase();
      // Любое @упоминание кликабельно и ведёт на профиль — не только тех, кто
      // сейчас в этом чате. Участник открывается сразу (id уже есть), чужой —
      // после запроса по юзернейму; если это не человек, а канал/группа/бот,
      // отдаём это резолверу адреса (/u/имя, см. app.js).
      const member = members?.find((u) => u.username && u.username.toLowerCase() === handle);
      return el(
        "button",
        {
          class: "mention mention-link",
          onclick: async () => {
            // Свой же юзернейм: сервер не отдаёт тебя самому себе (404), из-за
            // чего клик «не срабатывал». Открываем свой профиль сразу.
            const me = getState().user;
            if (me && me.username && me.username.toLowerCase() === handle) return openProfileDialog(me.id);
            if (member) return openProfileDialog(member.id);
            try {
              const { user } = await api.findUserByUsername(handle);
              // Нашёлся человек — открываем профиль; ответ без id (не человек)
              // отдаём резолверу адреса, как и явную ошибку ниже.
              if (user?.id) return openProfileDialog(user.id);
              navigate(`/u/${handle}`);
            } catch {
              // Не человек (канал/группа/бот) или сбой запроса — пусть решает
              // резолвер адреса (/u/имя, app.js): он откроет канал/бота/чат.
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
            // Ссылка на само приложение (магазин, канал, приглашение) открывается
            // внутри него, а не в окне браузера поверх: там она показала бы вторую
            // копию Shalter в рамке, со своим входом и своей навигацией.
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

// Одиночный сегмент-юзернейм («/bob», «/@bob») → маршрут резолвера «/u/bob»,
// чтобы вставленная ссылка вида домен/username открывалась внутри приложения,
// а не упиралась в «страница не найдена». Зарезервированные пути приложения
// (те же, что в app.js) не трогаем. Всё прочее — как есть.
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

// Путь внутри этого же приложения — или null, если ссылка ведёт наружу.
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
