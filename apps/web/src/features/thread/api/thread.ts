import type { messageEnvelope, sendResult } from "@shalter/shared/schemas/messages";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import type { Message } from "@/entities/message";

import { http } from "@/shared/api";

/** threadResult из @shalter/shared — с типом сообщения ленты. */
type Thread = { root: Message; replies: Message[] };

const messagesPath = (chatId: string) => `/api/chats/${encodeURIComponent(chatId)}/messages`;

const baseKey = ["thread"] as const;

export const threadQueries = {
  baseKey,
  /** Ветка ответов на сообщение (GET …/messages/:id/thread). */
  replies: (chatId: string, rootId: string) =>
    queryOptions({
      queryKey: [...baseKey, chatId, rootId],
      queryFn: ({ signal }) => http.get<Thread>(`${messagesPath(chatId)}/${encodeURIComponent(rootId)}/thread`, signal),
    }),
};

export const sendThreadReply = (chatId: string, rootId: string, text: string) =>
  http.post<z.infer<typeof sendResult>>(messagesPath(chatId), { text, threadRootId: rootId });

export const editReply = (chatId: string, id: string, text: string) =>
  http.patch<z.infer<typeof messageEnvelope>>(`${messagesPath(chatId)}/${encodeURIComponent(id)}`, { text });

export const deleteReply = (chatId: string, id: string) => http.delete<unknown>(`${messagesPath(chatId)}/${encodeURIComponent(id)}`, { forEveryone: true });
