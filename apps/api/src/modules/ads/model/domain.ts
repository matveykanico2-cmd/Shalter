import type { adCampaigns, adDaily } from "../../db/schema.js";

export type AdCampaignRow = typeof adCampaigns.$inferSelect;
export type AdDailyRow = typeof adDaily.$inferSelect;

/** Рекламная кампания в ответах API — rowToCampaign в server/data/adCampaigns.js. */
export interface AdCampaign {
  id: string;
  ownerId: string;
  title: string;
  text: string;
  url: string | null;
  imageUrl: string | null;
  /** Колонка как есть: места показа через запятую. */
  placement: string;
  placements: string[];
  status: string;
  rejectReason: string | null;
  budgetStars: number;
  spentStars: number;
  cpmStars: number;
  impressions: number;
  clicks: number;
  createdAt: string;
  updatedAt: string | null;
  remainingStars: number;
}

/** Поля кампании, которые меняет update(). */
export interface AdCampaignPatch {
  title?: string;
  text?: string;
  url?: string | null;
  imageUrl?: string | null;
  placement?: string[];
  status?: string;
  rejectReason?: string | null;
  budgetStars?: number;
  cpmStars?: number;
}

/** Вложение объявления в кабинете рекламы (adAttachments пользователя). */
export interface AdAttachment {
  kind: string;
  url: string;
  name?: string;
  size?: number;
}
