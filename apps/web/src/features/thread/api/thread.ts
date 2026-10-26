import type { messageEnvelope } from "@shalter/shared/schemas/messages";
import type { publicUser } from "@shalter/shared/schemas/user";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import type { Message } from "@/entities/message";

import { http } from "@/shared/api";

/** threadResult из @shalter/shared — с типом сообщения ленты. */
type Thread = { root: Message; replies: Message[] };

/** commentsBody из @shalter/shared: пост, его якорь в группе обсуждения и ответы на якорь. */
export type PostComments = {
  post: Message;
  anchor: Message;
  chat: { id: string; title: string | null };
  members: z.infer<typeof publicUser>[];
  replies: Message[];
  canComment: boolean;
  commentPriceStars: number;
  commentPriceFree: boolean;
};

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
