import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { chatQueries, openDm } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { toast } from "@/shared/ui";

type Person = { id: string; name: string; avatarColor?: string | null };

/** «Написать» в строке контакта: личка (найти или создать) — в список и открыть. */
export function useWriteTo() {
  const client = useQueryClient();
  const navigate = useNavigate();
  return async (user: Person) => {
    try {
      const { chat } = await openDm(user.id, user.name, user.avatarColor);
      if (!client.getQueryData(chatQueries.list().queryKey)?.some((c) => c.id === chat.id)) {
        await client.refetchQueries({ queryKey: chatQueries.list().queryKey }).catch(() => {});
      }
      void navigate(`/chat/${chat.id}`);
    } catch (err) {
      toast(errorText(err, "Не удалось открыть чат"), { error: true });
    }
  };
}
