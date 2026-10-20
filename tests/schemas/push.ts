// Push-подписки: server/routes/push.js. Ключ VAPID создаётся при старте сервера.
import { z } from "zod";

/** Публичный ключ VAPID — 65 байт несжатой точки P-256 в base64url. */
export const vapidKeyBody = z.strictObject({ publicKey: z.string().regex(/^[A-Za-z0-9_-]{87}$/) });
export const nativeSubscribeBody = z.strictObject({ ok: z.literal(true), configured: z.boolean() });
export const endpointsBody = z.strictObject({ endpoints: z.array(z.string()) });

/** Аватар в уведомлении (server/push.js pushAvatar). */
export const pushAvatar = z.strictObject({ url: z.string().nullable(), color: z.string().nullable(), name: z.string() });

/** Расшифрованное содержимое веб-пуша о новом сообщении (routes/messages.js pushNewMessage). */
export const messagePushPayload = z.strictObject({
  title: z.string(),
  body: z.string(),
  avatar: pushAvatar.optional(),
  url: z.string(),
  kind: z.literal("message"),
  tag: z.string(),
  chatId: z.string(),
  messageId: z.string(),
  silent: z.literal(true).optional(),
});
