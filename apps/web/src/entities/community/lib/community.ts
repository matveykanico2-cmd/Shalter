// Сообщество в списке чатов — как communityList.js: мои чаты сообщества, время
// последней активности, «без звука».
import { type ChatSummary, isChatMuted } from "@/entities/chat/@x/community";

import { plural } from "@/shared/lib/presence";

type WithChats = { chatIds: readonly string[] };

/** Чаты сообщества, в которых я состою, — из общего списка. */
export const memberChatsOf = (community: WithChats, chats: readonly ChatSummary[]) => chats.filter((c) => community.chatIds.includes(c.id));

/** Время самого свежего из моих чатов сообщества — по нему строка встаёт среди чатов. */
export function communityActivity(community: WithChats, chats: readonly ChatSummary[]) {
  return memberChatsOf(community, chats).reduce((max, c) => {
    const t = c.lastMessage?.createdAt ?? c.createdAt ?? "";
    return t > max ? t : max;
  }, "");
}

/** Сообщество «без звука», когда заглушены все мои его чаты. */
export function isCommunityMuted(community: WithChats, chats: readonly ChatSummary[]) {
  const mine = memberChatsOf(community, chats);
  return mine.length > 0 && mine.every(isChatMuted);
}

/** «5 участников» / «5 подписчиков» у чата сообщества. */
export const chatMembersLabel = (c: { type: string; members?: number | null }) => {
  const n = c.members ?? 0;
  return `${n} ${c.type === "channel" ? plural(n, "подписчик", "подписчика", "подписчиков") : plural(n, "участник", "участника", "участников")}`;
};

export const chatsCountLabel = (n: number) => `${n} ${plural(n, "чат", "чата", "чатов")}`;
export const communityMembersLabel = (n: number) => `${n} ${plural(n, "участник", "участника", "участников")}`;
