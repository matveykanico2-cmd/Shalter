import { type ChatSummary, isChatAdmin, isChatModerator } from "@/entities/chat";

/** Админы и модераторы группы управляют всеми темами. */
export const isTopicStaff = (chat: ChatSummary, meId: string) => isChatAdmin(chat, meId) || isChatModerator(chat, meId);

/** Создавать темы — админам и модераторам, остальным — если не запрещено правом createTopics. */
export function canCreateTopics(chat: ChatSummary, meId: string) {
  const perms = (chat.permissions ?? {}) as { createTopics?: boolean };
  return isTopicStaff(chat, meId) || perms.createTopics !== false;
}
