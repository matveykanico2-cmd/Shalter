import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { listDownloads, removeDownload, clearDownloads } from "../lib/downloads.js";
import { openMediaViewer } from "./mediaViewer.js";
import { askConfirm } from "./confirmDialog.js";
import { navigate } from "../router.js";

const TABS = [
  { id: "all", label: "Все" },
  { id: "image", label: "Фото" },
  { id: "video", label: "Видео" },
  { id: "audio", label: "Музыка" },
  { id: "doc", label: "Файлы" },
];
const ICON = { image: "Image", video: "Video", audio: "Volume", pdf: "File", text: "File", file: "File" };

function size(bytes) {
  if (!bytes) return "";
  const u = ["Б", "КБ", "МБ", "ГБ"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i ? 1 : 0).replace(".", ",")} ${u[i]}`;
}
function when(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

// Встроенный просмотр: фото и видео — общим просмотрщиком, PDF, текст и музыка —
// в окне поверх приложения; остальное — скачать снова.
export function openDownloadViewer(d, all = []) {
  if (d.kind === "image" || d.kind === "video") {
    const media = all.filter((x) => x.kind === "image" || x.kind === "video");
    return openMediaViewer({
      kind: d.kind,
      url: d.url,
      name: d.name,
      gallery: media.map((x) => ({ kind: x.kind, url: x.url, name: x.name, originalUrl: x.url, caption: x.name })),
      index: Math.max(0, media.findIndex((x) => x.url === d.url)),
    });
  }
  const overlay = el("div", { class: "modal-overlay dl-viewer-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "dl-viewer-body" });
  const close = () => {
    document.removeEventListener("keydown", onKey, true);
    overlay.remove();
  };
  const onKey = (e) => e.key === "Escape" && (e.stopPropagation(), close());
  if (d.kind === "pdf") body.append(el("iframe", { class: "dl-viewer-frame", src: d.url, title: d.name }));
  else if (d.kind === "audio") body.append(el("div", { class: "dl-viewer-audio" }, [el("span", { html: iconSvg("Volume", 48) }), el("audio", { src: d.url, controls: true, autoplay: true })]));
  else if (d.kind === "text") {
    const pre = el("pre", { class: "dl-viewer-text" }, "Загрузка…");
    body.append(pre);
    fetch(d.url, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => (pre.textContent = t.length > 500_000 ? t.slice(0, 500_000) + "\n…" : t))
      .catch(() => (pre.textContent = "Не удалось открыть файл"));
  } else {
    body.append(
      el("div", { class: "dl-viewer-audio" }, [
        el("span", { html: iconSvg("File", 48) }),
        el("p", {}, "Этот формат открывается только во внешней программе"),
      ])
    );
  }
  overlay.append(
    el("div", { class: "modal-dialog dl-viewer" }, [
      el("div", { class: "dl-viewer-head" }, [
        el("span", { class: "dl-viewer-title" }, d.name),
        el("a", { class: "icon-btn", href: d.url, download: d.name, title: "Скачать", html: iconSvg("Download", 20) }),
        el("button", { class: "icon-btn", title: "Закрыть", html: iconSvg("X", 20), onclick: close }),
      ]),
      body,
    ])
  );
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(overlay);
}

export function openDownloadsDialog() {
  let tab = "all";
  let query = "";
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const listEl = el("div", { class: "dl-list" });
  const tabsEl = el("div", { class: "dl-tabs" });
  const close = () => {
    window.removeEventListener("shalter:downloads-changed", render);
    overlay.remove();
  };

  function match(d) {
    if (query && !d.name.toLowerCase().includes(query)) return false;
    if (tab === "all") return true;
    if (tab === "doc") return d.kind === "pdf" || d.kind === "text" || d.kind === "file";
    return d.kind === tab;
  }

  function render() {
    clear(tabsEl);
    for (const t of TABS) tabsEl.append(el("button", { class: `dl-tab${tab === t.id ? " active" : ""}`, onclick: () => ((tab = t.id), render()) }, t.label));
    const all = listDownloads();
    const items = all.filter(match);
    clear(listEl);
    if (!items.length) {
      listEl.append(
        el("div", { class: "dl-empty" }, [
          el("span", { html: iconSvg("Download", 40) }),
          el("p", {}, all.length ? "Ничего не найдено" : "Здесь появятся файлы, фото и видео, которые вы скачаете из чатов"),
        ])
      );
      return;
    }
    for (const d of items) {
      listEl.append(
        el("div", { class: "dl-row" }, [
          el("button", { class: "dl-row-main", onclick: () => openDownloadViewer(d, items) }, [
            d.kind === "image"
              ? el("span", { class: "dl-thumb", style: `background-image:url("${d.url}")` })
              : el("span", { class: `dl-icon dl-${d.kind}`, html: iconSvg(ICON[d.kind] ?? "File", 20) }),
            el("span", { class: "dl-info" }, [
              el("span", { class: "dl-name" }, d.name),
              el("span", { class: "dl-meta" }, [size(d.size), when(d.at)].filter(Boolean).join(" · ")),
            ]),
          ]),
          d.chatPath?.startsWith("/chat/")
            ? el("button", { class: "icon-btn", title: "Показать в чате", html: iconSvg("MessageCircle", 18), onclick: () => (close(), navigate(d.chatPath)) })
            : null,
          el("button", { class: "icon-btn", title: "Убрать из списка", html: iconSvg("Trash", 18), onclick: () => removeDownload(d.url) }),
        ])
      );
    }
  }

  overlay.append(
    el("div", { class: "modal-dialog dl-dialog" }, [
      el("div", { class: "dl-head" }, [
        el("h2", { class: "modal-title" }, "Загрузки"),
        el("button", {
          class: "icon-btn",
          title: "Очистить список",
          html: iconSvg("Trash", 18),
          onclick: async () => (await askConfirm("Очистить список загрузок? Файлы в чатах останутся.", { okLabel: "Очистить", danger: true })) && clearDownloads(),
        }),
        el("button", { class: "icon-btn", title: "Закрыть", html: iconSvg("X", 20), onclick: close }),
      ]),
      el("input", { class: "settings-input dl-search", placeholder: "Поиск по названию", oninput: (e) => ((query = e.target.value.trim().toLowerCase()), render()) }),
      tabsEl,
      listEl,
    ])
  );
  window.addEventListener("shalter:downloads-changed", render);
  render();
  document.body.appendChild(overlay);
}
