import type { giftCatalog, giftIssues } from "../../db/schema.js";

export type GiftCatalogRow = typeof giftCatalog.$inferSelect;
export type NewGiftCatalogRow = typeof giftCatalog.$inferInsert;
export type GiftIssueRow = typeof giftIssues.$inferSelect;

/** Подарок каталога без цены в звёздах: встроенный (server/data/catalog/gifts.json) или строка gift_catalog. */
export interface BuiltinGift {
  id: string;
  emoji: string;
  name: string;
  priceRub: number;
  priceStars?: number;
  /** 0 — без Premium, null — Premium навсегда. */
  premiumDays: number | null;
  supply?: number;
  exclusive?: true;
  mediaUrl?: string;
  scene?: unknown;
  ownerId?: string;
  hidden?: true;
  custom?: true;
  /** Встроенный подарок с правкой админа в gift_catalog. */
  edited?: true;
}

/** Подарок каталога в ответах API — как в server/data/gifts.js. */
export interface Gift extends BuiltinGift {
  priceStars: number;
}

/** Фон подарка (server/lib/giftBackground.js). */
export interface GiftBackground {
  from: string;
  to: string;
  pattern?: string;
  symbol?: string;
}
