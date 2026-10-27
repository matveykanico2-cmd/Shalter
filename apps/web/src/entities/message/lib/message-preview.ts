// Превью сообщения одной строкой — как public/js/lib/messagePreview.js.
import type { Message } from "../model/types";

import { splitArticle } from "./article";

type Attachment = { kind?: string; name?: string; mimeType?: string; meta?: { emoji?: string; value?: number; title?: string } };

const ATTACHMENT_LABEL: Record<string, string | null> = {
  image: "📷 Фото",
  video: "🎬 Видео",
  file: "📄 Файл",
  voice: "🎤 Голосовое сообщение",
  "video-note": "⏺ Видео-кружок",
  poll: null,
  checklist: null,
  location: "📍 Геолокация",
  contact: "👤 Контакт",
};

/** Свои эмодзи «[ce:123]» в превью — значком. */
export const stripCustomEmoji = (t: string | null | undefined) => (t ?? "").replace(/\[ce:\d+\]/g, "🎨");

const ceText = (t: string | null | undefined) => plainText(stripCustomEmoji(t));

/** Без разметки: «**жирный**» → «жирный», спойлер — точками, код и цитата — текстом. */
export function plainText(t: string) {
  return t
    .replace(/```[a-z0-9+#-]*\n?([\s\S]*?)```/gi, "$1")
    .replace(/\|\|([^|]+)\|\|/g, (_, s: string) => "⠿".repeat(Math.min(8, Math.max(3, s.length))))
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|`([^`]+)`|\*([^*\s][^*]*)\*/g, (_, ...g: unknown[]) => String(g.slice(0, 5).find((x) => x != null)))
    .replace(/^> ?/gm, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

const SLOT_SYMBOLS = ["BAR", "🍇", "🍋", "7️⃣"];

/** Человеческий результат броска: для 🎰 — три символа, для мячей — попал или нет. */
export function diceResult(meta: Attachment["meta"]) {
  const v = meta?.value ?? 0;
  switch (meta?.emoji) {
    case "🎰": {
      const n = v - 1;
      const reels = [n % 4, (n >> 2) % 4, (n >> 4) % 4].map((i) => SLOT_SYMBOLS[i]);
      return `${reels.join(" ")}${v === 64 ? " — джекпот!" : reels[0] === reels[1] && reels[1] === reels[2] ? " — три в ряд!" : ""}`;
    }
    case "🎯":
      return v === 6 ? "В яблочко!" : v === 1 ? "Мимо" : `Очки: ${v}`;
    case "🏀":
      return v >= 4 ? "Попадание!" : "Мимо";
    case "⚽":
      return v >= 3 ? "Гол!" : "Мимо";
    case "🎳":
      return v === 6 ? "Страйк!" : `Сбито кеглей: ${[0, 1, 3, 4, 5, 6][v - 1] ?? v}`;
    default:
      return `Выпало: ${v}`;
  }
}

/**
 * Запись о звонке сервер пишет одним текстом на всех («📞 Пропущенный звонок»), а заголовок
 * у каждой стороны свой: звонящему — «Отменённый», получателю — «Пропущенный».
 */
export function callLogInfo(m: Pick<Message, "text">, mine: boolean) {
  const text = m.text ?? "";
  const video = /видео/i.test(text);
  const durMatch = text.match(/· (\d+):(\d{2})/);
  const answered = !!durMatch;
  const declined = /отклон/i.test(text);
  const what = video ? "видеозвонок" : "звонок";
  const title = mine
    ? answered
      ? `Исходящий ${what}`
      : `Отменённый ${what}`
    : answered
      ? `Входящий ${what}`
      : declined
        ? `Отклонённый ${what}`
        : `Пропущенный ${what}`;
  return {
    video,
    answered,
    durationSec: durMatch ? Number(durMatch[1]) * 60 + Number(durMatch[2]) : 0,
    title: title[0]!.toUpperCase() + title.slice(1),
  };
}

export function messagePreview(m: Message | null | undefined) {
  if (!m) return "";
  if (m.type === "system") return ceText(m.text);
  const sticker = m.sticker as { emoji?: string } | undefined;
  const gift = m.gift as { name?: string } | undefined;
  if (m.type === "sticker") return `${sticker?.emoji ?? ""} Стикер`.trim();
  if (m.type === "gift") return `🎁 ${gift?.name ?? "Подарок"}`;
  if (m.type === "article") return `📰 ${plainText(stripCustomEmoji(splitArticle(m.text).title)) || "Статья"}`;
  const att = m.attachments?.[0] as Attachment | undefined;
  const text = ceText(m.text);
  if (att) {
    if (att.kind === "poll") return `📊 ${text || "Опрос"}`;
    if (att.kind === "checklist") return `☑️ ${text || "Чек-лист"}`;
    if (att.kind === "dice") return `${att.meta?.emoji ?? "🎲"} ${diceResult(att.meta)}`;
    if (att.kind === "game") return `🎮 ${att.meta?.title ?? "Игра"}`;
    if (att.kind === "paid") return `⭐ Платный пост${text ? `: ${text}` : ""}`;
    if (att.kind === "file" && att.name) {
      const isAudio = att.mimeType?.startsWith("audio/") || /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/i.test(att.name);
      const label = isAudio ? `🎵 ${att.name.replace(/\.[a-z0-9]{1,5}$/i, "")}` : `📄 ${att.name}`;
      return text ? `${label} · ${text}` : label;
    }
    const label = att.kind ? ATTACHMENT_LABEL[att.kind] : undefined;
    if (label) return text ? `${label} · ${text}` : label;
    return text || att.name || "Вложение";
  }
  return text;
}
