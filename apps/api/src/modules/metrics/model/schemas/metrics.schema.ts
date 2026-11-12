import { z } from "zod";
import { requestBody } from "../../../../common/lib/zod.js";

/** Что меряет клиент: готовность приложения после запуска и открытие чата. */
export const TIMING_NAMES = ["app-ready", "chat-open"] as const;

const invalid = { error: "invalid timing" };

export const timingSchema = requestBody({
  name: z.enum(TIMING_NAMES, invalid),
  // Дольше двух минут — не замер, а вкладка, оставленная в фоне.
  ms: z.number(invalid).finite(invalid).min(0, invalid).max(120_000, invalid),
});
export type TimingDto = z.infer<typeof timingSchema>;
