import { useCallback, useState } from "react";

import type { FeedMessage } from "@/entities/message";

type State = { key: string; since: number; done: ReadonlySet<string> };

/**
 * Какие сообщения «въезжают» в ленту (message-entrance в public/styles/components.css):
 * только пришедшие после первой загрузки истории и только один раз. История при
 * открытии, подгрузка старых страниц и строки, которые виртуализатор смонтировал
 * заново при прокрутке, не анимируются. Свои — с временного пузыря: подтверждённое
 * сервером сообщение приходит с новым id и второй раз не въезжает.
 */
export function useEntrance(key: string, messages: readonly FeedMessage[] | undefined, meId: string) {
  const [state, setState] = useState<State | null>(null);
  if (messages && state?.key !== key) {
    const last = messages.at(-1);
    setState({ key, since: last ? Date.parse(last.createdAt) : -Infinity, done: new Set() });
  }
  const entering = useCallback(
    (m: FeedMessage) => !!state && state.key === key && !state.done.has(m.id) && Date.parse(m.createdAt) > state.since && (!!m.pending || m.senderId !== meId),
    [state, key, meId]
  );
  const finish = useCallback((id: string) => setState((s) => (s && !s.done.has(id) ? { ...s, done: new Set(s.done).add(id) } : s)), []);
  return { entering, finish };
}
