import { z } from "zod";
import { requestBody, text } from "../../../../common/lib/zod.js";

// Пустой текст и превышение длины (413) проверяет server/lib/languageTool.js; язык уходит
// туда как пришёл — resolveLanguage сам разбирает непонятные значения.
export const checkSchema = requestBody({
  text: text(),
  language: z.unknown().optional().transform((v) => v || "auto"),
});
export type CheckDto = z.infer<typeof checkSchema>;
