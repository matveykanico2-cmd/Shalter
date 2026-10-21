import { z } from "zod";
import { raw, requestBody, requestQuery } from "../../../../common/lib/zod.js";

export const createCallSchema = requestBody({ chatId: raw(), kind: raw(), ringAll: raw() });
export type CreateCallDto = z.infer<typeof createCallSchema>;

export const patchCallSchema = requestBody({ status: raw(), durationSec: raw() });
export type PatchCallDto = z.infer<typeof patchCallSchema>;

export const addParticipantSchema = requestBody({ userId: raw() });
export type AddParticipantDto = z.infer<typeof addParticipantSchema>;

export const sendSignalSchema = requestBody({ toUserId: raw(), kind: raw(), data: raw() });
export type SendSignalDto = z.infer<typeof sendSignalSchema>;

export const signalsQuerySchema = requestQuery({ after: raw() });
export type SignalsQueryDto = z.infer<typeof signalsQuerySchema>;
