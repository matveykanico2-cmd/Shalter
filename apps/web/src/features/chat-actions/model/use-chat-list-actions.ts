// Действия над строками списка без открытого меню: свайп, «Прочитать все», порядок
// закреплённых — patchChat, markReadLocally и reorderPinned в public/js/views/chatList.js.
import { useQueryClient } from "@tanstack/react-query";

import { chatCache, chatQueries, type ChatSummary, hasUnread, isChatMuted, sortChats } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { toast } from "@/shared/ui";

import { markChatRead, muteChat, setChatArchived, setPinnedOrder } from "../api/chat-actions";

export function useChatListActions() {
  const client = useQueryClient();

  /** Свайп «Без звука» / «Со звуком» — навсегда или снять. */
  const toggleMute = async (chat: ChatSummary) => {
    const muted = !isChatMuted(chat);
    const before = { muted: chat.muted, mutedUntil: chat.mutedUntil };
    chatCache.patchChat(client, chat.id, { muted, mutedUntil: undefined });
    try {
      const { chat: updated } = await muteChat(chat.id, muted ? { forever: true } : { off: true });
      chatCache.patchChat(client, chat.id, { muted: updated.muted, mutedUntil: updated.mutedUntil ?? undefined });
    } catch (err) {
      chatCache.patchChat(client, chat.id, before);
      toast(errorText(err, "Не удалось изменить уведомления"), { error: true });
    }
  };

  /** Свайп «В архив» / «Из архива». */
  const toggleArchive = async (chat: ChatSummary) => {
    chatCache.patchChat(client, chat.id, { archived: !chat.archived });
    try {
      await setChatArchived(chat.id, !chat.archived);
    } catch (err) {
      chatCache.patchChat(client, chat.id, { archived: chat.archived });
      toast(errorText(err, "Не удалось изменить чат"), { error: true });
    }
  };

  /** «Прочитать все» во вкладке: сразу в списке, запросы — в фоне. */
  const readAll = async (chats: readonly ChatSummary[]) => {
    const unread = chats.filter(hasUnread);
    for (const c of unread) chatCache.markRead(client, c.id);
    await Promise.all(unread.map((c) => markChatRead(c.id).catch(() => {})));
  };

  /** Перетащили закреплённый чат на место другого (до него или после). */
  const reorderPinned = async (movedId: string, targetId: string, after: boolean) => {
    const key = chatQueries.list().queryKey;
    const before = client.getQueryData(key);
    if (!before) return;
    const ids = sortChats(before.filter((c) => c.pinned))
      .map((c) => c.id)
      .filter((id) => id !== movedId);
    const at = ids.indexOf(targetId);
    if (at < 0) return;
    ids.splice(after ? at + 1 : at, 0, movedId);
    const order = new Map(ids.map((id, i) => [id, i]));
    client.setQueryData(key, before.map((c) => (order.has(c.id) ? { ...c, pinOrder: order.get(c.id) ?? null } : c)));
    try {
      await setPinnedOrder(ids);
    } catch (err) {
      client.setQueryData(key, before);
      toast(errorText(err, "Не удалось изменить порядок"), { error: true });
    }
  };

  return { toggleMute, toggleArchive, readAll, reorderPinned };
}
