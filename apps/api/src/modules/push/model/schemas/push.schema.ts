import { z } from "zod";
import { requestBody } from "../../../../common/lib/zod.js";

// Сервер сам POST'ит на endpoint подписки, поэтому принимаем только то, что выдаёт браузерный
// PushManager: адрес и ключи шифрования p256dh/auth. Публичность хоста (SSRF) проверяет сервис —
// это запрос в DNS, и он идёт после проверки формы, как в server/routes/push.js.
const invalidSubscription = { error: "invalid subscription" };
const pushKey = z.string(invalidSubscription).min(1, invalidSubscription).max(256, invalidSubscription);
const webSubscription = z.looseObject(
  {
    endpoint: z.string(invalidSubscription).min(1, invalidSubscription).max(2048, invalidSubscription),
    keys: z.looseObject({ p256dh: pushKey, auth: pushKey }, invalidSubscription),
  },
  invalidSubscription
);
export type WebSubscription = z.infer<typeof webSubscription>;

export const subscribeSchema = requestBody({ subscription: webSubscription });
export type SubscribeDto = z.infer<typeof subscribeSchema>;

const invalidToken = { error: "invalid token" };
export const subscribeNativeSchema = requestBody({
  token: z
    .unknown().optional()
    .transform((v) => (typeof v === "string" ? v.trim() : ""))
    .pipe(z.string().min(1, invalidToken).max(4096, invalidToken)),
  callUi: z.unknown().optional().transform((v) => v === true),
});
export type SubscribeNativeDto = z.infer<typeof subscribeNativeSchema>;

/** Не строка — как пустая: отписывать нечего. */
export const unsubscribeSchema = requestBody({ endpoint: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")) });
export type UnsubscribeDto = z.infer<typeof unsubscribeSchema>;
