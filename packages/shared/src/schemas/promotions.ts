// Промокоды: /api/promotions (server/routes/promotions.js, apps/api modules/promotions).
import { z } from "zod";
import { isoDate } from "./common";

export const promoConfig = z.union([
  z.strictObject({ type: z.literal("stars"), amount: z.number().int().positive() }),
  z.strictObject({ type: z.enum(["premium", "ads", "business"]), days: z.number().int().positive() }),
]);

export const promoCode = z.strictObject({
  id: z.string(),
  code: z.string(),
  prize: z.string(),
  config: promoConfig.nullable(),
  usesTotal: z.number().int().nullable(),
  used: z.number().int(),
  createdBy: z.string(),
  createdAt: isoDate,
});

export const promoListBody = z.strictObject({ codes: z.array(promoCode.extend({ createdByName: z.string() })) });
export const promoCodeBody = z.strictObject({ code: promoCode });
export const promoRedeemBody = z.strictObject({ delivered: z.literal(true), message: z.string(), balance: z.number().int() });
