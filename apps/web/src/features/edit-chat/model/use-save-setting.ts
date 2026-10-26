import type { ChatSummary } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { toast } from "@/shared/ui";

import { type ChatSettingsPatch, setChatSettings } from "../api/edit-chat";

import { useApplyChat } from "./use-apply-chat";

/** Флаг из POST /settings; выключенный сервер не присылает — поверх ответа то, что сохраняли. */
export function useSaveSetting(chat: ChatSummary) {
  const apply = useApplyChat(chat.id);
  return async (patch: ChatSettingsPatch) => {
    try {
      const { chat: updated } = await setChatSettings(chat.id, patch);
      apply({ ...updated, ...patch } as typeof updated);
    } catch (err) {
      toast(errorText(err, "Не удалось сохранить"), { error: true });
    }
  };
}
