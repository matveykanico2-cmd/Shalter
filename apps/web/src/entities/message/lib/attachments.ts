// Подписи и раскладка вложений — как public/js/components/attachments.js и messageBubble.js.
import type { Attachment, LinkPreview, MediaItem } from "../model/attachment";
import type { Message } from "../model/types";

export const attachmentsOf = (m: Pick<Message, "attachments">) => (m.attachments ?? []) as Attachment[];

export const linkPreviewOf = (m: Pick<Message, "linkPreview">) => {
  const p = m.linkPreview as LinkPreview | undefined;
  return p && (p.title || p.description || p.image || p.warning) ? p : null;
};

export const isVisualMedia = (a: Attachment) => (a.kind === "image" || a.kind === "video") && !!a.url;

/** «1,4 МБ» */
export function formatSize(bytes: number) {
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

/** «1:05» */
export function clockTime(sec: number) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function fileExt(name?: string) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name ?? "");
  return m ? m[1]!.toLowerCase() : "";
}

export const AUDIO_EXT_RE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/i;

export const isAudioFile = (a: Attachment) => !!a.url && (!!a.mimeType?.startsWith("audio/") || AUDIO_EXT_RE.test(a.name ?? ""));

// Цвет плитки файла по расширению — как в Telegram.
const FILE_COLORS: [RegExp, string][] = [
  [/^(pdf)$/, "#e65050"],
  [/^(xls|xlsx|csv|ods|numbers)$/, "#4caf50"],
  [/^(zip|rar|7z|tar|gz|bz2|xz|apk|ipa|dmg|exe|msi)$/, "#f39a2b"],
  [/^(doc|docx|odt|rtf|txt|md|pages)$/, "#3f8fe8"],
  [/^(ppt|pptx|key|odp)$/, "#ef7b3c"],
  [/^(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/, "#9b62e0"],
];
export const fileColor = (ext: string) => FILE_COLORS.find(([re]) => re.test(ext))?.[1];

const MAX_LEVEL = 31;
/** Уровни осциллограммы (0..31) — в bars столбиков 0..1 (public/js/lib/waveform.js). */
export function resampleWaveform(wave: readonly number[], bars: number) {
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i * wave.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * wave.length) / bars));
    let sum = 0;
    for (let j = from; j < to; j++) sum += wave[j] ?? 0;
    out.push(sum / (to - from) / MAX_LEVEL);
  }
  return out;
}

/** Фото/видео без подписи и карточки ссылки: время лежит поверх медиа (как в tweb). */
export function isMediaOnly(m: Message) {
  const atts = attachmentsOf(m);
  return atts.length > 0 && atts.every(isVisualMedia) && !m.text?.trim() && !linkPreviewOf(m) && !m.paidStars && m.type !== "sticker";
}

/** Видео в ленте и в просмотре: сжатая копия, если есть, а оригинал — запасной и «скачать». */
export function mediaItem(a: Attachment, m: Pick<Message, "id">): Omit<MediaItem, "author" | "time" | "caption"> {
  if (a.kind === "video") {
    const localVideo = a.thumbUrl?.startsWith("blob:") ? a.thumbUrl : undefined;
    const poster = a.posterUrl || (localVideo ? undefined : a.thumbUrl);
    if (a.previewPending) return { kind: "video", url: localVideo ?? a.url!, name: a.name, thumbUrl: poster, messageId: m.id };
    return {
      kind: "video",
      url: a.previewUrl || a.url!,
      name: a.name,
      thumbUrl: poster,
      originalUrl: a.previewUrl ? a.url : undefined,
      fallbackUrl: a.previewUrl ? a.url : undefined,
      messageId: m.id,
    };
  }
  return { kind: "image", url: a.url!, name: a.name, thumbUrl: a.thumbUrl || a.url, messageId: m.id };
}

const IMAGE_MAX_W = 280;
const IMAGE_MAX_H = 320;
/** Размер фото в ленте по его пропорциям: не шире 280 и не выше 320 (.image-attachment). */
export function imageBox(a: Pick<Attachment, "width" | "height">) {
  if (!(a.width && a.height && a.width > 0 && a.height > 0)) return null;
  const width = Math.round(Math.min(IMAGE_MAX_W, a.width, (a.width * IMAGE_MAX_H) / a.height));
  return { width, height: Math.round((width * a.height) / a.width) };
}
