import type { chatBody, inviteCreateBody } from "@shalter/shared/schemas/chats";
import type { z } from "zod";

import { http } from "@/shared/api";

export type NewChatFields = { title: string; avatarImage: string | null; memberIds: string[]; adminIds: string[]; description: string; isPublic: boolean; username: string | null };

const body = ({ title, avatarImage, memberIds, adminIds, description, isPublic, username }: NewChatFields) => ({ title, avatarImage, memberIds, adminIds, description, isPublic, username });

export const createGroup = (fields: NewChatFields) => http.post<z.infer<typeof chatBody>>("/api/chats/groups", body(fields));

export const createChannel = (fields: NewChatFields) => http.post<z.infer<typeof chatBody>>("/api/chats/channels", body(fields));

/** Пригласительная ссылка частного чата — сразу после создания. */
export const inviteLink = (chatId: string) => http.post<z.infer<typeof inviteCreateBody>>(`/api/chats/${encodeURIComponent(chatId)}/invite`, { revoke: false });
