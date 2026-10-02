import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

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

function embedUrlFor(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (/^\d+$/.test(id || "")) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
  }
  return url;
}

export function openInAppBrowser(url, { warning, unsafe } = {}) {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
  }

  const overlay = el("div", { class: "inapp-browser-overlay" });
  const iframe = el("iframe", {
    class: "inapp-browser-frame",
    src: embedUrlFor(url),
    sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-presentation",
    allow: "autoplay; fullscreen; picture-in-picture; encrypted-media",
  });

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
