import type { Chat, Message, PublicUser } from "../types";
import { listAllMessages } from "./messages";
import { listUsers } from "./users";
import { publicUser } from "./sanitize";

export interface ChatSummary extends Chat {
  lastMessage: Message | null;
  unreadCount: number;
  otherUser: PublicUser | null; // for dm/secret chats
  typingHint?: never;
}

export async function attachSummaries(chats: Chat[], userId: string): Promise<ChatSummary[]> {
  const [allMessages, users] = await Promise.all([listAllMessages(), listUsers()]);

  return chats.map((chat) => {
    const msgs = allMessages
      .filter((m) => m.chatId === chat.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const lastMessage = msgs.length ? msgs[msgs.length - 1] : null;
    const unreadCount = msgs.filter(
      (m) => !m.readByIds.includes(userId) && m.senderId !== userId
    ).length;
    const otherUserId =
      (chat.type === "dm" || chat.type === "secret" || chat.type === "bot") &&
      chat.memberIds.find((id) => id !== userId);
    const otherUserRaw = otherUserId ? users.find((u) => u.id === otherUserId) : undefined;
    const otherUser = otherUserRaw ? publicUser(otherUserRaw) : null;

    return { ...chat, lastMessage, unreadCount, otherUser };
  });
}
