import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// Client-side mirror of server/lib/linkPreview.js's checkSafety() — kept in
// sync by hand (no shared module system between server/client here, same as
// public/js/lib/groupLevels.js). Used for links tapped straight out of
// message text, which don't carry the server-computed linkPreview.warning
// a fetched preview card would.
const SHORTENER_HOSTS = new Set(["bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "buff.ly"]);
export function checkLinkSafety(url) {
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

// A lightweight in-app browser overlay for links tapped in chat — opens in
// an iframe instead of leaving the app. Important honesty about what this
// can and can't do: many real sites (banks, Google, X/Twitter, even
// Telegram's own pages) send X-Frame-Options/CSP headers that block being
// iframed at all, and there's no reliable way for this page's JS to detect
// that (browsers fail those silently, no onerror fires) — so "Открыть в
// браузере" stays a prominent, always-available escape hatch rather than a
// fallback only shown after a detected failure.
export function openInAppBrowser(url, { warning, unsafe } = {}) {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    // leave host as the raw url if it's somehow not parseable
  }

  const overlay = el("div", { class: "inapp-browser-overlay" });
  const iframe = el("iframe", { class: "inapp-browser-frame", src: url, sandbox: "allow-scripts allow-same-origin allow-forms allow-popups" });

  const header = el("div", { class: "inapp-browser-header" }, [
    el("button", { class: "icon-btn", html: iconSvg("X", 18), onclick: close }),
    el("div", { class: "inapp-browser-host" }, [el("span", { html: iconSvg("Lock", 12) }), " ", host]),
    el("a", { class: "icon-btn", href: url, target: "_blank", rel: "noreferrer", title: "Открыть в браузере", html: iconSvg("Globe", 16) }),
  ]);

  const warningBar = warning
    ? el("div", { class: `inapp-browser-warning ${unsafe ? "danger" : ""}` }, [el("span", { html: iconSvg("Info", 14) }), " ", warning])
    : null;

  overlay.append(...[header, warningBar, iframe].filter(Boolean));
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }
  return { close };
}
