import { queryOptions } from "@tanstack/react-query";

import { http } from "@/shared/api";

import type { ChatCard, ChatFolder, ChatSummary } from "../model/types";

const baseKey = ["chats"] as const;

export const chatQueries = {
  baseKey,
  /** Чаты пользователя (GET /api/chats); при старте кэш заполняет /api/bootstrap. */
  list: () =>
    queryOptions({
      queryKey: [...baseKey, "list"],
      queryFn: async ({ signal }) => (await http.get<{ chats: ChatSummary[] }>("/api/chats", signal)).chats,
    }),
  /** Папки чатов (GET /api/folders) — вкладки над списком. */
  folders: () =>
    queryOptions({
      queryKey: [...baseKey, "folders"],
      queryFn: async ({ signal }) => (await http.get<{ folders: ChatFolder[] }>("/api/folders", signal)).folders,
    }),
  /** Открытый чат: сам чат, участники, команды бота (GET /api/chats/:id). */
  card: (chatId: string) =>
    queryOptions({
      queryKey: [...baseKey, "card", chatId],
      queryFn: ({ signal }) => http.get<ChatCard>(`/api/chats/${encodeURIComponent(chatId)}`, signal),
    }),
};
