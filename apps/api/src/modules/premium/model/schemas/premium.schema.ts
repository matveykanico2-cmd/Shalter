import { z } from "zod";
import { raw, requestBody, text } from "../../../../common/lib/zod.js";

// Права и получателя сервисы проверяют раньше полей, поэтому схема только приводит поля,
// как server/routes/premium.js и business.js.

/** Срок в днях; не число больше нуля — undefined (сервис берёт срок по умолчанию). */
const grantDays = () =>
  z
    .unknown()
    .optional()
    .transform((v) => (Number(v) > 0 ? Math.floor(Number(v)) : undefined));

/** Выдать (true) или отключить: отключает только явный false. */
const grantFlag = () =>
  z
    .unknown()
    .optional()
    .transform((v) => v !== false);

const truthy = () =>
  z
    .unknown()
    .optional()
    .transform((v) => !!v);

// Тариф ищется по id любого типа (pickPlan в server/data/pricing.js), без него — первый.
export const planSchema = requestBody({ plan: raw() });
export type PlanDto = z.infer<typeof planSchema>;

export const grantPremiumSchema = requestBody({ userId: text(), premium: grantFlag(), days: grantDays(), forever: truthy() });
export type GrantPremiumDto = z.infer<typeof grantPremiumSchema>;

export const grantBusinessSchema = requestBody({ userId: text(), business: grantFlag(), days: grantDays(), forever: truthy() });
export type GrantBusinessDto = z.infer<typeof grantBusinessSchema>;
