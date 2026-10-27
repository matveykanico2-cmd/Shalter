import { queryOptions } from "@tanstack/react-query";

import { ApiError, http } from "@/shared/api";

import type { Attachment } from "../model/attachment";

export type PaidMediaState = { attachments: Attachment[] } | { locked: true };

/**
 * Содержимое платного поста (GET …/:messageId/paid): автору, админам и купившим — вложения,
 * остальным 402 — «закрыто». Открытие за звёзды кладёт ответ сюда же.
 */
export const paidMediaQuery = (chatId: string, messageId: string) =>
  queryOptions({
    queryKey: ["messages", "paid", messageId] as const,
    queryFn: async ({ signal }): Promise<PaidMediaState> => {
      try {
        return await http.get<{ attachments: Attachment[] }>(`/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/paid`, signal);
      } catch (err) {
        if (err instanceof ApiError && err.status === 402) return { locked: true };
        throw err;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
