// Смайл вместо аватарки — у профиля, бота и сообщества (у чатов своё правило в chat.schema.ts).
// Короткая строка (до 8 символов: смайлы с модификаторами и ZWJ-склейками) хотя бы с одним
// смайлом, или стикер из пака: «sticker:/uploads/…» (файл стикера). Пусто или null — убрать смайл.

export const AVATAR_EMOJI_ERROR = "Некорректный эмодзи";
const MAX_CODE_POINTS = 8;
const PICTOGRAPHIC = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
/** Стикер на аватарке: путь к файлу стикера в /uploads, без «..» и спецсимволов. */
const STICKER_AVATAR = /^sticker:\/uploads\/[A-Za-z0-9._/-]{1,200}$/;

/** null — убрать, строка — смайл, undefined — не годится (400 «Некорректный эмодзи»). */
export function cleanAvatarEmoji(raw: unknown): string | null | undefined {
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("sticker:")) return STICKER_AVATAR.test(value) && !value.includes("..") ? value : undefined;
  if ([...value].length > MAX_CODE_POINTS || !PICTOGRAPHIC.test(value) || /[\s<>]/u.test(value)) return undefined;
  return value;
}
