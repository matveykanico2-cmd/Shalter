import type { z } from "zod";
import { optionalText, requestQuery } from "../../../../common/lib/zod.js";
import { uploadLimits } from "../../../../legacy/legacy.js";

/**
 * ?kind=…&name=…&mimeType=… — тело запроса занято байтами файла. Тип проверяется первым,
 * до размера из Content-Length (413 — в сервисе), как в server/routes/uploads.js.
 */
export const uploadQuerySchema = requestQuery({
  kind: optionalText()
    .transform((v) => v ?? "file")
    .refine((kind) => uploadLimits().UPLOADABLE_KINDS.has(kind), { error: "Неизвестный тип файла" }),
  name: optionalText().transform((v) => (v ?? "file").slice(0, 300)),
  mimeType: optionalText().transform((v) => (v ?? "").slice(0, 120) || undefined),
});
export type UploadQueryDto = z.infer<typeof uploadQuerySchema>;
