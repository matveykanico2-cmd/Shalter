import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Поля проверяют сервисы, как server/routes/premium.js и business.js.

export const planSchema = requestBody({ plan: raw() });
export type PlanDto = z.infer<typeof planSchema>;

export const grantPremiumSchema = requestBody({ userId: raw(), premium: raw(), days: raw(), forever: raw() });
export type GrantPremiumDto = z.infer<typeof grantPremiumSchema>;

export const grantBusinessSchema = requestBody({ userId: raw(), business: raw(), days: raw(), forever: raw() });
export type GrantBusinessDto = z.infer<typeof grantBusinessSchema>;
