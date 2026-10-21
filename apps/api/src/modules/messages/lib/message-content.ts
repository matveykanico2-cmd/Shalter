import { isSafeUrl, sanitizers } from "../../../legacy/legacy.js";
import type { Message } from "../model/domain.js";

// Что можно положить в сообщение, и как оно выглядит в уведомлении (server/routes/messages.js).

/** Как в Telegram: 4096 символов текста (подпись к медиа — тоже). */
export const MAX_MESSAGE_TEXT = 4096;
/** Эффекты — только в личных чатах. */
export const MESSAGE_EFFECTS = ["🔥", "👍", "👎", "❤️", "🎉", "💩"];
/** Платный пост: звёзды 1…10000. */
export const MAX_PAID_STARS = 10000;

const MAX_MESSAGE_EMOJI = 24;

/** Свои эмодзи-сцены в тексте: до 24, неподходящая — null на её месте; ни одной — undefined. */
export function sanitizeMessageEmoji(input: unknown): unknown[] | undefined {
  if (!Array.isArray(input) || input.length === 0) return undefined;
  const { sanitizeScene } = sanitizers();
  const cleaned = input.slice(0, MAX_MESSAGE_EMOJI).map((scene) => sanitizeScene(scene, { requireLayers: true }) ?? null);
  return cleaned.some(Boolean) ? cleaned : undefined;
}

/** Ответ на историю: ссылка — только безопасная, имя автора — до 100 символов. */
export function sanitizeStoryReply(raw: unknown): { url?: string; kind: "image" | "video"; authorName?: string } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const story = raw as Record<string, unknown>;
  const url = typeof story.url === "string" && isSafeUrl(story.url) ? story.url : undefined;
  const kind = story.kind === "video" ? "video" : "image";
  const authorName = typeof story.authorName === "string" ? story.authorName.slice(0, 100) : undefined;
  if (!url && !authorName) return undefined;
  return { url, kind, authorName };
}

const ATTACHMENT_LABEL: Record<string, string> = {
  image: "📷 Фото",
  video: "📹 Видео",
  file: "📄 Файл",
  voice: "🎤 Голосовое сообщение",
  "video-note": "⏺ Видео-кружок",
  poll: "📊 Опрос",
  checklist: "☑️ Чек-лист",
  dice: "🎲 Кубик",
  paid: "⭐ Платный пост",
  game: "🎮 Игра",
  location: "📍 Геолокация",
  contact: "👤 Контакт",
};

/** Текст сообщения для уведомления: сам текст или подпись первого вложения. */
export function messagePreview(message: Message): string {
  if (message.text?.trim()) return message.text;
  return ATTACHMENT_LABEL[message.attachments?.[0]?.kind ?? ""] ?? "Новое сообщение";
}
