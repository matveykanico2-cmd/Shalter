import type { sendResult } from "@shalter/shared/schemas/messages";
import type { z } from "zod";

import { http } from "@/shared/api";

type SendResult = z.infer<typeof sendResult>;

const chatPath = (chatId: string) => `/api/chats/${encodeURIComponent(chatId)}`;

/**
 * Сообщение в чат (POST /api/chats/:id/messages) или пост канала (POST /api/posts/:id/publish).
 * clientId — метка отправки: повтор после обрыва сети сервер узнаёт и не создаёт дубль.
 */
export function sendMessage(chatId: string, body: { text: string; replyToId: string | null; clientId: string }, channel: boolean) {
  if (channel) return http.post<SendResult>(`/api/posts/${encodeURIComponent(chatId)}/publish`, { text: body.text, attachments: [], clientId: body.clientId });
  return http.post<SendResult>(`${chatPath(chatId)}/messages`, body);
}

export const saveDraft = (chatId: string, text: string) => http.post<unknown>(`${chatPath(chatId)}/draft`, { text });

export const sendTyping = (chatId: string) => http.post<unknown>(`${chatPath(chatId)}/typing`, { action: "typing" });
