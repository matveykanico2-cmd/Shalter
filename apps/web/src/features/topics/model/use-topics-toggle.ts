import { useQueryClient } from "@tanstack/react-query";

import { chatCache, type ChatSummary, isChatAdmin } from "@/entities/chat";
import { topicQueries } from "@/entities/topic";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, type MenuItem, toast } from "@/shared/ui";

import { setTopicsEnabled } from "../api/topics";

/** «Включить/Выключить темы» в меню чата — админу группы (как renderHeader в chatView.js). */
export function useTopicsToggle(chat: ChatSummary, meId: string): MenuItem | null {
  const client = useQueryClient();
  if (chat.type !== "group" || !isChatAdmin(chat, meId)) return null;
  const toggle = async () => {
    const enabled = !chat.topicsEnabled;
    if (!enabled && !(await askConfirm("Выключить темы? Сообщения останутся, но будут показаны одной лентой."))) return;
    try {
      const res = await setTopicsEnabled(chat.id, enabled);
      client.setQueryData(topicQueries.list(chat.id).queryKey, { enabled: res.enabled, topics: res.topics });
      chatCache.patchChat(client, chat.id, { topicsEnabled: res.chat.topicsEnabled });
    } catch (err) {
      toast(errorText(err, "Не удалось изменить настройку"), { error: true });
    }
  };
  return { icon: "Folder", label: chat.topicsEnabled ? "Выключить темы" : "Включить темы", onClick: () => void toggle() };
}
