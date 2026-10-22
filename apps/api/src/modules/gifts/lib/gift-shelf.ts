import type { GiftEntry } from "../../users/lib/user.mapper.js";

// Запись на полке подарков: по id, а у старых записей без id — по «эмодзи|время» (server/data/users.js).
export const findShelfIndex = (gifts: GiftEntry[], entryId: string): number =>
  gifts.findIndex((g) => (g.id ? g.id === entryId : `${g.emoji}|${g.at}` === entryId));

export const findShelfEntry = (gifts: GiftEntry[] | undefined, entryId: string): GiftEntry | undefined => {
  const list = gifts ?? [];
  return list[findShelfIndex(list, entryId)];
};

/** Premium в подписи к подарку; 0 дней — без Premium. */
export function durationLabel(days: number | null): string | null {
  if (days === 0) return null;
  if (days == null) return "Premium навсегда";
  return `Premium на ${days} дней`;
}

function copiesWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "экземпляр";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "экземпляра";
  return "экземпляров";
}

export function soldOutError(gift: { name: string; supply?: number }): string {
  return gift.supply === 1
    ? `«${gift.name}» распродан — единственный экземпляр уже забрали`
    : `«${gift.name}» распродан — все ${gift.supply} ${copiesWord(gift.supply!)} уже разобраны`;
}

/** Подпись к подарку, как в Telegram: одна строка, до 128 символов. */
export function giftNote(note: unknown): string | null {
  return String(note ?? "").replace(/\s+/g, " ").trim().slice(0, 128) || null;
}
