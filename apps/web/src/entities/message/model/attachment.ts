// Вложение сообщения — поля из server/lib/sanitizeAttachments.js и того, что дописывает
// обработка медиа (server/lib/mediaJobs.js: превью, размеры, длительность).
export type Attachment = {
  kind: string;
  url?: string;
  thumbUrl?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  spoiler?: boolean;
  width?: number;
  height?: number;
  durationSec?: number;
  /** Видео: обложка, сжатая копия для просмотра и признак «ещё обрабатывается». */
  posterUrl?: string;
  previewUrl?: string;
  previewPending?: boolean;
  /** Голосовое: до 100 уровней 0..31 и расшифровка. */
  waveform?: number[];
  transcript?: string;
  meta?: Record<string, unknown>;
  /** Инлайн-стикер в тексте сообщения */
  emoji?: string;
  packId?: string;
  inline?: boolean;
};

/** Карточка ссылки под текстом (server/lib/linkPreview.js). */
export type LinkPreview = {
  url: string;
  title?: string;
  description?: string;
  siteName?: string;
  image?: string;
  images?: string[];
  video?: boolean;
  warning?: string;
  unsafe?: boolean;
};

/** Фото или видео в просмотрщике: с автором и подписью сообщения. */
export type MediaItem = {
  kind: "image" | "video";
  url: string;
  name?: string;
  thumbUrl?: string;
  /** Видео: оригинал, если в ленте показана сжатая копия. */
  originalUrl?: string;
  fallbackUrl?: string;
  messageId: string;
  author?: string;
  time?: string;
  caption?: string;
};
