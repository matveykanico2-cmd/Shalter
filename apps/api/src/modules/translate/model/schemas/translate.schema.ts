import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Поля проверяет сервис — со своими текстами ошибок, как server/routes/translate.js.

export const translateSchema = requestBody({ text: raw(), target: raw() });
export type TranslateDto = z.infer<typeof translateSchema>;

export const translateBatchSchema = requestBody({ texts: raw(), target: raw() });
export type TranslateBatchDto = z.infer<typeof translateBatchSchema>;
