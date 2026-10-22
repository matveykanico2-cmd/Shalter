import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

export const checkSchema = requestBody({ text: raw(), language: raw() });
export type CheckDto = z.infer<typeof checkSchema>;
