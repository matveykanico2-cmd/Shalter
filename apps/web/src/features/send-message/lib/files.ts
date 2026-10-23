// Что за файл и сколько можно — public/js/lib/mediaKind.js, uploadLimits.js, chatAction.js.
import type { UploadKind } from "@/shared/api";

const MB = 1024 * 1024;
const GB = 1024 * MB;
const LIMIT = 5 * GB;

/** Фото и видео — медиа (превью, плеер), остальное, включая аудио, — файл с плеером. */
export function fileKind(file: Pick<File, "type">): UploadKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

const KIND_LABEL: Record<UploadKind, string> = { video: "Видео", image: "Фото", file: "Файл", voice: "Голосовое сообщение", "video-note": "Видео-кружок" };

function sizeLabel(bytes: number) {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} ГБ`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

/** null — размер в порядке, иначе текст ошибки. */
export function checkSize(file: Pick<File, "size">, kind: UploadKind) {
  if (file.size <= LIMIT) return null;
  return `${KIND_LABEL[kind]} слишком большой: ${sizeLabel(file.size)} из максимальных 5 ГБ`;
}

export { sizeLabel as fileSizeLabel };

/** «Отправляет фото / видео / файл» в шапке у собеседника, пока идёт загрузка. */
export function uploadActionFor(kinds: readonly UploadKind[]) {
  if (kinds.includes("video")) return "upload_video";
  if (kinds.length && kinds.every((k) => k === "image")) return "upload_photo";
  return "upload_document";
}

/** В одном сообщении — не больше 10 вложений (server/lib/sanitizeAttachments.js). */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export function chunks<T>(list: readonly T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
