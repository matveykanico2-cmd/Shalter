import { z } from "zod";
import { requestBody } from "../../../../common/lib/zod.js";
import { unsupportedLanguages } from "../../../../legacy/legacy.js";

// Проверки и их порядок — как в server/routes/translate.js.

/** Язык перевода: непустая строка и не из неподдерживаемых (тот же список, что у остального мессенджера). */
const target = () =>
  z
    .unknown().optional()
    .refine((v) => typeof v === "string" && v.trim() !== "", { error: "Не указан язык перевода" })
    .transform((v) => v as string)
    .refine((v) => !unsupportedLanguages().isUnsupportedLanguage(v), { error: () => unsupportedLanguages().UNSUPPORTED_MESSAGE });

export const translateSchema = requestBody({
  text: z
    .unknown().optional()
    .refine((v) => v == null || typeof v === "string", { error: "Некорректный текст" })
    .transform((v) => (v ?? "") as string)
    .refine((v) => v.trim() !== "", { error: "Нечего переводить" }),
  target: target(),
});
export type TranslateDto = z.infer<typeof translateSchema>;

const MAX_BATCH = 300;

export const translateBatchSchema = requestBody({
  // Длинные строки обрезаются, а не отклоняются.
  texts: z
    .unknown().optional()
    .refine((v) => Array.isArray(v) && v.length > 0, { error: "texts must be a non-empty array" })
    .transform((v) => (v as unknown[]).map((t) => String(t ?? "").trim().slice(0, 2000))),
  target: target().transform((v) => v.trim().toLowerCase()),
}).refine((dto) => dto.texts.length <= MAX_BATCH, {
  error: `Слишком много строк за один запрос (максимум ${MAX_BATCH})`,
  // Число строк проверяется последним — после языка.
  when: (payload) => payload.issues.length === 0,
});
export type TranslateBatchDto = z.infer<typeof translateBatchSchema>;
