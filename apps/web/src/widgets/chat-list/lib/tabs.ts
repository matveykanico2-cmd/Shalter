// Вкладки над списком: системные и папки пользователя (public/js/views/chatList.js).
import type { ChatFolder, ChatSummary } from "@/entities/chat";

export const SYSTEM_TABS = [
  { id: "all", name: "Все" },
  { id: "personal", name: "Личные" },
  { id: "groups", name: "Группы" },
  { id: "channels", name: "Каналы" },
] as const;

export type Tab = { id: string; name: string };

export const tabsFor = (folders: readonly ChatFolder[]): Tab[] => [...SYSTEM_TABS, ...folders.map((f) => ({ id: f.id, name: f.name }))];

/** Чаты вкладки без архивных. */
export function chatsInTab(tabId: string, chats: readonly ChatSummary[], folders: readonly ChatFolder[]) {
  const notArchived = chats.filter((c) => !c.archived);
  const folder = folders.find((f) => f.id === tabId);
  if (folder) return notArchived.filter((c) => folder.chatIds.includes(c.id));
  if (tabId === "personal") return notArchived.filter((c) => c.type === "dm" || c.type === "bot");
  if (tabId === "groups") return notArchived.filter((c) => c.type === "group");
  if (tabId === "channels") return notArchived.filter((c) => c.type === "channel");
  return notArchived;
}

export function emptyTextFor(tabId: string, folders: readonly ChatFolder[]) {
  const folder = folders.find((f) => f.id === tabId);
  if (folder) return `В папке «${folder.name}» пока нет чатов`;
  if (tabId === "personal") return "Личных переписок пока нет";
  if (tabId === "groups") return "Вы пока не состоите ни в одной группе";
  if (tabId === "channels") return "Вы пока не подписаны ни на один канал";
  return "Чатов нет — начните новый кнопкой в правом нижнем углу";
}
