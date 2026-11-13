import { z } from "zod";
import { optionalText, requestQuery } from "../../../../common/lib/zod.js";
import { uploadLimits } from "../../../../legacy/legacy.js";

/**
 * ?kind=…&name=…&mimeType=… — тело запроса занято байтами файла. Тип проверяется первым,
 * до размера из Content-Length (413 — в сервисе), как в server/routes/uploads.js.
 */
const uploadFields = {
  kind: optionalText()
    .transform((v) => v ?? "file")
    .refine((kind) => uploadLimits().UPLOADABLE_KINDS.has(kind), { error: "Неизвестный тип файла" }),
  name: optionalText().transform((v) => (v ?? "file").slice(0, 300)),
  mimeType: optionalText().transform((v) => (v ?? "").slice(0, 120) || undefined),
};
export const uploadQuerySchema = requestQuery(uploadFields);
export type UploadQueryDto = z.infer<typeof uploadQuerySchema>;

/** Загрузка частями: те же kind/name/mimeType и полный размер файла. */
export const uploadSessionQuerySchema = requestQuery({
  ...uploadFields,
  size: z.unknown().transform((v) => Number(v)),
});
export type UploadSessionQueryDto = z.infer<typeof uploadSessionQuerySchema>;

/** Смещение части в байтах. */
export const offsetQuerySchema = requestQuery({ offset: z.unknown().transform((v) => Number(v)).refine((n) => Number.isSafeInteger(n) && n >= 0, { error: "Некорректное смещение" }) });
export type OffsetQueryDto = z.infer<typeof offsetQuerySchema>;

export const uploadSessionIdParam = z.string().regex(/^[0-9a-f]{32}$/, { error: "Загрузка не найдена — начните заново" });
