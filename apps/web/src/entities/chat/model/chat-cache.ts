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

  /** Изменили последнее сообщение чата — превью тоже (правка, реакция). */
  patchLastMessage(client: QueryClient, chatId: string, id: string, patch: Partial<Message>) {
    updateChats(client, (chats) =>
      chats.some((c) => c.id === chatId && c.lastMessage?.id === id)
        ? chats.map((c) => (c.id === chatId && c.lastMessage ? { ...c, lastMessage: { ...c.lastMessage, ...patch } } : c))
        : chats
    );
  },

  /** Удалили последнее сообщение — в превью встаёт предыдущее (null — его не знаем, ждём сверку). */
  dropLastMessage(client: QueryClient, chatId: string, id: string, previous: Message | null) {
    updateChats(client, (chats) =>
      chats.some((c) => c.id === chatId && c.lastMessage?.id === id) ? chats.map((c) => (c.id === chatId ? { ...c, lastMessage: previous } : c)) : chats
    );
  },

  /** Чат открыт — его непрочитанные прочитаны (сервер отметил их запросом истории). */
  markRead(client: QueryClient, chatId: string) {
    updateChats(client, (chats) =>
      chats.some((c) => c.id === chatId && (c.unreadCount > 0 || c.unread || c.hasUnreadMention))
        ? chats.map((c) => (c.id === chatId ? { ...c, unreadCount: 0, unread: undefined, hasUnreadMention: false } : c))
        : chats
    );
  },

  /** Черновик поля ввода — «Черновик: …» в строке списка. */
  setDraft(client: QueryClient, chatId: string, draft: string) {
    updateChats(client, (chats) =>
      chats.some((c) => c.id === chatId && (c.draft ?? "") !== draft) ? chats.map((c) => (c.id === chatId ? { ...c, draft: draft || null } : c)) : chats
    );
    // И в карточке открытого чата: из неё поле ввода берёт черновик при следующем открытии.
    client.setQueryData(chatQueries.card(chatId).queryKey, (card) =>
      card && (card.chat.draft ?? "") !== draft ? { ...card, chat: { ...card.chat, draft: draft || null } } : card
    );
  },

  /** Изменили сам чат (звук, архив, запрет пересылки, темы) — в списке и в открытой карточке. */
  patchChat(client: QueryClient, chatId: string, patch: Partial<ChatSummary>) {
    updateChats(client, (chats) => (chats.some((c) => c.id === chatId) ? chats.map((c) => (c.id === chatId ? { ...c, ...patch } : c)) : chats));
    client.setQueryData(chatQueries.card(chatId).queryKey, (card) => (card ? { ...card, chat: { ...card.chat, ...patch } } : card));
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

  /** «В сети» участника или собеседника в открытом чате (карточка GET /api/chats/:id). */
  patchCardUser(client: QueryClient, chatId: string, userId: string, patch: { online?: boolean; lastSeen?: string }) {
    client.setQueryData(chatQueries.card(chatId).queryKey, (card) => {
      if (!card) return card;
      const inMembers = card.members.some((u) => u.id === userId);
      const isOther = card.chat.otherUser?.id === userId;
      if (!inMembers && !isOther) return card;
      return {
        ...card,
        chat: isOther ? { ...card.chat, otherUser: { ...card.chat.otherUser, ...patch } as OtherUser } : card.chat,
        members: inMembers ? card.members.map((u) => (u.id === userId ? { ...u, ...patch } : u)) : card.members,
      };
    });
  },

  isKnown(client: QueryClient, chatId: string) {
    return !!client.getQueryData(chatQueries.list().queryKey)?.some((c) => c.id === chatId);
  },
};
