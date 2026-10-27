import { http } from "@/shared/api";

export const subscribeChannel = (chatId: string) => http.post<unknown>(`/api/channels/${encodeURIComponent(chatId)}/subscribe`, {});

export const leaveChannel = (chatId: string) => http.post<unknown>(`/api/chats/${encodeURIComponent(chatId)}/leave`);
