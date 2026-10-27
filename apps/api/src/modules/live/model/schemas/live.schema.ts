import { z } from "zod";
import { requestBody } from "../../../../common/lib/zod.js";

// Как server/routes/live.js. Эфир, чат и права сервис проверяет раньше полей, поэтому
// схема только приводит поля; «Пустое сообщение» — в сервисе, после проверки эфира.

/** Флаг, который снимает только явный false. */
const unlessFalse = () =>
  z
    .unknown()
    .optional()
    .transform((v) => v !== false);

export const startLiveSchema = requestBody({
  // Id не строкой не найдётся ни в одной строке таблицы.
  chatId: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" ? v : undefined)),
  title: z
    .unknown()
    .optional()
    .transform((v) => String(v ?? "").trim().slice(0, 80)),
  withVideo: unlessFalse(),
  source: z
    .unknown()
    .optional()
    .transform((v) => (v === "rtmp" ? "rtmp" : "webrtc")),
});
export type StartLiveDto = z.infer<typeof startLiveSchema>;

export const handSchema = requestBody({ raised: unlessFalse() });
export type HandDto = z.infer<typeof handSchema>;

export const roleSchema = requestBody({
  role: z
    .unknown()
    .optional()
    .transform((v) => (v === "speaker" ? "speaker" : "viewer")),
});
export type RoleDto = z.infer<typeof roleSchema>;

export const muteSchema = requestBody({ muted: unlessFalse() });
export type MuteDto = z.infer<typeof muteSchema>;

const MAX_MESSAGE_LEN = 500;

export const liveMessageSchema = requestBody({
  text: z
    .unknown()
    .optional()
    .transform((v) => String(v ?? "").trim().slice(0, MAX_MESSAGE_LEN)),
});
export type LiveMessageDto = z.infer<typeof liveMessageSchema>;
