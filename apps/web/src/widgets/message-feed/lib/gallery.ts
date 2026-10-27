// Галерея просмотрщика — все фото и видео загруженной ленты по порядку, с автором,
// временем и подписью (как galleryAround и messageInfo в mediaViewer.js, но из данных,
// а не из DOM: лента виртуальная, на экране только часть пузырей).
import { type Attachment, attachmentsOf, type FeedMessage, isVisualMedia, type MediaItem, mediaItem, plainText, timeLabel } from "@/entities/message";

/**
 * Открытое содержимое платного поста (автору, админам и купившим — из GET …/paid), иначе
 * null: закрытый пост в галерею не попадает, нажатие на него открывает покупку.
 */
export type PaidContentOf = (m: FeedMessage) => readonly Attachment[] | null | undefined;

export function buildGallery(messages: readonly FeedMessage[], authorOf: (m: FeedMessage) => string | null, paidOf?: PaidContentOf): MediaItem[] {
  const items: MediaItem[] = [];
  for (const m of messages) {
    if (m.pending) continue;
    const caption = m.text?.trim() ? plainText(m.text) : undefined;
    const push = (a: Attachment) => {
      if (isVisualMedia(a)) items.push({ ...mediaItem(a, m), author: authorOf(m) ?? undefined, time: timeLabel(m.createdAt), caption });
    };
    for (const a of attachmentsOf(m)) {
      // Платный пост стоит в ленте там, где его заглушка, — и в галерее там же.
      if (a.kind === "paid") (paidOf?.(m) ?? []).forEach(push);
      else push(a);
    }
  }
  return items;
}

/** Где в галерее медиа, на которое нажали (url — как в ленте, оригинал у видео — тоже). */
export const galleryIndex = (items: readonly MediaItem[], messageId: string, url: string) =>
  items.findIndex((it) => it.messageId === messageId && (it.url === url || it.originalUrl === url || it.fallbackUrl === url));
