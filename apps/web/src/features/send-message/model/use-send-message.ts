// Отправка как sendOne в public/js/views/chatView.js: временный пузырь сразу, на ответ
// сервера — настоящее сообщение, на ошибку — пузырь убираем, текст возвращаем в поле.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { chatCache } from "@/entities/chat";
import { historyCache, type Message, messageQueries } from "@/entities/message";

import type { Sticker } from "@/shared/lib/anim";

import { type OutgoingAttachment, sendMessage } from "../api/send-message";

let localSeq = 0;

/** topicId — открытая тема группы; без неё ответ уходит в тему исходного сообщения. */
export function useSendMessage(chatId: string, meId: string, channel: boolean, topicId?: string | null) {
  const client = useQueryClient();
  return useCallback(
    async (text: string, replyTo: Message | null, attachments: OutgoingAttachment[] = [], sticker?: Sticker) => {
      const localId = `local_${++localSeq}_${Date.now()}`;
      const topic = topicId ?? replyTo?.topicId ?? null;
      historyCache.addPending(client, chatId, {
        id: localId,
        chatId,
        senderId: meId,
        type: sticker ? "sticker" : "text",
        ...(sticker ? { sticker } : {}),
        text,
        createdAt: new Date().toISOString(),
        pinned: false,
        replyToId: replyTo?.id ?? null,
        ...(topic ? { topicId: topic } : {}),
        attachments,
        reactions: [],
        readByIds: [],
        deletedForIds: [],
        mentionedUserIds: [],
        views: null,
      });
      try {
        const { message } = await sendMessage(chatId, { text, replyToId: replyTo?.id ?? null, clientId: localId, attachments, sticker, ...(topic ? { topicId: topic } : {}) }, channel);
        historyCache.confirmPending(client, chatId, localId, message);
        chatCache.noteMessage(client, chatId, message);
        return message;
      } catch (err) {
        historyCache.dropPending(client, chatId, localId);
        throw err;
      } finally {
        // Сверка с сервером: заодно придут сообщения, отправленные, пока шёл запрос.
        void client.invalidateQueries({ queryKey: messageQueries.chatHistories(chatId) });
      }
    },
    [client, chatId, meId, channel, topicId]
  );
}
