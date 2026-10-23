import type { deleteResult, messageEnvelope, sendResult } from "@shalter/shared/schemas/messages";
import type { z } from "zod";

import type { Message } from "@/entities/message";

import { http } from "@/shared/api";

type Envelope = z.infer<typeof messageEnvelope>;

const messagePath = (chatId: string, id: string) => `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(id)}`;

export const editMessage = (chatId: string, id: string, text: string) => http.patch<Envelope>(messagePath(chatId, id), { text });

/** forEveryone: false — убрать только из своей переписки. */
export const deleteMessage = (chatId: string, id: string, forEveryone: boolean) =>
  http.delete<z.infer<typeof deleteResult>>(messagePath(chatId, id), { forEveryone });

/** Поставить или снять реакцию (повтор той же снимает). */
export const reactToMessage = (chatId: string, id: string, emoji: string) => http.post<Envelope>(`${messagePath(chatId, id)}/react`, { emoji });

export const pinMessage = (chatId: string, id: string, pinned: boolean) => http.post<Envelope>(`${messagePath(chatId, id)}/pin`, { pinned });

export type ForwardOrigin = { chatId: string; chatTitle: string; senderName: string };

/**
 * Переслать в чат — как handleForward в public/js/views/chatView.js: копия текста и
 * вложений с подписью, откуда она (голоса опроса не переносятся).
 */
export function forwardMessage(targetChatId: string, m: Message, origin: ForwardOrigin, hideAuthor: boolean) {
  const attachments = (m.attachments ?? []).map((a) => {
    const att = a as { kind?: string; meta?: Record<string, unknown> };
    return att.kind === "poll" ? { ...att, meta: { ...att.meta, voterIds: [], votes: [] } } : a;
  });
  return http.post<z.infer<typeof sendResult>>(`/api/chats/${encodeURIComponent(targetChatId)}/messages`, {
    text: m.text,
    attachments,
    ...(m.sticker ? { sticker: m.sticker } : {}),
    ...(m.customEmoji ? { customEmoji: m.customEmoji } : {}),
    forwardedFrom: { messageId: m.id, hideAuthor, chatId: origin.chatId, chatTitle: origin.chatTitle, senderId: m.senderId, senderName: origin.senderName },
  });
}
