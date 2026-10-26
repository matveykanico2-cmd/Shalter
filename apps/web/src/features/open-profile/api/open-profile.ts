import type { byUsernameBody as chatByUsernameBody, chatBody, joinPendingBody, previewBody } from "@shalter/shared/schemas/chats";
import type { byUsernameBody as userByUsernameBody } from "@shalter/shared/schemas/users";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type FoundUser = z.infer<typeof userByUsernameBody>["user"];
export type FoundChat = z.infer<typeof chatByUsernameBody>["chat"];
export type ChatPreview = z.infer<typeof previewBody>;

const handlePath = (handle: string) => encodeURIComponent(handle.replace(/^@/, ""));

export const findUserByUsername = (handle: string) => http.get<z.infer<typeof userByUsernameBody>>(`/api/users/by-username/${handlePath(handle)}`);

export const findChatByUsername = (handle: string) => http.get<z.infer<typeof chatByUsernameBody>>(`/api/chats/by-username/${handlePath(handle)}`);

/** Вступить в публичный чат: сразу — чат, с одобрением — заявка. */
export const joinPublicChat = (chatId: string) =>
  http.post<z.infer<typeof chatBody> | z.infer<typeof joinPendingBody>>(`/api/chats/${encodeURIComponent(chatId)}/join`);

/** /start с параметром — боту, открытому по ссылке ?start=… */
export const sendStart = (chatId: string, payload: string) => http.post<unknown>(`/api/chats/${encodeURIComponent(chatId)}/messages`, { text: `/start ${payload}`.trim() });

const baseKey = ["open-profile"] as const;

export const openProfileQueries = {
  baseKey,
  /** Публичный чат глазами ещё не вступившего (GET /api/chats/:id/preview). */
  preview: (chatId: string) =>
    queryOptions({
      queryKey: [...baseKey, "preview", chatId],
      queryFn: ({ signal }) => http.get<ChatPreview>(`/api/chats/${encodeURIComponent(chatId)}/preview`, signal),
      staleTime: 0,
    }),
};
