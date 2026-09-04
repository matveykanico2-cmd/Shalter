import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { openInAppBrowser } from "./inAppBrowser.js";
import { openMediaViewer } from "./mediaViewer.js";

// Attachment/link-preview renderers shared between the chat's MessageBubble
// and the profile dialog's Media/Files/Links tabs — kept in their own module
// (rather than exported from messageBubble.js) so the profile dialog doesn't
// have to import from a file that itself imports openProfileDialog, which
// would make the two modules circularly dependent on each other.
export function ImageAttachment(a) {
  // В чате видна только миниатюра — килобайты, рисуется мгновенно, переписка
  // листается без серых дыр на месте фотографий. Полное качество не
  // подгружается само: оно запрашивается только при открытии просмотрщика
  // (mediaViewer.js) по нажатию. Раньше полная картинка начинала качаться
  // молча, стоило сообщению появиться на экране, — для каждой фотографии в
  // истории чата, даже нераскрытой, и это и был расход трафика и места на
  // устройстве, о котором просили не делать.
  //
  // Если полной уже нет на сервере (её убрали как доставленную, см.
  // server/lib/orphanSweep.js), просмотрщик покажет то, что успеет
  // загрузиться, — а до открытия чат всё равно выглядит целым по эскизу.
  const img = el("img", { src: a.thumbUrl || a.url, alt: a.name || "photo", class: "image-attachment" });
  return el("button", { class: "image-attachment-btn", type: "button", onclick: () => openMediaViewer({ kind: "image", url: a.url, name: a.name }) }, [img]);
}

export function VideoAttachment(a) {
  // Тот же принцип, что и у фото: ничего не качается, пока не нажали. Кадр
  // видео — не миниатюра (её для видео не готовят, только для фото), поэтому
  // тут просто чёрный экран с кнопкой воспроизведения до открытия.
  return el(
    "button",
    { class: "video-attachment-btn", type: "button", onclick: () => openMediaViewer({ kind: "video", url: a.url, name: a.name }) },
    [
      a.thumbUrl ? el("img", { src: a.thumbUrl, alt: "", class: "video-attachment-poster" }) : el("div", { class: "video-attachment-poster" }),
      el("span", { class: "video-attachment-play", html: iconSvg("Video", 28) }),
    ]
  );
}

export function FileAttachment(a) {
  return el("a", { href: a.url, download: a.name || "file", class: "file-attachment" }, [
    el("span", { html: iconSvg("Download", 18) }),
    el("div", { class: "file-attachment-info" }, [
      el("p", { class: "file-attachment-name" }, a.name || "Файл"),
      el("p", { class: "mono file-attachment-size" }, a.size ? `${(a.size / 1024).toFixed(0)} КБ` : ""),
    ]),
  ]);
}

// Rendered from message.linkPreview (server/lib/linkPreview.js, fetched
// server-side after send — see routes/messages.js). Opens via the in-app
// browser rather than a new tab, same as inline links in formatText.js.
export function LinkPreviewCard(p) {
  if (!p.title && !p.description && !p.image && !p.warning) return null;
  return el(
    "button",
    { class: "link-preview-card", onclick: () => openInAppBrowser(p.url, { unsafe: p.unsafe, warning: p.warning }) },
    [
      p.image ? el("img", { class: "link-preview-image", src: p.image, alt: "" }) : null,
      el("div", { class: "link-preview-body" }, [
        p.warning ? el("p", { class: `link-preview-warning ${p.unsafe ? "danger" : ""}` }, [el("span", { html: iconSvg("Info", 12) }), " ", p.warning]) : null,
        p.siteName ? el("p", { class: "link-preview-site" }, p.siteName) : null,
        p.title ? el("p", { class: "link-preview-title" }, p.title) : null,
        p.description ? el("p", { class: "link-preview-desc" }, p.description) : null,
      ]),
    ]
  );
}

export function LocationAttachment(a) {
  const { lat, lng } = a.meta ?? {};
  const mapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  return el("a", { href: mapUrl, target: "_blank", rel: "noreferrer", class: "location-attachment" }, [
    el("span", { html: iconSvg("MapPin", 18) }),
    el("div", {}, [
      el("p", {}, "Геолокация"),
      el("p", { class: "mono location-coords" }, `${lat?.toFixed(5)}, ${lng?.toFixed(5)}`),
    ]),
  ]);
}
