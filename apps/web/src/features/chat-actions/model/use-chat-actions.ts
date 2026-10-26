import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { chatCache, chatQueries, type ChatSummary, chatTitle } from "@/entities/chat";
import { messageQueries } from "@/entities/message";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, askText, toast } from "@/shared/ui";

import {
  adminDeleteBot,
  clearHistory,
  deleteChat,
  deleteChatForMe,
  leaveChat,
  muteChat,
  type MuteOptions,
  setChatArchived,
  setChatProtected,
} from "../api/chat-actions";

/** Действия меню чата — как обработчики renderHeader в public/js/views/chatView.js. */
export function useChatActions(chat: ChatSummary, meId: string) {
  const client = useQueryClient();
  const navigate = useNavigate();

  /** Чат больше не наш — из списка и на главную. */
  const drop = () => {
    chatCache.removeChat(client, chat.id);
    client.removeQueries({ queryKey: chatQueries.card(chat.id).queryKey });
    void navigate("/");
  };

  const mute = async (opts: MuteOptions) => {
    const before = { muted: chat.muted, mutedUntil: chat.mutedUntil };
    // Точное «до какого времени» пришлёт сервер; пока — просто «выключено».
    const muted = !("off" in opts);
    chatCache.patchChat(client, chat.id, { muted, mutedUntil: muted ? chat.mutedUntil : undefined });
    try {
      const { chat: updated } = await muteChat(chat.id, opts);
      chatCache.patchChat(client, chat.id, { muted: updated.muted, mutedUntil: updated.mutedUntil ?? undefined });
    } catch (err) {
      chatCache.patchChat(client, chat.id, before);
      toast(errorText(err, "Не удалось изменить уведомления"), { error: true });
    }
  };

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

  const toggleArchive = async () => {
    const archived = !chat.archived;
    chatCache.patchChat(client, chat.id, { archived });
    try {
      await setChatArchived(chat.id, archived);
    } catch (err) {
      chatCache.patchChat(client, chat.id, { archived: !archived });
      toast(errorText(err, "Не удалось изменить чат"), { error: true });
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

  return { mute, toggleProtect, toggleArchive, clear, remove, leave, moderateDelete, confirmModeratorWipe };
}
