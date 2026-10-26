// Участники в панели «Информация о чате» — как sortMembers/membersLine в public/js/components/infoPanel.js.
import { type ChatMember, type ChatSummary, isChatOwner } from "@/entities/chat";

import { plural } from "@/shared/lib/presence";

/** Владельцы, админы, модераторы, затем кто в сети и кто был недавно. */
export function sortMembers(chat: ChatSummary, members: readonly ChatMember[]) {
  const rank = (m: ChatMember) => (isChatOwner(chat, m.id) ? 0 : chat.adminIds.includes(m.id) ? 1 : chat.moderatorIds.includes(m.id) ? 2 : 3);
  return [...members].sort(
    (a, b) => rank(a) - rank(b) || (b.online ? 1 : 0) - (a.online ? 1 : 0) || String(b.lastSeen ?? "").localeCompare(String(a.lastSeen ?? ""))
  );
}

/** «5 участников, 2 в сети» / «120 подписчиков». */
export function membersLine(chat: ChatSummary, members: readonly ChatMember[]) {
  const count = chat.membersCount;
  const noun = chat.type === "channel" ? plural(count, "подписчик", "подписчика", "подписчиков") : plural(count, "участник", "участника", "участников");
  const online = members.filter((m) => m.online).length;
  return online > 1 && chat.type !== "channel" ? `${count} ${noun}, ${online} в сети` : `${count} ${noun}`;
}
