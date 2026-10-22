import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Поля как пришли: проверки и тексты ошибок — в сервисе, как в server/routes/reports.js.
export const createReportSchema = requestBody({ targetType: raw(), targetId: raw(), reason: raw(), details: raw() });
export type CreateReportDto = z.infer<typeof createReportSchema>;

export const resolveReportSchema = requestBody({ action: raw() });
export type ResolveReportDto = z.infer<typeof resolveReportSchema>;
