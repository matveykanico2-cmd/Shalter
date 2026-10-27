import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { chatQueries, openDm } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { toast } from "@/shared/ui";

import { sendStart } from "../api/open-profile";

type Person = { id: string; name: string; avatarColor?: string | null; isBot?: boolean };

/** Личка с человеком или ботом: найти или создать, обновить список, открыть. */
export function useOpenDm() {
  const client = useQueryClient();
  const navigate = useNavigate();
  return async (user: Person, { replace = false, startPayload }: { replace?: boolean; startPayload?: string | null } = {}) => {
    try {
      const { chat } = await openDm(user.id, user.name, user.avatarColor);
      // Бот по ссылке ?start=… получает /start с параметром, как в Telegram.
      if (user.isBot && startPayload) await sendStart(chat.id, startPayload).catch(() => {});
      if (!client.getQueryData(chatQueries.list().queryKey)?.some((c) => c.id === chat.id)) {
        await client.refetchQueries({ queryKey: chatQueries.list().queryKey }).catch(() => {});
      }
      void navigate(`/chat/${chat.id}`, { replace });
      return true;
    } catch (err) {
      toast(errorText(err, "Не удалось открыть чат"), { error: true });
      return false;
    }
  };
}
