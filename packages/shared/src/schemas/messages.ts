// Ответы маршрутов сообщений (server/routes/messages.js, /api/chats/:id/messages).
// Само сообщение — общая схема message из ./message.
import { z } from "zod";
import { anyJson, genId, isoDate } from "./common";
import { message } from "./message";
import { publicUser } from "./user";

/** { message } — отправка, правка, закреп, реакция, голос, чек-лист, геопозиция. */
export const messageEnvelope = z.strictObject({ message });

/** POST / — к сообщению добавляются chargedStars/balance, только если списали звёзды. */
export const sendResult = z.strictObject({
  message,
  chargedStars: z.number().optional(),
  balance: z.number().optional(),
});

/** Цель ответа, которой нет на загруженной странице (replyTargetsFor). */
export const replyTarget = z.union([
  z.strictObject({ id: z.string(), deleted: z.literal(true) }),
  z.strictObject({
    id: z.string(),
    senderId: z.string(),
    anonymous: z.boolean(),
    type: z.string(),
    text: z.string(),
    attachments: z.array(z.strictObject({ kind: z.string(), name: z.string().optional() })),
    sticker: z.strictObject({ emoji: anyJson }).optional(),
    gift: z.strictObject({ name: anyJson }).optional(),
  }),
]);

/** GET / — страница истории. */
export const historyPage = z.strictObject({
  messages: z.array(message),
  hasMore: z.boolean(),
  firstUnreadId: z.string().nullable(),
  replyTargets: z.record(z.string(), replyTarget),
});

export const messageList = z.strictObject({ messages: z.array(message) });

export const deleteResult = z.strictObject({
  ok: z.literal(true),
  id: z.string(),
  forEveryone: z.boolean(),
});

export const readersResult = z.strictObject({
  readers: z.array(z.strictObject({ user: publicUser, readAt: isoDate.nullable() })),
});

export const threadResult = z.strictObject({ root: message, replies: z.array(message) });

export const daysResult = z.strictObject({ days: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)) });

export const atResult = z.strictObject({
  message: z.strictObject({ id: z.string(), createdAt: isoDate }).nullable(),
});

/** Отложенное сообщение: rowToScheduled (server/data/scheduledMessages.js). */
export const scheduled = z.strictObject({
  id: genId("sch"),
  chatId: z.string(),
  senderId: z.string(),
  text: z.string(),
  attachments: z.array(anyJson).optional(),
  replyToId: z.string().nullable(),
  topicId: z.string().nullable(),
  repeat: z.enum(["day", "week", "2weeks", "month", "3months", "6months", "year"]).nullable(),
  sendAt: isoDate,
  createdAt: isoDate,
});

export const scheduledList = z.strictObject({ scheduled: z.array(scheduled) });
export const scheduledEnvelope = z.strictObject({ scheduled });

/** GET /:messageId/paid — buyers только автору и админам канала. */
export const paidResult = z.strictObject({
  attachments: z.array(anyJson),
  buyers: z.number().optional(),
});

export const paidLocked = z.strictObject({ error: z.string(), stars: z.number() });

export const unlockResult = z.strictObject({ attachments: z.array(anyJson), balance: z.number() });

export const notEnoughStars = z.strictObject({ error: z.string(), needStars: z.number(), balance: z.number() });

/** Опрос во вложении (sanitizeAttachments + votePoll). */
export const pollAttachment = z.strictObject({
  kind: z.literal("poll"),
  meta: z.strictObject({
    options: z.array(z.string()),
    voterIds: z.array(z.array(z.string())),
    votes: z.array(z.number()),
    correctIndex: z.number().nullable(),
    multiple: z.boolean(),
    closed: z.boolean(),
  }),
});

export const checklistAttachment = z.strictObject({
  kind: z.literal("checklist"),
  meta: z.strictObject({
    items: z.array(
      z.strictObject({ id: z.number(), text: z.string(), doneBy: z.string().optional(), doneAt: isoDate.optional() }),
    ),
    othersCanAdd: z.boolean(),
    othersCanMark: z.boolean(),
  }),
});

export const locationAttachment = z.strictObject({
  kind: z.literal("location"),
  meta: z.strictObject({
    lat: z.number(),
    lng: z.number(),
    live: z.literal(true).optional(),
    expiresAt: isoDate.optional(),
  }),
});

/** Заглушка платного поста вместо настоящих вложений (preparePaidMedia). */
export const paidPlaceholder = z.strictObject({
  kind: z.literal("paid"),
  meta: z.strictObject({
    stars: z.number(),
    count: z.number(),
    photos: z.number(),
    videos: z.number(),
    blur: z.string().nullable(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
});

/** WS: message:new / message:updated / message:deleted / message:read / thread:message. */
export const wsMessageNew = z.strictObject({
  type: z.literal("message:new"),
  chatId: z.string(),
  message,
  silent: z.literal(true).optional(),
});
export const wsMessageUpdated = z.strictObject({ type: z.literal("message:updated"), chatId: z.string(), message });
export const wsMessageDeleted = z.strictObject({ type: z.literal("message:deleted"), chatId: z.string(), id: z.string() });
export const wsMessageRead = z.strictObject({
  type: z.literal("message:read"),
  chatId: z.string(),
  readerId: z.string(),
  messageIds: z.array(z.string()),
  readAt: isoDate.optional(),
});
export const wsThreadMessage = z.strictObject({
  type: z.literal("thread:message"),
  chatId: z.string(),
  rootId: z.string(),
  message,
});
