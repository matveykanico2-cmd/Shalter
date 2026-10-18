import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { openInstantView } from "./instantView.js";
import { openInAppBrowser } from "./inAppBrowser.js";
import { openMediaViewer, galleryAround } from "./mediaViewer.js";
import { setNowPlaying, playingMediaFor } from "../lib/audioPlayer.js";

const DOUBLE_TAP_MS = 200;

function MediaButton(className, item, children, { spoiler = false, onDoubleClick } = {}) {
  // Спойлер: первое нажатие снимает размытие, следующее — открывает просмотр.
  // Двойной клик на медиа — реакция вместо просмотра (как в tweb).
  let lastClickTime = 0;
  let pendingOpen = null;
  const btn = el(
    "button",
    {
      class: spoiler ? `${className} has-spoiler` : className,
      type: "button",
      "data-media-kind": item.kind,
      "data-media-url": item.url,
      "data-media-name": item.name || "",
      "data-media-original": item.originalUrl || "",
      "data-media-thumb": item.thumbUrl || "",
      "data-media-fallback": item.fallbackUrl || "",
      onclick: (e) => {
        if (btn.classList.contains("has-spoiler")) {
          e.stopPropagation();
          btn.classList.remove("has-spoiler");
          btn.classList.add("spoiler-revealed");
          return;
        }
        const now = Date.now();
        if (onDoubleClick && now - lastClickTime < DOUBLE_TAP_MS) {
          if (pendingOpen) { clearTimeout(pendingOpen); pendingOpen = null; }
          lastClickTime = 0;
          onDoubleClick(e);
          return;
        }
        lastClickTime = now;
        if (onDoubleClick) {
          pendingOpen = setTimeout(() => {
            pendingOpen = null;
            openMediaViewer({ ...item, ...galleryAround(e.currentTarget) });
          }, DOUBLE_TAP_MS);
        } else {
          openMediaViewer({ ...item, ...galleryAround(e.currentTarget) });
        }
      },
    },
    spoiler ? [...children, el("span", { class: "media-spoiler", "aria-hidden": "true" }, el("span", { class: "media-spoiler-label" }, "Нажмите, чтобы открыть"))] : children
  );
  return btn;
}

// Картинка с запасными адресами: пока грузится — переливающаяся заглушка, при
// ошибке пробуем следующий адрес, а если не отдался ни один (плохая сеть) —
// вместо битой иконки плашка «Повторить»; при возвращении сети — сама.
function resilientImage(img, holder, sources) {
  const list = [...new Set(sources.filter(Boolean))];
  let i = 0;
  let failBox = null;
  let shimmerTimer = null;
  let settled = false;
  const onLoaded = () => {
    if (shimmerTimer) { clearTimeout(shimmerTimer); shimmerTimer = null; }
    clearTimeout(safetyTimer);
    img.classList.remove("media-loading");
    settled = true;
  };
  // Заглушку показываем, только если картинка грузится дольше мгновения: уже
  // загруженная (из кэша) иначе мигала при каждой перерисовке ленты — чат «дёргался».
  shimmerTimer = setTimeout(() => !img.complete && !settled && img.classList.add("media-loading"), 150);
  img.addEventListener("load", onLoaded);
  img.addEventListener("load", () => {
    if (!(img.width && img.height) && img.naturalWidth && img.naturalHeight) {
      img.width = img.naturalWidth;
      img.height = img.naturalHeight;
    }
  });
  // Если load не сработал (кешированное изображение с loading="lazy"), убираем спиннер по таймауту.
  const safetyTimer = setTimeout(() => { if (!settled) { settled = true; onLoaded(); } }, 5000);
  const retry = (e) => {
    e?.stopPropagation();
    e?.preventDefault();
    window.removeEventListener("online", retry);
    i = 0;
    failBox?.remove();
    failBox = null;
    img.hidden = false;
    img.classList.add("media-loading");
    const u = list[0];
    img.src = u + (u.includes("?") ? "&" : "?") + "r=" + Date.now().toString(36);
  };
  img.addEventListener("error", () => {
    if (++i < list.length) {
      img.src = list[i];
      return;
    }
    if (failBox) return;
    img.hidden = true;
    failBox = el("span", { class: "media-failed-box", role: "button", onclick: retry }, [
      el("span", { class: "media-failed-icon", html: iconSvg("RotateCw", 22) }),
      el("span", {}, navigator.onLine === false ? "Нет сети" : "Не загрузилось"),
      el("span", { class: "media-failed-hint" }, "Нажмите, чтобы повторить"),
    ]);
    holder.appendChild(failBox);
    window.addEventListener("online", retry, { once: true });
  });
  img.src = list[0] ?? "";
}

export function ImageAttachment(a, opts = {}) {
  const img = el("img", { loading: "lazy", decoding: "async", alt: a.name || "photo", class: "image-attachment" });
  // Размеры заранее — лента не прыгает, пока фото грузится.
  if (a.width > 0 && a.height > 0) {
    img.width = a.width;
    img.height = a.height;
  }
  const btn = MediaButton("image-attachment-btn", { kind: "image", url: a.url, name: a.name, thumbUrl: a.thumbUrl || a.url }, [img], { spoiler: !!a.spoiler, onDoubleClick: opts.onDoubleClick });
  resilientImage(img, btn, [a.thumbUrl, a.url]);
  return btn;
}

const VIDEO_MAX_H = 420;

export function VideoAttachment(a, opts = {}) {
  // posterUrl is a real image; a blob: thumbUrl is the sender's local copy of the video
  // itself (set while the server preview is pending), so it can't go in an <img>.
  const localVideo = a.thumbUrl?.startsWith("blob:") ? a.thumbUrl : null;
  const poster = a.posterUrl || (localVideo ? null : a.thumbUrl);
  const frameSrc = localVideo || a.url;
  const frameVideo = () =>
    el("video", { class: "video-attachment-poster", src: frameSrc.includes("#") ? frameSrc : `${frameSrc}#t=0.1`, preload: "metadata", muted: true, playsinline: true });
  let cover = poster ? el("img", { loading: "lazy", decoding: "async", src: poster, alt: "", class: "video-attachment-poster" }) : frameVideo();
  const btn = MediaButton(
    "video-attachment-btn",
    a.previewPending
      ? { kind: "video", url: frameSrc, name: a.name, thumbUrl: poster }
      : { kind: "video", url: a.previewUrl || a.url, name: a.name, originalUrl: a.previewUrl ? a.url : null, thumbUrl: poster, fallbackUrl: a.previewUrl ? a.url : null },
    [cover, a.previewPending ? el("span", { class: "attachment-pending-spinner" }) : el("span", { class: "video-attachment-play", html: iconSvg("Play", 28) })],
    { spoiler: !!a.spoiler, onDoubleClick: opts.onDoubleClick }
  );
  // Size the bubble to the video's real shape instead of a fixed 16:10 strip.
  // Portrait clips get a narrower box so they keep their shape under the height cap.
  const setRatio = (w, h) => {
    if (!(w > 0 && h > 0)) return;
    btn.style.aspectRatio = `${w} / ${h}`;
    if (h > w) btn.style.setProperty("--video-w", `${Math.round((VIDEO_MAX_H * w) / h)}px`);
  };
  const watch = (node) => {
    const t = setTimeout(() => btn.classList.add("media-loading"), 150);
    const done = () => { clearTimeout(t); clearTimeout(safetyT); btn.classList.remove("media-loading"); };
    const safetyT = setTimeout(done, 5000);
    node.addEventListener("load", done, { once: true });
    node.addEventListener("loadeddata", done, { once: true });
    node.addEventListener("error", done, { once: true });
    if (node.tagName === "VIDEO") {
      node.addEventListener("loadeddata", () => btn.classList.remove("media-loading"), { once: true });
      node.addEventListener("loadedmetadata", () => {
        btn.classList.remove("media-loading");
        if (!(a.width && a.height)) setRatio(node.videoWidth, node.videoHeight);
      }, { once: true });
      // Кадр не достался (сеть, кодек) — тёмная плашка с кнопкой Play, без битой иконки.
      node.addEventListener("error", () => btn.classList.remove("media-loading"), { once: true });
    } else {
      node.addEventListener("load", () => {
        btn.classList.remove("media-loading");
        if (!(a.width && a.height)) setRatio(node.naturalWidth, node.naturalHeight);
      }, { once: true });
      // Обложка не загрузилась — берём первый кадр самого ролика.
      node.addEventListener("error", () => {
        const v = frameVideo();
        node.replaceWith(v);
        cover = v;
        watch(v);
      }, { once: true });
    }
  };
  if (a.width && a.height) setRatio(a.width, a.height);
  watch(cover);
  if (a.durationSec > 0) btn.appendChild(el("span", { class: "video-attachment-duration mono" }, clockTime(a.durationSec)));
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
      el("p", { class: "mono file-attachment-size", "data-bytes": a.size || "" }, a.size ? formatSize(a.size) : ""),
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
    const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : a.durationSec || 0;
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
      durationSec: a.durationSec,
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

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function LinkPreviewCard(p) {
  if (!p.title && !p.description && !p.image && !p.video && !p.warning) return null;
  // Заставка ролика: maxresdefault есть не у всех видео, поэтому перебираем
  // варианты, пока не отдаст картинку.
  const img = p.image ? el("img", { loading: "lazy", decoding: "async", class: "link-preview-image", src: p.image, alt: "" }) : null;
  if (img && Array.isArray(p.images) && p.images.length > 1) {
    const rest = p.images.slice(1);
    img.addEventListener(
      "error",
      () => {
        const next = rest.shift();
        if (next) img.src = next;
        else img.remove();
      },
      { once: true }
    );
  }
  const media = p.image
    ? el("div", { class: `link-preview-media${p.video ? " video" : ""}` }, [
        img,
        p.video ? el("span", { class: "link-preview-play", html: iconSvg("PlayFill", 22) }) : null,
      ])
    : null;
  const card = el(
    "button",
    { class: "link-preview-card", onclick: () => openInAppBrowser(p.url, { unsafe: p.unsafe, warning: p.warning }) },
    [
      media,
      el("div", { class: "link-preview-body" }, [
        p.warning ? el("p", { class: `link-preview-warning ${p.unsafe ? "danger" : ""}` }, [el("span", { html: iconSvg("Info", 12) }), " ", p.warning]) : null,
        p.title ? el("p", { class: "link-preview-title" }, p.title) : null,
        p.description ? el("p", { class: "link-preview-desc" }, p.description) : null,
        // как во ВКонтакте: внизу — адрес сайта со значком ссылки
        el("p", { class: "link-preview-site" }, [el("span", { class: "link-preview-site-icon", html: iconSvg("Link", 12) }), p.siteName || hostOf(p.url)]),
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
      "⚡ Быстрый просмотр"
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
