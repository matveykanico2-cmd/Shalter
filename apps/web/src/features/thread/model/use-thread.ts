import { type QueryKey, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import type { Message } from "@/entities/message";

import { useWsEvent } from "@/shared/api";

import { threadQueries } from "../api/thread";

/** Ветка группы или комментарии поста канала (их ветка — в группе обсуждения). */
export type ThreadSource = { kind: "thread"; chatId: string; root: Message } | { kind: "comments"; post: Message };

type WithReplies = { replies: Message[] };

/** Ветка с живыми событиями — как подписки в openThreadPanel (threadPanel.js). */
export function useThread(source: ThreadSource) {
  const client = useQueryClient();
  const thread = useQuery({ ...threadQueries.replies(source.kind === "thread" ? source.chatId : "", source.kind === "thread" ? source.root.id : ""), enabled: source.kind === "thread" });
  const comments = useQuery({ ...threadQueries.comments(source.kind === "comments" ? source.post.id : ""), enabled: source.kind === "comments" });
  const query = source.kind === "thread" ? thread : comments;
  // Где живут ответы: чат и корень ветки (у комментариев — группа обсуждения и якорь поста).
  const chatId = source.kind === "thread" ? source.chatId : (comments.data?.chat.id ?? "");
  const rootId = source.kind === "thread" ? source.root.id : (comments.data?.anchor.id ?? "");

  const kind = source.kind;
  const sourceChat = source.kind === "thread" ? source.chatId : "";
  const sourceId = source.kind === "thread" ? source.root.id : source.post.id;
  const setReplies = useCallback(
    (fn: (replies: Message[]) => Message[]) => {
      const key: QueryKey = kind === "thread" ? threadQueries.replies(sourceChat, sourceId).queryKey : threadQueries.comments(sourceId).queryKey;
      client.setQueryData<WithReplies>(key, (prev) => (prev ? { ...prev, replies: fn(prev.replies) } : prev));
    },
    [client, kind, sourceChat, sourceId]
  );
  /** Ответ из события или своей отправки — один раз. */
  const add = useCallback((m: Message) => setReplies((list) => (list.some((r) => r.id === m.id) ? list : [...list, m])), [setReplies]);
  const replace = useCallback((m: Message) => setReplies((list) => list.map((r) => (r.id === m.id ? m : r))), [setReplies]);
  const remove = useCallback((id: string) => setReplies((list) => list.filter((r) => r.id !== id)), [setReplies]);

  useWsEvent("thread:message", (e) => {
    if (chatId && e.chatId === chatId && e.rootId === rootId) add(e.message);
  });
  useWsEvent("message:updated", (e) => {
    if (chatId && e.chatId === chatId) replace(e.message);
  });
  useWsEvent("message:deleted", (e) => {
    if (chatId && e.chatId === chatId) remove(e.id);
  });

  return { query, replies: (query.data?.replies ?? []) as Message[], comments: comments.data ?? null, chatId, rootId, add, replace, remove };
}
