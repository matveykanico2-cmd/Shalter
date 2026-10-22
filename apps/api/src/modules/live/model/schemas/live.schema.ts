import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Поля как пришли: проверки и тексты ошибок — в сервисе, как в server/routes/live.js.
export const startLiveSchema = requestBody({ chatId: raw(), title: raw(), withVideo: raw(), source: raw() });
export type StartLiveDto = z.infer<typeof startLiveSchema>;

export const handSchema = requestBody({ raised: raw() });
export type HandDto = z.infer<typeof handSchema>;

export const roleSchema = requestBody({ role: raw() });
export type RoleDto = z.infer<typeof roleSchema>;

export const muteSchema = requestBody({ muted: raw() });
export type MuteDto = z.infer<typeof muteSchema>;

export const liveMessageSchema = requestBody({ text: raw() });
export type LiveMessageDto = z.infer<typeof liveMessageSchema>;
