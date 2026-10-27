import { z } from "zod";
import { raw, requestBody, requestQuery } from "../../../../common/lib/zod.js";

// Как server/routes/calls.js. Вид звонка проверяется первым — до поиска чата; остальные
// проверки зависят от звонка в базе, их делают сервисы.

/** Id: не строка не совпадёт ни с одним участником и не найдётся в таблице. */
const id = () =>
  z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" ? v : undefined));

const CALL_STATUSES = ["ongoing", "ended", "missed", "completed", "declined"] as const;

export const createCallSchema = requestBody({
  // Через POST /api/calls — только обычные звонки; голосовой чат группы («voice-room»)
  // создаётся своим маршрутом /room/:chatId/join. Клиент шлёт «audio».
  kind: z.enum(["audio", "voice", "video"], { error: "Некорректный вид звонка" }),
  chatId: id(),
  ringAll: z
    .unknown()
    .optional()
    .transform((v) => !!v),
});
export type CreateCallDto = z.infer<typeof createCallSchema>;

export const patchCallSchema = requestBody({
  // Неизвестный статус — как его отсутствие.
  status: z
    .unknown()
    .optional()
    .transform((v) => CALL_STATUSES.find((s) => s === v)),
  durationSec: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : undefined)),
});
export type PatchCallDto = z.infer<typeof patchCallSchema>;

export const addParticipantSchema = requestBody({ userId: id() });
export type AddParticipantDto = z.infer<typeof addParticipantSchema>;

// kind проверяется после адресата (тот — по звонку), поэтому как пришёл; data передаётся как есть.
export const sendSignalSchema = requestBody({ toUserId: id(), kind: raw(), data: raw() });
export type SendSignalDto = z.infer<typeof sendSignalSchema>;

export const signalsQuerySchema = requestQuery({
  after: z
    .unknown()
    .optional()
    .transform((v) => {
      const from = Number(v ?? "0");
      return Number.isFinite(from) ? from : 0;
    }),
});
export type SignalsQueryDto = z.infer<typeof signalsQuerySchema>;
