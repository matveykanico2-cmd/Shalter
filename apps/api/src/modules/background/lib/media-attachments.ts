// Какие вложения ждут фоновой обработки — то же, что server/lib/mediaJobs.js:
// превью фото и видео, длительность голосовых и кружков, перекодирование видео истории.
// media-attachments.spec.ts сверяет со старым модулем.
import type { Attachment } from "../../../legacy/legacy.js";
import { UPLOAD_FILENAME_RE } from "../../uploads/lib/upload-name.js";

const PREVIEWABLE_KINDS = new Set(["image", "video"]);

/** Имя файла из /uploads/<имя>; null — не наша загрузка. */
export function uploadFilename(url: unknown): string | null {
  if (typeof url !== "string" || !url.startsWith("/uploads/")) return null;
  const filename = url.slice("/uploads/".length);
  return UPLOAD_FILENAME_RE.test(filename) ? filename : null;
}

export function needsPreview(attachment: Attachment | null | undefined): boolean {
  if (!PREVIEWABLE_KINDS.has(attachment?.kind as string) || !uploadFilename(attachment!.url)) return false;
  return attachment!.kind === "video" ? !attachment!.previewUrl : !attachment!.thumbUrl;
}

/**
 * Голосовое или кружок, записанные браузером в WebM: без индекса и длительности они не
 * перематываются. Им делается копия для проигрывания (previewUrl: голосовое — M4A, кружок —
 * MP4 H.264). Пометки previewPending нет — оригинал играет, пока копия не готова.
 */
export function needsPlayback(a: Attachment | null | undefined): boolean {
  if ((a?.kind !== "voice" && a?.kind !== "video-note") || a.previewUrl) return false;
  const filename = uploadFilename(a.url);
  return !!filename && /\.(webm|weba|mkv)$/i.test(filename);
}

/** Голосовое, кружок или аудиофайл — у них считается длительность. */
export function isTimed(a: Attachment | null | undefined): boolean {
  return a?.kind === "voice" || a?.kind === "video-note" || (a?.kind === "file" && /^audio\//.test((a.mimeType as string | undefined) ?? ""));
}

/** Вложения, которым будет превью, помечаются previewPending — клиент показывает заглушку. */
export function markPendingPreviews(attachments: Attachment[] | undefined): Attachment[] | undefined {
  return attachments?.map((a) => (needsPreview(a) ? { ...a, previewPending: true } : a));
}

/** Есть ли у сообщения работа для фона — чтобы не ставить задачу на каждое сообщение. */
export function messageNeedsMedia(message: { attachments?: Attachment[] }): boolean {
  return (message.attachments ?? []).some(
    (a) => needsPreview(a) || needsPlayback(a) || (isTimed(a) && !((a.durationSec as number) > 0) && uploadFilename(a.url))
  );
}

export function storyNeedsMedia(story: { items: { kind: string; url: unknown; previewUrl?: unknown }[] }): boolean {
  return story.items.some((item) => item.kind === "video" && !item.previewUrl && String(item.url).startsWith("/uploads/"));
}
