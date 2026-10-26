import type { Message } from "@/entities/message";

import { http } from "@/shared/api";

/** Сообщения чата с этим текстом (GET /api/chats/:id/messages/search, до 50). */
export const searchInChat = (chatId: string, q: string, signal?: AbortSignal) =>
  http.get<{ messages: Message[] }>(`/api/chats/${encodeURIComponent(chatId)}/messages/search?q=${encodeURIComponent(q)}`, signal);
