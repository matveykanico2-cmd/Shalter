import { z } from "zod";
import { requestBody, text } from "../../../../common/lib/zod.js";

export const pairRecoverySchema = requestBody({ email: text(), phone: text(), code: text(), password: text() });
export type PairRecoveryDto = z.infer<typeof pairRecoverySchema>;

export const phoneRecoverySchema = requestBody({ phone: text(), code: text(), password: text() });
export type PhoneRecoveryDto = z.infer<typeof phoneRecoverySchema>;
