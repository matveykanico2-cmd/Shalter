import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { openInstantView } from "./instantView.js";
import { openInAppBrowser } from "./inAppBrowser.js";
import { openMediaViewer, galleryAround } from "./mediaViewer.js";
import { setNowPlaying, playingMediaFor } from "../lib/audioPlayer.js";

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

export function ImageAttachment(a) {
  const img = el("img", { loading: "lazy", decoding: "async", src: a.thumbUrl || a.url, alt: a.name || "photo", class: "image-attachment" });
  return MediaButton("image-attachment-btn", { kind: "image", url: a.url, name: a.name, thumbUrl: a.thumbUrl || a.url }, [img]);
}

const VIDEO_MAX_H = 420;

export function VideoAttachment(a) {
  // posterUrl is a real image; a blob: thumbUrl is the sender's local copy of the video
  // itself (set while the server preview is pending), so it can't go in an <img>.
  const localVideo = a.thumbUrl?.startsWith("blob:") ? a.thumbUrl : null;
  const poster = a.posterUrl || (localVideo ? null : a.thumbUrl);
  const frameSrc = localVideo || a.url;
  const cover = poster
    ? el("img", { loading: "lazy", decoding: "async", src: poster, alt: "", class: "video-attachment-poster" })
    : el("video", { class: "video-attachment-poster", src: frameSrc.includes("#") ? frameSrc : `${frameSrc}#t=0.1`, preload: "metadata", muted: true, playsinline: true });
  const btn = MediaButton(
    "video-attachment-btn",
    a.previewPending ? { kind: "video", url: frameSrc, name: a.name } : { kind: "video", url: a.previewUrl || a.url, name: a.name, originalUrl: a.previewUrl ? a.url : null },
    [cover, a.previewPending ? el("span", { class: "attachment-pending-spinner" }) : el("span", { class: "video-attachment-play", html: iconSvg("Play", 28) })]
  );
  // Size the bubble to the video's real shape instead of a fixed 16:10 strip.
  // Portrait clips get a narrower box so they keep their shape under the height cap.
  const setRatio = (w, h) => {
    if (!(w > 0 && h > 0)) return;
    btn.style.aspectRatio = `${w} / ${h}`;
    if (h > w) btn.style.setProperty("--video-w", `${Math.round((VIDEO_MAX_H * w) / h)}px`);
  };
  if (a.width && a.height) setRatio(a.width, a.height);
  else if (cover.tagName === "VIDEO") cover.addEventListener("loadedmetadata", () => setRatio(cover.videoWidth, cover.videoHeight), { once: true });
  else cover.addEventListener("load", () => setRatio(cover.naturalWidth, cover.naturalHeight), { once: true });
  return btn;
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

const AUDIO_EXT_RE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/i;

// Цвет плитки файла по расширению — как в Telegram: PDF красный, таблицы
// зелёные, архивы оранжевые, документы синие.
const FILE_COLORS = [
  [/^(pdf)$/, "#e65050"],
  [/^(xls|xlsx|csv|ods|numbers)$/, "#4caf50"],
  [/^(zip|rar|7z|tar|gz|bz2|xz|apk|ipa|dmg|exe|msi)$/, "#f39a2b"],
  [/^(doc|docx|odt|rtf|txt|md|pages)$/, "#3f8fe8"],
  [/^(ppt|pptx|key|odp)$/, "#ef7b3c"],
  [/^(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/, "#9b62e0"],
];

function fileExt(name) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name ?? "");
  return m ? m[1].toLowerCase() : "";
}

function clockTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function FileAttachment(a, ctx = {}) {
  const isAudio = a.mimeType?.startsWith("audio/") || AUDIO_EXT_RE.test(a.name ?? "");
  if (!isAudio || !a.url) return FileLink(a);
  return AudioFile(a, ctx);
}

function FileLink(a) {
  const ext = fileExt(a.name);
  const color = FILE_COLORS.find(([re]) => re.test(ext))?.[1];
  return el("a", { href: a.url, download: a.name || "file", class: "file-attachment" }, [
    el("span", { class: "file-attachment-icon", style: color ? `--file-color:${color}` : "" }, [
      el("span", { class: "file-attachment-ext" }, ext.slice(0, 4) || "file"),
      el("span", { class: "file-attachment-dl", html: iconSvg("Download", 22) }),
    ]),
    el("div", { class: "file-attachment-info" }, [
      el("p", { class: "file-attachment-name" }, a.name || "Файл"),
      el("p", { class: "mono file-attachment-size" }, a.size ? formatSize(a.size) : ""),
    ]),
  ]);
}

// Музыка в сообщении: круглая кнопка, название и полоска перемотки. Играет
// через общий плеер — полоска «сейчас играет» появляется под шапкой чата.
function AudioFile(a, ctx) {
  const key = ctx.message ? `${ctx.message.id}:${a.url}` : `file:${a.url}`;
  const audio = playingMediaFor(key) ?? el("audio", { src: a.url, preload: "none", class: "hidden-audio" });
  const title = (a.name || "Аудио").replace(AUDIO_EXT_RE, "");
  const playBtn = el("button", { class: "audio-file-play", type: "button", "aria-label": "Слушать" });
  const sub = el("span", { class: "audio-file-sub mono" }, a.size ? formatSize(a.size) : "");
  const fill = el("span", { class: "audio-file-fill" });
  const track = el("span", { class: "audio-file-track" }, fill);
  const dl = el("a", { class: "icon-btn audio-file-dl", href: a.url, download: a.name || "audio", title: "Скачать", html: iconSvg("Download", 18) });

  const paint = () => {
    const playing = !audio.paused;
    playBtn.innerHTML = iconSvg(playing ? "PauseFill" : "PlayFill", 22);
    playBtn.classList.toggle("playing", playing);
    const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
    const started = audio.currentTime > 0 || playing;
    track.classList.toggle("visible", started);
    fill.style.transform = `scaleX(${dur ? Math.min(1, audio.currentTime / dur) : 0})`;
    sub.textContent = started && dur ? `${clockTime(audio.currentTime)} / ${clockTime(dur)}` : a.size ? formatSize(a.size) : dur ? clockTime(dur) : "";
  };
  playBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });
  audio.addEventListener("play", () => {
    setNowPlaying(audio, {
      key,
      kind: "audio",
      title,
      subtitle: ctx.sender?.name ?? "Музыка",
      chatId: ctx.message?.chatId,
      messageId: ctx.message?.id,
    });
    paint();
  });
  for (const ev of ["pause", "ended", "timeupdate", "loadedmetadata"]) audio.addEventListener(ev, paint);
  track.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    const r = track.getBoundingClientRect();
    if (Number.isFinite(audio.duration) && r.width) audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
  });
  paint();
  return el("div", { class: "audio-file" }, [
    audio,
    playBtn,
    el("div", { class: "audio-file-info" }, [el("p", { class: "audio-file-title" }, title), sub, track]),
    dl,
  ]);
}

export function LinkPreviewCard(p) {
  if (!p.title && !p.description && !p.image && !p.warning) return null;
  const card = el(
    "button",
    { class: "link-preview-card", onclick: () => openInAppBrowser(p.url, { unsafe: p.unsafe, warning: p.warning }) },
    [
      p.image ? el("img", { loading: "lazy", decoding: "async", class: "link-preview-image", src: p.image, alt: "" }) : null,
      el("div", { class: "link-preview-body" }, [
        p.warning ? el("p", { class: `link-preview-warning ${p.unsafe ? "danger" : ""}` }, [el("span", { html: iconSvg("Info", 12) }), " ", p.warning]) : null,
        p.siteName ? el("p", { class: "link-preview-site" }, p.siteName) : null,
        p.title ? el("p", { class: "link-preview-title" }, p.title) : null,
        p.description ? el("p", { class: "link-preview-desc" }, p.description) : null,
      ]),
    ]
  );
  // Instant View — для статей (есть описание или заголовок), не для голых ссылок.
  if (!p.title || !p.description || p.unsafe) return card;
  return el("div", { class: "link-preview-wrap" }, [
    card,
    el(
      "button",
      { class: "link-preview-iv", onclick: (e) => (e.stopPropagation(), openInstantView(p.url, { unsafe: p.unsafe, warning: p.warning })) },
      "⚡ Instant View"
    ),
  ]);
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
