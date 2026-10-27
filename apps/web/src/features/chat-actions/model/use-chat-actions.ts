import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";

import { chatCache, chatQueries, type ChatSummary, chatTitle } from "@/entities/chat";
import { messageQueries } from "@/entities/message";
import { sessionQueries } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, askText, toast } from "@/shared/ui";

import {
  adminDeleteBot,
  clearHistory,
  deleteChat,
  deleteChatForMe,
  leaveChat,
  markChatRead,
  markChatUnread,
  type MuteOptions,
  setAutoDelete as patchAutoDelete,
  setChatPinned,
  setChatProtected,
  setUserBlocked,
} from "../api/chat-actions";

import { muteOptimistic, patchOptimistic as optimistic, toggleArchiveOptimistic } from "./optimistic";

/** Действия меню чата — как обработчики renderHeader в public/js/views/chatView.js. */
export function useChatActions(chat: ChatSummary, meId: string) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  /** Чат больше не наш — из списка, а если он открыт — на главную. */
  const drop = () => {
    chatCache.removeChat(client, chat.id);
    client.removeQueries({ queryKey: chatQueries.card(chat.id).queryKey });
    if (pathname === `/chat/${chat.id}`) void navigate("/");
  };

  const patchOptimistic = (patch: Partial<ChatSummary>, request: () => Promise<unknown>) => optimistic(client, chat, patch, request);

  const togglePin = () => patchOptimistic({ pinned: !chat.pinned }, () => setChatPinned(chat.id, !chat.pinned));

  const markUnread = () => patchOptimistic({ unread: true }, () => markChatUnread(chat.id));

  const markRead = async () => {
    chatCache.markRead(client, chat.id);
    try {
      await markChatRead(chat.id);
    } catch (err) {
      toast(errorText(err, "Не удалось отметить чат прочитанным"), { error: true });
    }
  };

  const mute = (opts: MuteOptions) => muteOptimistic(client, chat, opts);

  const toggleProtect = async () => {
    const enabled = !(chat.protectedBy ?? []).includes(meId);
    try {
      const { protectedBy } = await setChatProtected(chat.id, enabled);
      chatCache.patchChat(client, chat.id, { protectedBy });
    } catch (err) {
      // Premium-экрана в новом клиенте ещё нет — только объяснение («…доступен с Premium»).
      toast(errorText(err, "Не удалось изменить настройку"), { error: true });
    }
  };

  const toggleArchive = () => toggleArchiveOptimistic(client, chat);

  const setAutoDelete = async (seconds: number | null) => {
    try {
      const { chat: updated } = await patchAutoDelete(chat.id, seconds);
      chatCache.patchChat(client, chat.id, { autoDeleteSeconds: updated.autoDeleteSeconds });
    } catch (err) {
      toast(errorText(err, "Не удалось изменить автоудаление"), { error: true });
    }
  };

  /** Заблокировать собеседника в личке или снять блокировку — поле ввода меняется сразу. */
  const toggleBlock = async () => {
    const other = chat.otherUser;
    if (!other) return;
    const key = sessionQueries.current().queryKey;
    const setBlocked = (blocked: boolean) =>
      client.setQueryData(key, (s) => {
        if (!s?.user) return s;
        const ids = s.user.blockedUserIds.filter((id) => id !== other.id);
        return { ...s, user: { ...s.user, blockedUserIds: blocked ? [...ids, other.id] : ids } };
      });
    const blocked = !client.getQueryData(key)?.user?.blockedUserIds.includes(other.id);
    setBlocked(blocked);
    try {
      await setUserBlocked(other.id, blocked);
    } catch (err) {
      setBlocked(!blocked);
      toast(errorText(err, "Не удалось изменить блокировку"), { error: true });
    }
  };

  const clear = async (forEveryone: boolean) => {
    try {
      await clearHistory(chat.id, forEveryone);
    } catch (err) {
      toast(errorText(err, "Не удалось очистить историю"), { error: true });
      return;
    }
    // Сервер отдаёт историю уже без очищенного; превью в списке — со сверкой.
    void client.invalidateQueries({ queryKey: messageQueries.chatHistories(chat.id) });
    void client.invalidateQueries({ queryKey: chatQueries.list().queryKey });
  };

  const remove = async (forEveryone: boolean) => {
    try {
      if (forEveryone) await deleteChat(chat.id);
      else await deleteChatForMe(chat.id);
    } catch (err) {
      toast(errorText(err, "Не удалось удалить"), { error: true });
      return;
    }
    drop();
  };

  const leave = async () => {
    try {
      await leaveChat(chat.id);
    } catch (err) {
      toast(errorText(err, "Не удалось выйти из чата"), { error: true });
      return;
    }
    drop();
  };

  /** Модерация Shalter: группа, канал или бот — с причиной для владельца и журнала. */
  const moderateDelete = async () => {
    const what = chat.type === "channel" ? "канал" : chat.type === "group" ? "группу" : "бота";
    const reason = (await askText(`Удалить ${what} «${chatTitle(chat)}» за нарушение правил? Это необратимо.\n\nПричина — придёт владельцу и попадёт в журнал:`))?.trim();
    if (!reason) return;
    try {
      if (chat.type === "dm" && chat.otherUser) await adminDeleteBot(chat.otherUser.id, reason);
      else await deleteChat(chat.id, reason);
    } catch (err) {
      toast(errorText(err, "Не удалось удалить"), { error: true });
      return;
    }
    drop();
  };

  /** Удаление чужой группы целиком модератором — ещё одно подтверждение (как deleteChatDialog.js). */
  const confirmModeratorWipe = () => {
    const what = chat.type === "channel" ? "канал" : "группу";
    return askConfirm(
      `Удалить чужой ${what} «${chatTitle(chat)}» за нарушение правил? Все сообщения и файлы пропадут у всех, владельцу придёт уведомление. Это необратимо.`,
      { okLabel: "Удалить", danger: true }
    );
  };

  return { mute, toggleProtect, toggleArchive, togglePin, markRead, markUnread, setAutoDelete, toggleBlock, clear, remove, leave, moderateDelete, confirmModeratorWipe };
}
