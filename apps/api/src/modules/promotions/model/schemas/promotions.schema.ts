import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Права проверяются раньше полей, поэтому схема только пропускает поля как есть: разбирает
// их сервис — как server/routes/promotions.js.

export const createPromoSchema = requestBody({ code: raw(), prize: raw(), config: raw(), usesTotal: raw() });
export type CreatePromoDto = z.infer<typeof createPromoSchema>;

export const updatePromoSchema = requestBody({ usesTotal: raw() });
export type UpdatePromoDto = z.infer<typeof updatePromoSchema>;

export const redeemPromoSchema = requestBody({ code: raw() });
export type RedeemPromoDto = z.infer<typeof redeemPromoSchema>;
