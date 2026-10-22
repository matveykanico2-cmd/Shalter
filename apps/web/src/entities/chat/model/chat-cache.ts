// Правки списка чатов в кэше по событиям сокета — до того, как перезапрос сверит счётчики
// (как public/js/lib/chatListSync.js и обработчики в public/js/app.js).
import type { QueryClient } from "@tanstack/react-query";

import type { Message } from "@/entities/message/@x/chat";

import { chatQueries } from "../api/chat-queries";

import type { ChatSummary } from "./types";

type OtherUser = NonNullable<ChatSummary["otherUser"]>;

function updateChats(client: QueryClient, fn: (chats: ChatSummary[]) => ChatSummary[]) {
  client.setQueryData(chatQueries.list().queryKey, (chats) => (chats ? fn(chats) : chats));
}

export const chatCache = {
  /** Новое сообщение — сразу последним в превью (ответы в ветках и старые — нет). */
  noteMessage(client: QueryClient, chatId: string, message: Message) {
    if (!message.createdAt || message.threadRootId) return;
    updateChats(client, (chats) => {
      const target = chats.find((c) => c.id === chatId);
      if (!target || (target.lastMessage && target.lastMessage.createdAt > message.createdAt)) return chats;
      return chats.map((c) => (c.id === chatId ? { ...c, lastMessage: message } : c));
    });
  },

  /** Чат удалён или нас из него убрали. */
  removeChat(client: QueryClient, chatId: string) {
    updateChats(client, (chats) => (chats.some((c) => c.id === chatId) ? chats.filter((c) => c.id !== chatId) : chats));
  },

  /** «В сети», имя, аватарка собеседника в личках. */
  patchOtherUser(client: QueryClient, userId: string, patch: Partial<OtherUser>) {
    updateChats(client, (chats) =>
      chats.some((c) => c.otherUser?.id === userId)
        ? chats.map((c) => (c.otherUser?.id === userId ? { ...c, otherUser: { ...c.otherUser, ...patch } as OtherUser } : c))
        : chats
    );
  },

  isKnown(client: QueryClient, chatId: string) {
    return !!client.getQueryData(chatQueries.list().queryKey)?.some((c) => c.id === chatId);
  },
};
