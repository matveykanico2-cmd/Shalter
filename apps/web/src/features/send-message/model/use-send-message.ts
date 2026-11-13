// Отправка как sendOne в public/js/views/chatView.js: временный пузырь сразу, на ответ
// сервера — настоящее сообщение. Сообщения в ленту идут через очередь исходящих (outbox.ts):
// без сети и при сбоях сервера — повтор, хоть после перезапуска приложения; на отказ по
// существу — пузырь убираем, текст возвращаем в поле.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { type Message, messageQueries } from "@/entities/message";
import { settingsQueries } from "@/entities/settings";

import type { Sticker } from "@/shared/lib/anim";
import { playSentSound } from "@/shared/lib/media/sounds";

import { type OutgoingAttachment, sendComment, sendMessage, type SendOptions } from "../api/send-message";
import { retryOffline } from "../lib/retry-offline";

import { enqueue, newClientId, type OutboxEntry, type OutboxFile } from "./outbox";

/**
 * topicId — открытая тема группы; без неё ответ уходит в тему исходного сообщения.
 * threadRootId — ответ в ветке: в ленту чата он не попадает, временного пузыря нет.
 * postId — комментарий к посту канала: уходит через /api/posts/:id/comments.
 */
export function useSendMessage(chatId: string, meId: string, channel: boolean, topicId?: string | null, threadRootId?: string, postId?: string) {
  const client = useQueryClient();
  return useCallback(
    async (text: string, replyTo: Message | null, attachments: OutgoingAttachment[] = [], sticker?: Sticker, { files, extra, ...options }: SendOptions & { files?: OutboxFile[]; extra?: OutboxEntry["extra"] } = {}) => {
      const localId = newClientId();
      const topic = topicId ?? replyTo?.topicId ?? null;
      if (threadRootId) {
        try {
          const { message } = await retryOffline(() =>
            postId
              ? sendComment(postId, { text, clientId: localId, attachments, sticker, ...options })
              : sendMessage(chatId, { text, replyToId: null, clientId: localId, attachments, sticker, threadRootId, ...options }, false)
          );
          return message;
        } finally {
          // Счётчик «N ответов» под сообщением в ленте.
          void client.invalidateQueries({ queryKey: messageQueries.chatHistories(chatId) });
        }
      }
      const pending = {
        id: localId,
        chatId,
        senderId: meId,
        type: sticker ? "sticker" : options.article ? "article" : "text",
        ...(sticker ? { sticker } : {}),
        text,
        createdAt: new Date().toISOString(),
        pinned: false,
        replyToId: replyTo?.id ?? null,
        ...(topic ? { topicId: topic } : {}),
        ...(options.effect ? { effect: options.effect } : {}),
        attachments,
        reactions: [],
        readByIds: [],
        deletedForIds: [],
        mentionedUserIds: [],
        views: null,
      } satisfies Message;
      const body = { text, replyToId: replyTo?.id ?? null, clientId: localId, attachments, sticker, ...(topic ? { topicId: topic } : {}), ...options };
      try {
        // files — фото, видео, файлы: грузятся в фоне, пузырь с превью в ленте сразу.
        const message = await enqueue(client, { userId: meId, chatId, channel, body, pending, createdAt: Date.now(), ...(files?.length ? { files } : {}), ...(extra ? { extra } : {}) });
        // «Отправлено» — если звук в настройках не выключен (playSentSound в chatView.js).
        if ((client.getQueryData(settingsQueries.current().queryKey)?.notifications as { sound?: boolean } | undefined)?.sound !== false) playSentSound();
        return message;
      } finally {
        // Сверка с сервером: заодно придут сообщения, отправленные, пока шёл запрос.
        void client.invalidateQueries({ queryKey: messageQueries.chatHistories(chatId) });
      }
    },
    [client, chatId, meId, channel, topicId, threadRootId, postId]
  );
}
