import type { chatBody, muteBody, protectBody } from "@shalter/shared/schemas/chats";
import type { blockBody } from "@shalter/shared/schemas/users";
import type { z } from "zod";

import { http } from "@/shared/api";

export type MuteOptions = { hours: number } | { forever: true } | { off: true };

const chatPath = (chatId: string) => `/api/chats/${encodeURIComponent(chatId)}`;

export const muteChat = (chatId: string, opts: MuteOptions) => http.post<z.infer<typeof muteBody>>(`${chatPath(chatId)}/mute`, opts);

export const setChatProtected = (chatId: string, enabled: boolean) => http.post<z.infer<typeof protectBody>>(`${chatPath(chatId)}/protect`, { enabled });

export const setChatArchived = (chatId: string, archived: boolean) => http.patch<unknown>(chatPath(chatId), { archived });

/** null — автоудаление выключено. */
export const setAutoDelete = (chatId: string, autoDeleteSeconds: number | null) => http.patch<z.infer<typeof chatBody>>(chatPath(chatId), { autoDeleteSeconds });

export const setUserBlocked = (userId: string, blocked: boolean) => http.post<z.infer<typeof blockBody>>(`/api/users/${encodeURIComponent(userId)}/block`, { blocked });

export const clearHistory = (chatId: string, forEveryone: boolean) => http.post<unknown>(`${chatPath(chatId)}/clear`, { forEveryone });

/** reason — удаление модератором Shalter за нарушение. */
export const deleteChat = (chatId: string, reason?: string) => http.delete<unknown>(chatPath(chatId), reason ? { reason } : undefined);

export const deleteChatForMe = (chatId: string) => http.post<unknown>(`${chatPath(chatId)}/delete-for-me`);

export const leaveChat = (chatId: string) => http.post<unknown>(`${chatPath(chatId)}/leave`);

/** Бот — не чат: модератор удаляет его самого. */
export const adminDeleteBot = (userId: string, reason: string) => http.delete<unknown>(`/api/admin/bots/${encodeURIComponent(userId)}`, { reason });
