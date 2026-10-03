import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { openInAppBrowser } from "./inAppBrowser.js";

// Instant View, как в Telegram: статья по ссылке в простом виде для чтения.
// Сервер отдаёт только текстовые блоки (lib/instantView.js), здесь всё
// выводится через textContent — никакого чужого HTML.
export function openInstantView(url, { unsafe = false, warning = null } = {}) {
  const body = el("div", { class: "iv-body" }, el("p", { class: "iv-status" }, "Загружаем статью…"));
  const overlay = el("div", { class: "modal-overlay iv-overlay", onclick: (e) => e.target === overlay && close() });
  const panel = el("div", { class: "iv-panel" }, [
    el("div", { class: "iv-header" }, [
      el("button", { class: "icon-btn", title: "Закрыть", html: iconSvg("X", 18), onclick: () => close() }),
      el("span", { class: "iv-badge" }, "⚡ Instant View"),
      el(
        "button",
        {
          class: "inapp-browser-external",
          onclick: () => {
            close();
            openInAppBrowser(url, { unsafe, warning });
          },
        },
        "Открыть сайт"
      ),
    ]),
    body,
  ]);
  overlay.appendChild(panel);

  function onKey(e) {
    if (e.key === "Escape") close();
  }
  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  }
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);

  api
    .instantView(url)
    .then(({ view }) => render(view))
    .catch((err) => {
      body.replaceChildren(
        el("p", { class: "iv-status" }, err.message || "Не удалось открыть статью"),
        el("button", { class: "btn-accent", onclick: () => (close(), openInAppBrowser(url, { unsafe, warning })) }, "Открыть сайт")
      );
    });

  function render(view) {
    const date = view.publishedAt && !Number.isNaN(Date.parse(view.publishedAt))
      ? new Date(view.publishedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
      : "";
    const blocks = view.blocks.map((b) => {
      switch (b.type) {
        case "heading":
          return el("h3", { class: "iv-heading" }, b.text);
        case "quote":
          return el("blockquote", { class: "iv-quote" }, b.text);
        case "item":
          return el("p", { class: "iv-item" }, `• ${b.text}`);
        case "code":
          return el("pre", { class: "iv-code mono" }, b.text);
        case "caption":
          return el("p", { class: "iv-caption" }, b.text);
        case "image":
          return el("img", { class: "iv-image", src: b.url, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror: (e) => e.target.remove() });
        default:
          return el("p", { class: "iv-text" }, b.text);
      }
    });
    body.replaceChildren(
      el("p", { class: "iv-site" }, view.siteName),
      el("h2", { class: "iv-title" }, view.title || view.siteName),
      [view.author, date].some(Boolean) ? el("p", { class: "iv-byline" }, [view.author, date].filter(Boolean).join(" · ")) : null,
      ...blocks
    );
    body.scrollTop = 0;
  }
}
