import { useCallback, useMemo, useState } from "react";

/**
 * Выбор нескольких сообщений — как selected/selecting в public/js/views/chatView.js:
 * первое отмеченное включает режим, снятие последнего его выключает.
 */
export function useMessageSelection() {
  const [ids, setIds] = useState<ReadonlySet<string> | null>(null);
  const toggle = useCallback(
    (id: string) =>
      setIds((prev) => {
        const next = new Set(prev ?? []);
        if (!next.delete(id)) next.add(id);
        return next.size ? next : null;
      }),
    []
  );
  const clear = useCallback(() => setIds(null), []);
  return useMemo(() => ({ active: ids !== null, ids: ids ?? EMPTY, toggle, clear }), [ids, toggle, clear]);
}

const EMPTY: ReadonlySet<string> = new Set();

export type MessageSelection = ReturnType<typeof useMessageSelection>;
