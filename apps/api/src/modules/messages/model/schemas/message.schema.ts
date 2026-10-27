import { z } from "zod";
import { raw, requestBody, requestQuery } from "../../../../common/lib/zod.js";

// Тексты ошибок — как в server/routes/messages.js. В схеме только проверки, которые там идут
// первыми (после поиска чата, его делает MemberChatGuard); проверки после поиска сообщения,
// прав и «пустое сообщение» (вложения чистит санитайзер из server/) — в сервисах.

/** Строка запроса: непустая строка, иначе null (`?x=` и `?x=a&x=b` — как без параметра). */
const queryString = () => z.unknown().optional().transform((v) => (typeof v === "string" && v ? v : null));

/** Сдвиг часового пояса в минутах; не число — 0. */
const tzOffset = () =>
  z.unknown().optional().transform((v) => {
    const tz = Number(v);
    return Number.isFinite(tz) ? tz : 0;
  });

/** Текст сообщения: строка, null или нет поля. */
const messageText = () => z.string({ error: "Некорректный текст" }).nullish();

/** Координата: Number(x), конечное число. */
const coordinate = () =>
  z
    .unknown()
    .optional()
    .transform((v) => Number(v))
    .refine(Number.isFinite, { error: "invalid coordinates" });

// Поля сообщения как пришли: их разбирают проверки отправки (MessageSendService.gate) и
// санитайзеры, общие с комментариями, отложенными сообщениями и ботами.
const messageFields = {
  text: raw(),
  attachments: raw(),
  sticker: raw(),
  customEmoji: raw(),
  forwardedFrom: raw(),
  replyToId: raw(),
  threadRootId: raw(),
  topicId: raw(),
  storyReply: raw(),
  anonymous: raw(),
  effect: raw(),
  silent: raw(),
  paidMedia: raw(),
  article: raw(),
};

// Общая форма отправки: ей же пишут комментарии к постам, где текст проверяется уже после
// поиска поста и бана, поэтому здесь текст не проверяется.
export const sendMessageSchema = requestBody({ ...messageFields, clientId: raw() });
export type SendMessageDto = z.infer<typeof sendMessageSchema>;

// Сообщение в чат (POST /api/chats/:id/messages): тип текста — первая проверка маршрута.
export const chatMessageSchema = requestBody({ ...messageFields, text: messageText(), clientId: raw() });
export type ChatMessageDto = z.infer<typeof chatMessageSchema>;

export const historyQuerySchema = requestQuery({
  limit: z.unknown().optional().transform((v) => Math.min(Math.max(Number(v) || 60, 1), 200)),
  before: queryString(),
  beforeId: queryString(),
  topic: queryString(),
});
export type HistoryQueryDto = z.infer<typeof historyQuerySchema>;

export const searchQuerySchema = requestQuery({ q: z.unknown().optional().transform((v) => String(v ?? "").trim().toLowerCase()) });
export type SearchQueryDto = z.infer<typeof searchQuerySchema>;

export const daysQuerySchema = requestQuery({
  month: z
    .unknown()
    .optional()
    .transform((v) => String(v ?? "").slice(0, 7))
    .refine((v) => /^\d{4}-\d{2}$/.test(v), { error: "Нужен месяц в виде ГГГГ-ММ" }),
  tz: tzOffset(),
});
export type DaysQueryDto = z.infer<typeof daysQuerySchema>;

export const atQuerySchema = requestQuery({
  day: z
    .unknown()
    .optional()
    .transform((v) => String(v ?? "").slice(0, 10))
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), { error: "Нужна дата в виде ГГГГ-ММ-ДД" }),
  tz: tzOffset(),
});
export type AtQueryDto = z.infer<typeof atQuerySchema>;

// Текст правки проверяется после поиска сообщения и проверки автора.
export const editMessageSchema = requestBody({ text: raw() });
export type EditMessageDto = z.infer<typeof editMessageSchema>;

export const deleteMessageSchema = requestBody({ forEveryone: z.unknown().optional().transform((v) => !!v) });
export type DeleteMessageDto = z.infer<typeof deleteMessageSchema>;

// pinned, emoji и optionIndex разбирает message-edits как пришли.
export const pinSchema = requestBody({ pinned: raw() });
export type PinDto = z.infer<typeof pinSchema>;

export const reactSchema = requestBody({ emoji: raw() });
export type ReactDto = z.infer<typeof reactSchema>;

export const voteSchema = requestBody({ optionIndex: raw() });
export type VoteDto = z.infer<typeof voteSchema>;

/** add — новые пункты (непустые, до 200 символов; не список — отметка пункта itemId). */
export const checklistSchema = requestBody({
  add: z
    .unknown()
    .optional()
    .transform((v) => (Array.isArray(v) ? v.map((t) => String(t ?? "").trim().slice(0, 200)).filter(Boolean) : undefined)),
  itemId: z.unknown().optional().transform((v) => Number(v)),
});
export type ChecklistDto = z.infer<typeof checklistSchema>;

export const locationSchema = requestBody({ lat: coordinate(), lng: coordinate() });
export type LocationDto = z.infer<typeof locationSchema>;

// Тип текста — первая проверка; «пустое», «в сети» (только в личке) и срок — в сервисе.
export const scheduleSchema = requestBody({ ...messageFields, text: messageText(), whenOnline: z.unknown().optional().transform((v) => v === true), sendAt: raw(), repeat: raw() });
export type ScheduleDto = z.infer<typeof scheduleSchema>;

// Правку проверяет сервис: сначала ищется само отложенное сообщение.
export const editScheduledSchema = requestBody({
  sendNow: z.unknown().optional().transform((v) => v === true),
  sendAt: raw(),
  text: raw(),
  repeat: raw(),
});
export type EditScheduledDto = z.infer<typeof editScheduledSchema>;
