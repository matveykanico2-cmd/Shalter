import { z } from "zod";
import { requestBody } from "../../../../common/lib/zod.js";
import { REASONS } from "../../lib/report-reasons.js";

// Как server/routes/reports.js: тип цели и причина проверяются до всего остального.
const TARGET_TYPES = ["user", "chat", "message"] as const;
const ACTIONS = ["delete", "ban", "dismiss"] as const;

export const createReportSchema = requestBody({
  targetType: z.enum(TARGET_TYPES, { error: "invalid target type" }),
  // id цели ищется как пришёл: не найдена — 404 в сервисе.
  targetId: z.unknown().optional().transform((v) => v as string),
  reason: z
    .unknown().optional()
    .refine((v) => REASONS.has(v as string), { error: "invalid reason" })
    .transform((v) => v as string),
  // Не строка — как в server/: ошибка уже после поиска цели, поэтому здесь не проверяется.
  details: z.unknown().optional(),
});
export type CreateReportDto = z.infer<typeof createReportSchema>;

// Действие проверяется после прав модератора (403), поэтому неверное — null, а ошибка в сервисе.
export const resolveReportSchema = requestBody({
  action: z.unknown().optional().transform((v) => (ACTIONS.includes(v as (typeof ACTIONS)[number]) ? (v as (typeof ACTIONS)[number]) : null)),
});
export type ResolveReportDto = z.infer<typeof resolveReportSchema>;
