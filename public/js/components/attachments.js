import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { openInAppBrowser } from "./inAppBrowser.js";
import { openMediaViewer, galleryAround } from "./mediaViewer.js";

function MediaButton(className, item, children) {
  return el(
    "button",
    {
      class: className,
      type: "button",
      "data-media-kind": item.kind,
      "data-media-url": item.url,
      "data-media-name": item.name || "",
      "data-media-original": item.originalUrl || "",
      "data-media-thumb": item.thumbUrl || "",
      onclick: (e) => openMediaViewer({ ...item, ...galleryAround(e.currentTarget) }),
    },
    children
  );
}

function PendingPreview(poster) {
  return el("div", { class: "attachment-pending" }, [
    poster ? el("img", { src: poster, alt: "", class: "video-attachment-poster" }) : el("div", { class: "video-attachment-poster" }),
    el("span", { class: "attachment-pending-spinner" }),
  ]);
}

export function ImageAttachment(a) {
  const img = el("img", { src: a.thumbUrl || a.url, alt: a.name || "photo", class: "image-attachment", loading: "lazy" });
  return MediaButton("image-attachment-btn", { kind: "image", url: a.url, name: a.name, thumbUrl: a.thumbUrl || a.url }, [img]);
}

export function VideoAttachment(a) {
  const poster = a.posterUrl || a.thumbUrl;
  if (a.previewPending && !poster) {
    return MediaButton("video-attachment-btn", { kind: "video", url: a.url, name: a.name }, [
      el("video", { class: "video-attachment-poster", src: a.url.includes("#") ? a.url : `${a.url}#t=0.1`, preload: "metadata", muted: true, playsinline: true }),
      el("span", { class: "video-attachment-play", html: iconSvg("Play", 28) }),
    ]);
  }
  if (a.previewPending) return PendingPreview(poster);
  return MediaButton("video-attachment-btn", { kind: "video", url: a.previewUrl || a.url, name: a.name, originalUrl: a.previewUrl ? a.url : null }, [
    poster ? el("img", { src: poster, alt: "", class: "video-attachment-poster" }) : el("div", { class: "video-attachment-poster" }),
    el("span", { class: "video-attachment-play", html: iconSvg("Play", 28) }),
  ]);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = value < 10 && unit > 0 ? 1 : 0;
  return `${value.toFixed(digits).replace(".", ",")} ${units[unit]}`;
}

export function FileAttachment(a) {
  return el("a", { href: a.url, download: a.name || "file", class: "file-attachment" }, [
    el("span", { html: iconSvg("Download", 18) }),
    el("div", { class: "file-attachment-info" }, [
      el("p", { class: "file-attachment-name" }, a.name || "Файл"),
      el("p", { class: "mono file-attachment-size" }, a.size ? formatSize(a.size) : ""),
    ]),
  ]);
}

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
  const { lat, lng, live, expiresAt } = a.meta ?? {};
  const mapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  const isLive = live && expiresAt && expiresAt > new Date().toISOString();
  const label = isLive
    ? `Живая геолокация — обновляется до ${new Date(expiresAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
    : live
      ? "Геолокация (трансляция окончена)"
      : "Геолокация";
  return el("a", { href: mapUrl, target: "_blank", rel: "noreferrer", class: `location-attachment ${isLive ? "live" : ""}` }, [
    el("span", { html: iconSvg("MapPin", 18) }),
    el("div", {}, [
      el("p", {}, label),
      el("p", { class: "mono location-coords" }, `${lat?.toFixed(5)}, ${lng?.toFixed(5)}`),
    ]),
  ]);
}
