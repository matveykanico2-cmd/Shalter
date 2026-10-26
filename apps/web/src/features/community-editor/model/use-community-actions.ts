import { useQueryClient } from "@tanstack/react-query";

import { chatQueries } from "@/entities/chat";
import { type Community, communityApi, communityQueries, setCommunityPanel, useCommunityPanel } from "@/entities/community";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, toast } from "@/shared/ui";

type Named = Pick<Community, "id" | "title">;
type ChatRef = { id: string; title: string | null; type: string };

/**
 * Общие действия с сообществом — removeChatFromCommunity, leaveCommunity, deleteCommunity и
 * addChatToCommunity из communityEditor.js: одни формулировки и обработка ошибок везде.
 */
export function useCommunityActions() {
  const client = useQueryClient();
  const panel = useCommunityPanel();
  /** Перечитать строки сообществ в списке чатов и карточку сообщества. */
  const refresh = async (id?: string) => {
    if (id) void client.invalidateQueries({ queryKey: communityQueries.detail(id).queryKey });
    await client.invalidateQueries({ queryKey: communityQueries.joined().queryKey }).catch(() => {});
  };
  const refreshChats = () => client.invalidateQueries({ queryKey: chatQueries.list().queryKey }).catch(() => {});

  return {
    refresh,
    refreshChats,
    /** Убрать чат с подтверждением; true — убран. */
    async removeChat(community: Named, chat: ChatRef) {
      if (!(await askConfirm(`Убрать «${chat.title}» из сообщества «${community.title}»? Сам чат и его участники останутся.`, { okLabel: "Убрать", danger: true }))) return false;
      try {
        await communityApi.removeChat(community.id, chat.id);
        toast(chat.type === "channel" ? "Канал убран из сообщества" : "Группа убрана из сообщества");
        void refresh(community.id);
        return true;
      } catch (err) {
        toast(errorText(err, "Не удалось убрать чат"), { error: true });
        return false;
      }
    },
    async leave(community: Named) {
      if (!(await askConfirm(`Покинуть сообщество «${community.title}»? Вы останетесь во всех его чатах, но они будут показываться отдельно.`, { okLabel: "Покинуть", danger: true }))) return false;
      try {
        await communityApi.leave(community.id);
        if (panel === community.id) setCommunityPanel(null);
        await refresh(community.id);
        return true;
      } catch (err) {
        toast(errorText(err, "Не удалось покинуть сообщество"), { error: true });
        return false;
      }
    },
    async remove(community: Named) {
      if (!(await askConfirm(`Удалить сообщество «${community.title}»? Это нельзя отменить. Сами группы и каналы останутся.`, { okLabel: "Удалить", danger: true }))) return false;
      try {
        await communityApi.remove(community.id);
        if (panel === community.id) setCommunityPanel(null);
        toast("Сообщество удалено");
        await refresh(community.id);
        return true;
      } catch (err) {
        toast(errorText(err, "Не удалось удалить сообщество"), { error: true });
        return false;
      }
    },
    /** Добавить свой чат: сразу или заявкой (режим «только админы»). */
    async addChat(community: Named, chat: ChatRef, visible: boolean) {
      try {
        const res = await communityApi.addChat(community.id, chat.id, visible);
        toast("requested" in res ? "Заявка отправлена администраторам сообщества" : chat.type === "channel" ? "Канал добавлен в сообщество" : "Группа добавлена в сообщество");
        void refresh(community.id);
        return res;
      } catch (err) {
        toast(errorText(err, "Не удалось добавить чат"), { error: true });
        return null;
      }
    },
  };
}
