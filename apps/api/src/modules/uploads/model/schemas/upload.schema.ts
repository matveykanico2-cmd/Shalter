import type { z } from "zod";
import { optionalText, requestQuery } from "../../../../common/lib/zod.js";

/** ?kind=…&name=…&mimeType=… — тело запроса занято байтами файла. */
export const uploadQuerySchema = requestQuery({ kind: optionalText(), name: optionalText(), mimeType: optionalText() });
export type UploadQueryDto = z.infer<typeof uploadQuerySchema>;
