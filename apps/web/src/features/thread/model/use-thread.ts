import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import type { Message } from "@/entities/message";

import { useWsEvent } from "@/shared/api";

import { threadQueries } from "../api/thread";

/** Ветка с живыми событиями — как подписки в openThreadPanel (threadPanel.js). */
export function useThread(chatId: string, rootId: string) {
  const client = useQueryClient();
  const options = threadQueries.replies(chatId, rootId);
  const query = useQuery(options);

  const setReplies = useCallback(
    (fn: (replies: Message[]) => Message[]) => client.setQueryData(options.queryKey, (prev) => (prev ? { ...prev, replies: fn(prev.replies) } : prev)),
    [client, options.queryKey]
  );
  /** Ответ из события или своей отправки — один раз. */
  const add = useCallback((m: Message) => setReplies((list) => (list.some((r) => r.id === m.id) ? list : [...list, m])), [setReplies]);
  const replace = useCallback((m: Message) => setReplies((list) => list.map((r) => (r.id === m.id ? m : r))), [setReplies]);
  const remove = useCallback((id: string) => setReplies((list) => list.filter((r) => r.id !== id)), [setReplies]);

  useWsEvent("thread:message", (e) => {
    if (e.chatId === chatId && e.rootId === rootId) add(e.message);
  });
  useWsEvent("message:updated", (e) => {
    if (e.chatId === chatId) replace(e.message);
  });
  useWsEvent("message:deleted", (e) => {
    if (e.chatId === chatId) remove(e.id);
  });

  return { query, add, replace, remove };
}
