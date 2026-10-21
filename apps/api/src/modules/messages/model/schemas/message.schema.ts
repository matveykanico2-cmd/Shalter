import { z } from "zod";
import { raw, requestBody, requestQuery } from "../../../../common/lib/zod.js";

// Поля сообщения как пришли: проверки и тексты ошибок — в сервисе, как в server/routes/messages.js.
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
};

export const sendMessageSchema = requestBody({ ...messageFields, clientId: raw() });
export type SendMessageDto = z.infer<typeof sendMessageSchema>;

export const historyQuerySchema = requestQuery({ limit: raw(), before: raw(), beforeId: raw(), topic: raw() });
export type HistoryQueryDto = z.infer<typeof historyQuerySchema>;

export const searchQuerySchema = requestQuery({ q: raw() });
export type SearchQueryDto = z.infer<typeof searchQuerySchema>;

export const daysQuerySchema = requestQuery({ month: raw(), tz: raw() });
export type DaysQueryDto = z.infer<typeof daysQuerySchema>;

export const atQuerySchema = requestQuery({ day: raw(), tz: raw() });
export type AtQueryDto = z.infer<typeof atQuerySchema>;

export const editMessageSchema = requestBody({ text: raw() });
export type EditMessageDto = z.infer<typeof editMessageSchema>;

export const deleteMessageSchema = requestBody({ forEveryone: raw() });
export type DeleteMessageDto = z.infer<typeof deleteMessageSchema>;

export const pinSchema = requestBody({ pinned: raw() });
export type PinDto = z.infer<typeof pinSchema>;

export const reactSchema = requestBody({ emoji: raw() });
export type ReactDto = z.infer<typeof reactSchema>;

export const voteSchema = requestBody({ optionIndex: raw() });
export type VoteDto = z.infer<typeof voteSchema>;

export const checklistSchema = requestBody({ add: raw(), itemId: raw() });
export type ChecklistDto = z.infer<typeof checklistSchema>;

export const locationSchema = requestBody({ lat: raw(), lng: raw() });
export type LocationDto = z.infer<typeof locationSchema>;

export const scheduleSchema = requestBody({ ...messageFields, whenOnline: raw(), sendAt: raw(), repeat: raw() });
export type ScheduleDto = z.infer<typeof scheduleSchema>;

export const editScheduledSchema = requestBody({ sendNow: raw(), sendAt: raw(), text: raw(), repeat: raw() });
export type EditScheduledDto = z.infer<typeof editScheduledSchema>;
