// Отправка как sendOne в public/js/views/chatView.js: временный пузырь сразу, на ответ
// сервера — настоящее сообщение, на ошибку — пузырь убираем, текст возвращаем в поле.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { chatCache } from "@/entities/chat";
import { historyCache, type Message, messageQueries } from "@/entities/message";

import { sendMessage } from "../api/send-message";

let localSeq = 0;

export function useSendMessage(chatId: string, meId: string, channel: boolean) {
  const client = useQueryClient();
  return useCallback(
    async (text: string, replyTo: Message | null) => {
      const localId = `local_${++localSeq}_${Date.now()}`;
      historyCache.addPending(client, chatId, {
        id: localId,
        chatId,
        senderId: meId,
        type: "text",
        text,
        createdAt: new Date().toISOString(),
        pinned: false,
        replyToId: replyTo?.id ?? null,
        attachments: [],
        reactions: [],
        readByIds: [],
        deletedForIds: [],
        mentionedUserIds: [],
        views: null,
      });
      try {
        const { message } = await sendMessage(chatId, { text, replyToId: replyTo?.id ?? null, clientId: localId }, channel);
        historyCache.confirmPending(client, chatId, localId, message);
        chatCache.noteMessage(client, chatId, message);
        return message;
      } catch (err) {
        historyCache.dropPending(client, chatId, localId);
        throw err;
      } finally {
        // Сверка с сервером: заодно придут сообщения, отправленные, пока шёл запрос.
        void client.invalidateQueries({ queryKey: messageQueries.history(chatId).queryKey });
      }
    },
    [client, chatId, meId, channel]
  );
}
