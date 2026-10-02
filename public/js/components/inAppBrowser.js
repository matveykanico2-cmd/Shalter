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

// Крупные сайты, которые точно запрещают показ внутри других сайтов
// (X-Frame-Options / frame-ancestors). Их сразу открываем в новой вкладке —
// синхронно, пока ещё идёт клик, иначе браузер заблокирует всплывающее окно.
const NEVER_FRAMEABLE = [
  "github.com", "gitlab.com", "google.com", "google.ru", "youtube.com", "x.com", "twitter.com",
  "facebook.com", "instagram.com", "linkedin.com", "reddit.com", "stackoverflow.com",
  "vk.com", "vk.ru", "ok.ru", "mail.ru", "yandex.ru", "ya.ru", "dzen.ru", "ozon.ru",
  "wildberries.ru", "avito.ru", "habr.com", "amazon.com", "apple.com", "microsoft.com",
  "openai.com", "chatgpt.com", "claude.ai", "anthropic.com", "discord.com", "twitch.tv",
  "tiktok.com", "pinterest.com", "spotify.com", "netflix.com", "paypal.com", "notion.so",
  "figma.com", "medium.com", "npmjs.com", "telegram.org", "web.telegram.org", "steamcommunity.com",
  "store.steampowered.com", "gosuslugi.ru", "sberbank.ru", "tinkoff.ru", "tbank.ru",
];

function isNeverFrameable(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return NEVER_FRAMEABLE.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
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
  if (!unsafe && !warning && !isEmbedPlayer(target) && isNeverFrameable(target)) {
    openExternally(url);
    return { close() {} };
  }

  const overlay = el("div", { class: "inapp-browser-overlay" });
  const body = el("div", { class: "inapp-browser-body" }, el("div", { class: "inapp-browser-loading" }, "Загрузка…"));

  const header = el("div", { class: "inapp-browser-header" }, [
    el("button", { class: "icon-btn", title: "Закрыть", html: iconSvg("X", 18), onclick: close }),
    el("div", { class: "inapp-browser-host" }, [el("span", { html: iconSvg("Lock", 12) }), " ", host]),
    el("button", { class: "inapp-browser-external", title: "Открыть в браузере", onclick: () => { openExternally(url); close(); } }, [
      el("span", { html: iconSvg("Globe", 16) }),
      el("span", {}, "В браузере"),
    ]),
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
  function showBlocked(reason, { tryHere = false } = {}) {
    body.replaceChildren(
      el("div", { class: "inapp-browser-blocked" }, [
        el("span", { class: "inapp-browser-blocked-icon", html: iconSvg("Globe", 40) }),
        el("p", { class: "inapp-browser-blocked-title" }, host),
        el("p", { class: "inapp-browser-blocked-text" }, reason),
        el("button", { class: "btn-accent", onclick: () => { openExternally(url); close(); } }, "Открыть в браузере"),
        tryHere ? el("button", { class: "btn-secondary", onclick: showFrame }, "Попробовать открыть здесь") : null,
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
        // Внутри окна — только когда точно можно: иначе браузер покажет
        // «Отказано в подключении».
        if (res.frameable === true) showFrame();
        else if (res.frameable === false) showBlocked("Этот сайт не разрешает открывать себя внутри других приложений.");
        else showBlocked("Не удалось проверить, откроется ли сайт внутри приложения.", { tryHere: true });
      })
      .catch(() => overlay.isConnected && showBlocked("Не удалось проверить, откроется ли сайт внутри приложения.", { tryHere: true }));
  }

  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  return { close };
}
