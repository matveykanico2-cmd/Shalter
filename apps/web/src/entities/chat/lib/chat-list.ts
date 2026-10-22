// Порядок, звук, непрочитанное, подписи строки — как public/js/lib/chatSort.js и
// public/js/components/chatListItem.js.
import { callLogInfo, messagePreview, stripCustomEmoji } from "@/entities/message/@x/chat";

import type { ChatSummary } from "../model/types";

/** Закреплённые сверху (в своём порядке), дальше — по времени последнего сообщения. */
export function sortChats(list: readonly ChatSummary[]) {
  return [...list].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned && b.pinned) {
      const ao = a.pinOrder ?? Infinity;
      const bo = b.pinOrder ?? Infinity;
      if (ao !== bo) return ao - bo;
    }
    const at = a.lastMessage?.createdAt ?? a.createdAt ?? "";
    const bt = b.lastMessage?.createdAt ?? b.createdAt ?? "";
    return bt.localeCompare(at);
  });
}

/** Выключенный на время звук сам включается по истечении срока. */
export function isChatMuted(chat: Pick<ChatSummary, "muted" | "mutedUntil">, now = Date.now()) {
  if (chat.mutedUntil) return new Date(chat.mutedUntil).getTime() > now;
  return !!chat.muted;
}

export function hasUnread(chat: ChatSummary) {
  return chat.unreadCount > 0 || !!chat.hasUnreadMention || !!chat.unread;
}

export function chatTitle(chat: ChatSummary) {
  return (chat.type === "dm" ? (chat.otherUser?.name ?? chat.title) : chat.title) ?? "";
}

// Форматтеры — один раз: время есть у каждой строки списка.
const TIME_FORMAT = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
const DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" });

/** Сегодня — время, раньше — дата. */
export function timeLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  return (d.toDateString() === now.toDateString() ? TIME_FORMAT : DATE_FORMAT).format(d);
}

/** Строка превью: черновик, «Вы: …», звонок, системное. */
export function chatPreview(chat: ChatSummary, meId: string) {
  if (typeof chat.draft === "string" && chat.draft) return { draft: true, who: "", text: stripCustomEmoji(chat.draft) };
  const m = chat.lastMessage;
  if (!m) return { draft: false, who: "", text: "Нет сообщений" };
  if (m.type === "system") return { draft: false, who: "", text: stripCustomEmoji(m.text) };
  if (m.type === "call") return { draft: false, who: "", text: `📞 ${callLogInfo(m, m.senderId === meId).title}` };
  return { draft: false, who: m.senderId === meId && !chat.isSaved ? "Вы: " : "", text: messagePreview(m) };
}
