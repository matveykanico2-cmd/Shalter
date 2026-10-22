import type { customEmoji, stickerPacks } from "../../db/schema.js";

export type StickerPackRow = typeof stickerPacks.$inferSelect;
export type CustomEmojiRow = typeof customEmoji.$inferSelect;

/** Стикерпак как его отдаёт server/data/stickerPacks.js (rowToPack). */
export interface StickerPack {
  id: string;
  ownerId: string;
  name: string;
  stickers: unknown[];
  createdAt: string;
}

/** Эмодзи каталога как его отдаёт server/data/customEmoji.js (rowToEmoji). */
export interface CustomEmoji {
  id: string;
  name: string;
  scene: unknown;
  createdAt: string;
}
