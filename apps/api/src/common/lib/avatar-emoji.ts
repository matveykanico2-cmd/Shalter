// Смайл вместо аватарки — у профиля, бота и сообщества (у чатов своё правило в chat.schema.ts).
// Короткая строка (до 8 символов: смайлы с модификаторами и ZWJ-склейками) хотя бы с одним
// смайлом. Пусто или null — убрать смайл. Свои стикеры и стикеры из паков на аватарке
// больше не допускаются: avatarEmoji со значением «sticker:…» отвергается.
export const AVATAR_EMOJI_ERROR = "Некорректный эмодзи";
const MAX_CODE_POINTS = 8;
const PICTOGRAPHIC = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

/** null — убрать, строка — смайл, undefined — не годится (400 «Некорректный эмодзи»). */
export function cleanAvatarEmoji(raw: unknown): string | null | undefined {
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("sticker:")) return undefined;
  if ([...value].length > MAX_CODE_POINTS || !PICTOGRAPHIC.test(value) || /[\s<>]/u.test(value)) return undefined;
  return value;
}
