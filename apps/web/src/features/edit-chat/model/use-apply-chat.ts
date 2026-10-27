import type { chat } from "@shalter/shared/schemas/chat";
import { useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";

import { chatCache } from "@/entities/chat";

import { chatSettingsPatch } from "../lib/chat-fields";

/** Ответ сервера с чатом — сразу в список и карточку открытого чата. */
export function useApplyChat(chatId: string) {
  const client = useQueryClient();
  return (updated: z.infer<typeof chat>) => chatCache.patchChat(client, chatId, chatSettingsPatch(updated));
}
