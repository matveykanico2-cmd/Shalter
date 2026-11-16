import type { chatBody, inviteCreateBody } from "@shalter/shared/schemas/chats";
import type { searchBody } from "@shalter/shared/schemas/search";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type NewChatFields = { title: string; avatarImage: string | null; avatarColor?: string | null; avatarEmoji?: string | null; memberIds: string[]; adminIds: string[]; description: string; isPublic: boolean; username: string | null };

const body = ({ title, avatarImage, avatarColor, avatarEmoji, memberIds, adminIds, description, isPublic, username }: NewChatFields) => ({
  title,
  avatarImage,
  ...(avatarColor ? { avatarColor } : {}),
  ...(avatarEmoji ? { avatarEmoji } : {}),
  memberIds,
  adminIds,
  description,
  isPublic,
  username,
});

export const createGroup = (fields: NewChatFields) => http.post<z.infer<typeof chatBody>>("/api/chats/groups", body(fields));

export const createChannel = (fields: NewChatFields) => http.post<z.infer<typeof chatBody>>("/api/chats/channels", body(fields));

export const searchPeople = (q: string) =>
  queryOptions({
    queryKey: ["create-chat", "people", q],
    queryFn: ({ signal }) => http.get<z.infer<typeof searchBody>>(`/api/search?q=${encodeURIComponent(q)}`, signal),
    staleTime: 10_000,
  });

/** Пригласительная ссылка частного чата — сразу после создания. */
export const inviteLink = (chatId: string) => http.post<z.infer<typeof inviteCreateBody>>(`/api/chats/${encodeURIComponent(chatId)}/invite`, { revoke: false });
