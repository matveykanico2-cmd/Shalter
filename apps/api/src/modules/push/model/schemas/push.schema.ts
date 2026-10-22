import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Поля проверяет сервис — со своими текстами ошибок, как server/routes/push.js.
export const subscribeSchema = requestBody({ subscription: raw() });
export type SubscribeDto = z.infer<typeof subscribeSchema>;

export const subscribeNativeSchema = requestBody({ token: raw(), callUi: raw() });
export type SubscribeNativeDto = z.infer<typeof subscribeNativeSchema>;

export const unsubscribeSchema = requestBody({ endpoint: raw() });
export type UnsubscribeDto = z.infer<typeof unsubscribeSchema>;
