// Галерея просмотрщика — все фото и видео загруженной ленты по порядку, с автором,
// временем и подписью (как galleryAround и messageInfo в mediaViewer.js, но из данных,
// а не из DOM: лента виртуальная, на экране только часть пузырей).
import { attachmentsOf, type FeedMessage, isVisualMedia, type MediaItem, mediaItem, plainText, timeLabel } from "@/entities/message";

export function buildGallery(messages: readonly FeedMessage[], authorOf: (m: FeedMessage) => string | null): MediaItem[] {
  const items: MediaItem[] = [];
  for (const m of messages) {
    if (m.pending) continue;
    const caption = m.text?.trim() ? plainText(m.text) : undefined;
    for (const a of attachmentsOf(m)) {
      if (!isVisualMedia(a)) continue;
      items.push({ ...mediaItem(a, m), author: authorOf(m) ?? undefined, time: timeLabel(m.createdAt), caption });
    }
  }
  return items;
}

/** Где в галерее медиа, на которое нажали (url — как в ленте, оригинал у видео — тоже). */
export const galleryIndex = (items: readonly MediaItem[], messageId: string, url: string) =>
  items.findIndex((it) => it.messageId === messageId && (it.url === url || it.originalUrl === url || it.fallbackUrl === url));
