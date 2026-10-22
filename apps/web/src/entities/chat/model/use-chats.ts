import { useQuery } from "@tanstack/react-query";

import { chatQueries } from "../api/chat-queries";

export const useChats = () => useQuery(chatQueries.list());

export const useChatFolders = () => useQuery(chatQueries.folders());

/** Чат из списка (для шапки открытого чата, пока своих данных у экрана нет). */
export const useChatFromList = (chatId: string | undefined) =>
  useQuery({ ...chatQueries.list(), select: (chats) => chats.find((c) => c.id === chatId) ?? null });
