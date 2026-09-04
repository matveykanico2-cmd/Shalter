import { el, appendAll } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// Полноэкранный просмотр фото и видео из переписки — и единственное место,
// где запрашивается вложение в полном качестве: до открытия в чате видна
// только миниатюра (attachments.js), а этот файл сервер отдаёт лишь тому,
// кто действительно нажал «посмотреть». Раньше полное изображение начинало
// качаться само, стоило сообщению появиться на экране, — и так для каждой
// фотографии в истории чата, даже если её никто не открывал.
export function openMediaViewer({ kind, url, name }) {
  const overlay = el("div", { class: "media-viewer-overlay", onclick: (e) => e.target === overlay && close() });

  const media =
    kind === "video"
      ? el("video", { class: "media-viewer-media", src: url, controls: true, autoplay: true, playsInline: true })
      : el("img", { class: "media-viewer-media", src: url, alt: name || "" });

  appendAll(
    overlay,
    el("div", { class: "media-viewer" }, [
      el("div", { class: "media-viewer-head" }, [
        el("span", { class: "media-viewer-spacer" }),
        // download, а не переход по ссылке: файл сохраняется рядом, вкладка
        // с чатом никуда не девается.
        el("a", { class: "icon-btn", title: "Скачать", href: url, download: name || "file", html: iconSvg("Download", 20) }),
        el("button", { class: "icon-btn", title: "Закрыть", html: iconSvg("X", 20), onclick: () => close() }),
      ]),
      el("div", { class: "media-viewer-stage" }, [media]),
    ])
  );
  document.body.appendChild(overlay);

  function close() {
    document.removeEventListener("keydown", onKey);
    if (kind === "video") media.pause();
    overlay.remove();
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey);

  return close;
}
