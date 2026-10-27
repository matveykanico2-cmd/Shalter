import { z } from "zod";
import { requestBody, text } from "../../../../common/lib/zod.js";

/** Правка настроек ответов: все поля как пришли — их чистит normalizeAiSettings в server/lib/aiPlans.js. */
export const aiSettingsSchema = z.preprocess(
  (body) => (body && typeof body === "object" && !Array.isArray(body) ? body : {}),
  z.record(z.string(), z.unknown())
);
export type AiSettingsDto = z.infer<typeof aiSettingsSchema>;

export const stopSchema = requestBody({ chatId: text() });
export type StopDto = z.infer<typeof stopSchema>;
