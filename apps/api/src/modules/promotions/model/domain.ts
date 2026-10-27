import type { promoCodes } from "../../db/schema.js";

export type PromoCodeRow = typeof promoCodes.$inferSelect;

export const PROMO_PRIZES = ["premium", "stars", "ads", "business"] as const;
export type PromoPrize = (typeof PROMO_PRIZES)[number];

export type PromoConfig = { type: "stars"; amount: number } | { type: Exclude<PromoPrize, "stars">; days: number };

export interface PromoCode {
  id: string;
  code: string;
  prize: string;
  config: PromoConfig | null;
  usesTotal: number | null;
  used: number;
  createdBy: string;
  createdAt: string;
}
