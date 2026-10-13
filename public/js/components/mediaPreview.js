import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { messagePreview } from "../lib/messagePreview.js";

// Превью сообщения с медиа — как в Telegram: вместо надписей «📹 Видеосообщение»,
// «📷 Фото», «🎤 Голосовое» — сама миниатюра (круглая у кружка) и длительность.
// Для списка чатов, цитаты ответа и плашки «Ответ» над полем ввода.
function clock(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function thumbOf(a) {
  if (a.kind === "image") return a.thumbUrl || a.url || null;
  return a.posterUrl || (a.thumbUrl && !String(a.thumbUrl).startsWith("blob:") ? a.thumbUrl : null);
}

function mini(a, round) {
  const src = thumbOf(a);
  const cls = `mp-thumb${round ? " round" : ""}`;
  if (src) return el("img", { class: cls, src, alt: "", loading: "lazy", decoding: "async" });
  // у кружка/видео без обложки — первый кадр самого ролика
  if ((a.kind === "video" || a.kind === "video-note") && a.url) {
    return el("video", { class: cls, src: `${a.url}#t=0.1`, muted: true, playsInline: true, preload: "metadata" });
  }
  return null;
}

// Узлы превью (миниатюра + текст). text — уже обработанный текст сообщения.
export function mediaPreviewNodes(m, { prefix = "", clean = (t) => t } = {}) {
  const a = m?.attachments?.[0];
  const text = clean(String(m?.text ?? "").replace(/\[ce:\d+\]/g, "🎨").trim());
  const label = (t) => el("span", { class: "mp-text" }, `${prefix}${t}`);
  if (!a || m.type === "sticker" || m.type === "gift") return [label(clean(messagePreview(m)))];
  const count = m.attachments.filter((x) => x.kind === a.kind).length;
  if (a.kind === "video-note") {
    return [prefix ? label("") : null, mini(a, true), el("span", { class: "mp-text" }, [el("span", { class: "mp-dur" }, a.durationSec ? clock(a.durationSec) : "Кружок"), text ? ` ${text}` : ""])].filter(Boolean);
  }
  if (a.kind === "voice") {
    return [
      prefix ? label("") : null,
      el("span", { class: "mp-icon", html: iconSvg("Mic", 13) }),
      el("span", { class: "mp-text" }, [el("span", { class: "mp-dur" }, a.durationSec ? clock(a.durationSec) : "Голосовое"), text ? ` ${text}` : ""]),
    ].filter(Boolean);
  }
  if (a.kind === "image" || a.kind === "video") {
    const thumb = mini(a, false);
    const wrap = thumb ? el("span", { class: "mp-thumb-wrap" }, [thumb, a.kind === "video" ? el("span", { class: "mp-play", html: iconSvg("PlayFill", 8) }) : null]) : null;
    const fallback = a.kind === "image" ? (count > 1 ? `${count} фото` : "Фото") : a.durationSec ? clock(a.durationSec) : count > 1 ? `${count} видео` : "Видео";
    return [prefix ? label("") : null, wrap, label(text || fallback)].filter(Boolean);
  }
  return [label(clean(messagePreview(m)))];
}
