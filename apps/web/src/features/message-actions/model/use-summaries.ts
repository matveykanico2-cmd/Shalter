import { useCallback, useMemo, useState } from "react";

import type { Message } from "@/entities/message";

import { errorText } from "@/shared/lib/error-text";

import { summarizeMessage } from "../api/message-actions";

/**
 * «Кратко» — ИИ-сводка под длинным сообщением, как toggleSummary в messageBubble.js:
 * повторное нажатие прячет её. Значение null — сводка ещё делается.
 */
export function useSummaries(chatId: string) {
  const [shown, setShown] = useState<ReadonlyMap<string, string | null>>(new Map());
  const set = useCallback(
    (id: string, value: string | null | undefined) =>
      setShown((prev) => {
        const next = new Map(prev);
        if (value === undefined) next.delete(id);
        else next.set(id, value);
        return next;
      }),
    []
  );
  const toggle = useCallback(
    async (m: Message) => {
      if (shown.has(m.id)) {
        set(m.id, undefined);
        return;
      }
      set(m.id, null);
      try {
        const { summary } = await summarizeMessage(chatId, m.id);
        set(m.id, summary);
      } catch (err) {
        set(m.id, errorText(err, "Не удалось сделать сводку"));
      }
    },
    [chatId, shown, set]
  );
  return useMemo(() => ({ of: (id: string) => shown.get(id), has: (id: string) => shown.has(id), toggle }), [shown, toggle]);
}

export type Summaries = ReturnType<typeof useSummaries>;
