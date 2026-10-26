// Сразу в списке, запрос — в фоне; не вышло — как было (patchChat в chatList.js). Общие для
// меню чата (useChatActions) и свайпов строки (useChatListActions).
import type { QueryClient } from "@tanstack/react-query";

import { chatCache, type ChatSummary } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { toast } from "@/shared/ui";

import { muteChat, type MuteOptions, setChatArchived } from "../api/chat-actions";

export async function patchOptimistic(client: QueryClient, chat: ChatSummary, patch: Partial<ChatSummary>, request: () => Promise<unknown>) {
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, chat[k as keyof ChatSummary]])) as Partial<ChatSummary>;
  chatCache.patchChat(client, chat.id, patch);
  try {
    await request();
  } catch (err) {
    chatCache.patchChat(client, chat.id, before);
    toast(errorText(err, "Не удалось изменить чат"), { error: true });
  }
}

export const toggleArchiveOptimistic = (client: QueryClient, chat: ChatSummary) =>
  patchOptimistic(client, chat, { archived: !chat.archived }, () => setChatArchived(chat.id, !chat.archived));

export async function muteOptimistic(client: QueryClient, chat: ChatSummary, opts: MuteOptions) {
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
}
