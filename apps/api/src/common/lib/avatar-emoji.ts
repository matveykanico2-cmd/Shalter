// Смайл или стикер вместо аватарки — у профиля, бота и сообщества (у чатов своё правило
// в chat.schema.ts). Короткая строка (до 8 символов: модификаторы и ZWJ-склейки) хотя бы
// с одним смайлом. Пусто или null — убрать. Стикер проходит только в виде пути загрузки;
// право на сам файл отдельно проверяет usesForeignUpload в сервисе.
export const AVATAR_EMOJI_ERROR = "Некорректный эмодзи";
const MAX_CODE_POINTS = 8;
const PICTOGRAPHIC = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const STICKER_UPLOAD = /^sticker:\/uploads\/[^/?#]+$/;

/** null — убрать, строка — смайл, undefined — не годится (400 «Некорректный эмодзи»). */
export function cleanAvatarEmoji(raw: unknown): string | null | undefined {
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("sticker:")) return STICKER_UPLOAD.test(value) ? value : undefined;
  if ([...value].length > MAX_CODE_POINTS || !PICTOGRAPHIC.test(value) || /[\s<>]/u.test(value)) return undefined;
  return value;
}
