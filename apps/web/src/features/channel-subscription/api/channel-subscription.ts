import { http } from "@/shared/api";

export const subscribeChannel = (chatId: string) => http.post<unknown>(`/api/channels/${encodeURIComponent(chatId)}/subscribe`, {});

export const leaveChannel = (chatId: string) => http.post<unknown>(`/api/chats/${encodeURIComponent(chatId)}/leave`);

/** Вступить в группу (или подать заявку, если вход по одобрению). */
export const joinChat = (chatId: string) => http.post<{ pending?: boolean } | object>(`/api/chats/${encodeURIComponent(chatId)}/join`);
