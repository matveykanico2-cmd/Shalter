import type { chatBody } from "@shalter/shared/schemas/chats";
import type { translateBody } from "@shalter/shared/schemas/integrations";
import type { deleteResult, messageEnvelope, readersResult, sendResult, summaryResult } from "@shalter/shared/schemas/messages";
import type { reportReason } from "@shalter/shared/schemas/reports";
import type { paidDeleteBody, starsInfoBody } from "@shalter/shared/schemas/stars";
import type { z } from "zod";

import type { Attachment, Message } from "@/entities/message";

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

export const votePoll = (chatId: string, id: string, optionIndex: number) => http.post<Envelope>(`${messagePath(chatId, id)}/vote`, { optionIndex });

export const retractVote = (chatId: string, id: string) => http.delete<Envelope>(`${messagePath(chatId, id)}/vote`);

export const closePoll = (chatId: string, id: string) => http.post<Envelope>(`${messagePath(chatId, id)}/poll/close`);

/** Отметить пункт ({ itemId }) или дописать пункты ({ add }). */
export const updateChecklist = (chatId: string, id: string, body: { itemId: number } | { add: string[] }) => http.post<Envelope>(`${messagePath(chatId, id)}/checklist`, body);

export const unlockPaidMedia = (chatId: string, id: string) => http.post<{ attachments: Attachment[]; balance: number }>(`${messagePath(chatId, id)}/unlock`);

/** Кто и во сколько прочитал — только автору, в группе. */
export const messageReaders = (chatId: string, id: string) => http.get<z.infer<typeof readersResult>>(`${messagePath(chatId, id)}/readers`);

export const summarizeMessage = (chatId: string, id: string) => http.get<z.infer<typeof summaryResult>>(`${messagePath(chatId, id)}/summary`);

/** Удалить сообщение собеседника в личке у обоих — за звёзды. */
export const paidDeleteMessage = (id: string) => http.post<z.infer<typeof paidDeleteBody>>(`/api/stars/delete/${encodeURIComponent(id)}`);

export const starsInfo = () => http.get<z.infer<typeof starsInfoBody>>("/api/stars");

export type ReportReason = z.infer<typeof reportReason>;

export const submitReport = (targetType: "message", targetId: string, reason: ReportReason, details: string) =>
  http.post<unknown>("/api/reports", { targetType, targetId, reason, details });

export const translateText = (text: string, target: string) => http.post<z.infer<typeof translateBody>>("/api/translate", { text, target });

export const saveTranslateLanguage = (translateLanguage: string) => http.patch<unknown>("/api/settings", { translateLanguage });

/** Личка с человеком — существующая или новая (POST /api/chats). */
export const openDm = (userId: string, title: string, avatarColor?: string | null) =>
  http.post<z.infer<typeof chatBody>>("/api/chats", { userId, title, avatarColor });

export const saveDraft = (chatId: string, text: string) => http.post<unknown>(`/api/chats/${encodeURIComponent(chatId)}/draft`, { text });
