import type { chatBody } from "@shalter/shared/schemas/chats";
import type { z } from "zod";

import { http } from "@/shared/api";

/** promote/demote, mod/unmod, owner/unowner, transfer, add, kick, ban. */
export type MemberRole = "promote" | "demote" | "mod" | "unmod" | "owner" | "unowner" | "transfer" | "add" | "kick" | "ban";

const chatPath = (chatId: string) => `/api/chats/${encodeURIComponent(chatId)}`;

export const setMemberRole = (chatId: string, userId: string, role: MemberRole) =>
  http.post<z.infer<typeof chatBody>>(`${chatPath(chatId)}/members`, { userId, role });

/** Пустой тег — обычная роль. */
export const setMemberTitle = (chatId: string, userId: string, title: string) =>
  http.post<z.infer<typeof chatBody>>(`${chatPath(chatId)}/title`, { userId, title });

/** until: ISO-время, "forever" или null — снова может писать. */
export const restrictMember = (chatId: string, userId: string, until: string | null) =>
  http.post<z.infer<typeof chatBody>>(`${chatPath(chatId)}/restrict`, { userId, until });

