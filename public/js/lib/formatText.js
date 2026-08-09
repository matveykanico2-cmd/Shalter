import { el } from "./dom.js";
import { openInAppBrowser, checkLinkSafety } from "../components/inAppBrowser.js";
import { openProfileDialog } from "../components/profileDialog.js";

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
      const user = members?.find((u) => u.username && u.username.toLowerCase() === handle);
      if (user) return el("button", { class: "mention mention-link", onclick: () => openProfileDialog(user.id) }, tok);
      return el("span", { class: "mention" }, tok);
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

function spoiler(text) {
  const span = el("span", { class: "spoiler" }, text);
  span.addEventListener("click", () => span.classList.add("revealed"), { once: true });
  return span;
}
