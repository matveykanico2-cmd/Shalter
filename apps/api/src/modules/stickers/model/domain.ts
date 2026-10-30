import type { customEmoji, stickerPacks, stickers, userStickerPacks } from "../../db/schema.js";

export type StickerPackRow = typeof stickerPacks.$inferSelect;
export type StickerRow = typeof stickers.$inferSelect;
export type UserStickerPackRow = typeof userStickerPacks.$inferSelect;
export type CustomEmojiRow = typeof customEmoji.$inferSelect;

/** Стикер внутри пака (строка таблицы stickers). */
export interface Sticker {
  id: string;
  packId: string;
  /** URL загруженного файла (/uploads/…); в БД колонка `file`. */
  url: string;
  emoji: string;
  position: number;
  createdAt: string;
}

/** Стикерпак как его отдаёт API. */
export interface StickerPack {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  stickers: Sticker[];
  stickerCount: number;
  /** Пак уже в коллекции пользователя. */
  isAdded: boolean;
  /** Запрос от владельца пака. */
  isOwner: boolean;
  createdAt: string;
}

/** Кастомный эмодзи каталога (отдельная функция /api/custom-emoji). */
export interface CustomEmoji {
  id: string;
  name: string;
  scene: unknown;
  createdAt: string;
}
