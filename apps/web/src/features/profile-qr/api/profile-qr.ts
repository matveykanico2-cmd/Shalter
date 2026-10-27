import { http, type Uploaded } from "@/shared/api";

/** Ссылка на профиль с картинкой кода — в чат. */
export const sendQrToChat = (chatId: string, url: string, image: Uploaded) =>
  http.post<unknown>(`/api/chats/${encodeURIComponent(chatId)}/messages`, { text: url, attachments: [image] });
