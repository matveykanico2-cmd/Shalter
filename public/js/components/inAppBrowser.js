import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";

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

function isEmbedPlayer(url) {
  return /^https:\/\/(www\.youtube\.com\/embed\/|player\.vimeo\.com\/video\/)/.test(url);
}

function openExternally(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function openInAppBrowser(url, { warning, unsafe } = {}) {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
  }
  const target = embedUrlFor(url);

  const overlay = el("div", { class: "inapp-browser-overlay" });
  const body = el("div", { class: "inapp-browser-body" }, el("div", { class: "inapp-browser-loading" }, "Загрузка…"));

  const header = el("div", { class: "inapp-browser-header" }, [
    el("button", { class: "icon-btn", title: "Закрыть", html: iconSvg("X", 18), onclick: close }),
    el("div", { class: "inapp-browser-host" }, [el("span", { html: iconSvg("Lock", 12) }), " ", host]),
    el("button", { class: "icon-btn", title: "Открыть в браузере", html: iconSvg("Globe", 16), onclick: () => openExternally(url) }),
  ]);

  const warningBar = warning
    ? el("div", { class: `inapp-browser-warning ${unsafe ? "danger" : ""}` }, [el("span", { html: iconSvg("Info", 14) }), " ", warning])
    : null;

  overlay.append(...[header, warningBar, body].filter(Boolean));
  document.body.appendChild(overlay);

  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);

  function showFrame() {
    body.replaceChildren(
      el("iframe", {
        class: "inapp-browser-frame",
        src: target,
        sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-presentation",
        allow: "autoplay; fullscreen; picture-in-picture; encrypted-media",
        referrerpolicy: "no-referrer",
      })
    );
  }

  // Сайт запрещает показ внутри приложения (или ссылка http на https-странице) —
  // вместо пустого окна объясняем и предлагаем открыть в браузере.
  function showBlocked(reason) {
    body.replaceChildren(
      el("div", { class: "inapp-browser-blocked" }, [
        el("span", { class: "inapp-browser-blocked-icon", html: iconSvg("Globe", 40) }),
        el("p", { class: "inapp-browser-blocked-title" }, host),
        el("p", { class: "inapp-browser-blocked-text" }, reason),
        el("button", { class: "btn-accent", onclick: () => { openExternally(url); close(); } }, "Открыть в браузере"),
        el("button", { class: "modal-cancel", onclick: () => navigator.clipboard?.writeText(url).catch(() => {}) }, "Скопировать ссылку"),
      ])
    );
  }

  let insecure = false;
  try {
    insecure = new URL(target).protocol === "http:" && window.location.protocol === "https:";
  } catch {
    showBlocked("Некорректная ссылка");
  }
  if (insecure) {
    showBlocked("Сайт работает без шифрования (http), поэтому внутри приложения его открыть нельзя.");
  } else if (isEmbedPlayer(target)) {
    showFrame();
  } else {
    api
      .checkFrameable(target)
      .then((res) => {
        if (!overlay.isConnected) return;
        if (res.frameable === false) showBlocked("Этот сайт не разрешает открывать себя внутри других приложений.");
        else showFrame();
      })
      .catch(() => overlay.isConnected && showFrame());
  }

  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  return { close };
}
