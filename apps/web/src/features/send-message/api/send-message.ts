import type { sendResult } from "@shalter/shared/schemas/messages";
import type { z } from "zod";

import { http, type Uploaded } from "@/shared/api";

type SendResult = z.infer<typeof sendResult>;

const chatPath = (chatId: string) => `/api/chats/${encodeURIComponent(chatId)}`;

/** Вложение в отправке: загруженный файл (+ спойлер у фото и видео) или опрос, чек-лист, кубик. */
export type OutgoingAttachment =
  | (Uploaded & { spoiler?: true; durationSec?: number; waveform?: number[]; transcript?: string })
  | { kind: "poll" | "checklist" | "dice"; meta: Record<string, unknown> };

type Body = { text: string; replyToId: string | null; clientId: string; attachments?: OutgoingAttachment[] };

/**
 * Сообщение в чат (POST /api/chats/:id/messages) или пост канала (POST /api/posts/:id/publish).
 * clientId — метка отправки: повтор после обрыва сети сервер узнаёт и не создаёт дубль.
 */
export function sendMessage(chatId: string, body: Body, channel: boolean) {
  if (channel) return http.post<SendResult>(`/api/posts/${encodeURIComponent(chatId)}/publish`, { text: body.text, attachments: body.attachments ?? [], clientId: body.clientId });
  return http.post<SendResult>(`${chatPath(chatId)}/messages`, body.attachments?.length ? body : { text: body.text, replyToId: body.replyToId, clientId: body.clientId });
}

export const saveDraft = (chatId: string, text: string) => http.post<unknown>(`${chatPath(chatId)}/draft`, { text });

/** «Печатает» и другие действия (upload_photo…; cancel — закончил). */
export const sendTyping = (chatId: string, action = "typing") => http.post<unknown>(`${chatPath(chatId)}/typing`, { action });
