import { z } from "zod";

// Ключи и значения проверяет сервис (белый список, лишнее молча отбрасывается, как
// server/routes/settings.js); схема лишь требует объект. Нет тела — пустой объект.
export const patchSettingsSchema = z.preprocess(
  (body) => body ?? {},
  z.custom<Record<string, unknown>>((body) => !!body && typeof body === "object" && !Array.isArray(body), { error: "Некорректные настройки" })
);
export type PatchSettingsDto = z.infer<typeof patchSettingsSchema>;
