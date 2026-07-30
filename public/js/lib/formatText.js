import { el } from "./dom.js";

// Vanilla-JS port of components/chat/formatText.tsx — same markdown-like
// shortcuts (**bold**, *italic*, `code`, ~~strike~~, ||spoiler||, > quote,
// @mentions, bare URLs). Builds real DOM nodes with textContent (never
// innerHTML) so message text can never be interpreted as markup.
export function formatText(text) {
  const lines = text.split("\n");
  return el(
    "span",
    {},
    lines.map((line, i) => {
      const isQuote = line.startsWith("> ");
      const content = renderInline(isQuote ? line.slice(2) : line);
      return el("span", { class: "block" }, isQuote ? el("span", { class: "quote-line" }, content) : content);
    })
  );
}

function renderInline(text) {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~|\|\|[^|]+\|\||@\w+|https?:\/\/\S+)/g);
  return tokens.filter(Boolean).map((tok) => {
    if (tok.startsWith("**") && tok.endsWith("**")) return el("b", {}, tok.slice(2, -2));
    if (tok.startsWith("`") && tok.endsWith("`")) return el("code", { class: "inline-code" }, tok.slice(1, -1));
    if (tok.startsWith("~~") && tok.endsWith("~~")) return el("s", { class: "strike" }, tok.slice(2, -2));
    if (tok.startsWith("||") && tok.endsWith("||")) return spoiler(tok.slice(2, -2));
    if (tok.startsWith("@")) return el("span", { class: "mention" }, tok);
    if (tok.startsWith("http://") || tok.startsWith("https://"))
      return el("a", { href: tok, target: "_blank", rel: "noreferrer", class: "text-link" }, tok);
    if (tok.startsWith("*") && tok.endsWith("*")) return el("i", {}, tok.slice(1, -1));
    return tok;
  });
}

function spoiler(text) {
  const span = el("span", { class: "spoiler" }, text);
  span.addEventListener("click", () => span.classList.add("revealed"), { once: true });
  return span;
}
