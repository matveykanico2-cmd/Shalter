import type { commentsBody } from "@shalter/shared/schemas/channels";
import type { messageEnvelope } from "@shalter/shared/schemas/messages";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import type { Message } from "@/entities/message";

import { http } from "@/shared/api";

/** threadResult из @shalter/shared — с типом сообщения ленты. */
type Thread = { root: Message; replies: Message[] };

/** commentsBody из @shalter/shared — с типом сообщения ленты. */
export type PostComments = Omit<z.infer<typeof commentsBody>, "post" | "anchor" | "replies"> & { post: Message; anchor: Message; replies: Message[] };

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
  /** Комментарии к посту канала (GET /api/posts/:id/comments). */
  comments: (postId: string) =>
    queryOptions({
      queryKey: [...baseKey, "post", postId],
      queryFn: ({ signal }) => http.get<PostComments>(`/api/posts/${encodeURIComponent(postId)}/comments`, signal),
    }),
};

export const editReply = (chatId: string, id: string, text: string) =>
  http.patch<z.infer<typeof messageEnvelope>>(`${messagesPath(chatId)}/${encodeURIComponent(id)}`, { text });

export const deleteReply = (chatId: string, id: string) => http.delete<unknown>(`${messagesPath(chatId)}/${encodeURIComponent(id)}`, { forEveryone: true });
