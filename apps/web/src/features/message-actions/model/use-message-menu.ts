import { useCallback, useMemo, useState } from "react";

import type { Message } from "@/entities/message";

type Point = { x: number; y: number };

/** Что сейчас открыто над лентой: меню, полоса реакций или диалог. */
export type MessageMenuState =
  | { kind: "menu"; message: Message; at: Point; quote?: string }
  | { kind: "reactions"; message: Message; at: Point }
  | { kind: "reactors"; message: Message; emoji: string; at: Point }
  | { kind: "readers"; message: Message; at: Point }
  | { kind: "delete"; message: Message }
  | { kind: "forward"; message: Message }
  | { kind: "translate"; text: string }
  | { kind: "selectText"; text: string }
  | { kind: "report"; message: Message; label: string };

export function useMessageMenu() {
  const [state, setState] = useState<MessageMenuState | null>(null);
  const close = useCallback(() => setState(null), []);
  return useMemo(
    () => ({
      state,
      close,
      /** quote — выделенная в пузыре часть текста, её процитирует «Ответить». */
      openMenu: (message: Message, at: Point, quote?: string) => setState({ kind: "menu", message, at, quote }),
      openReactions: (message: Message, at: Point) => setState({ kind: "reactions", message, at }),
      openReactors: (message: Message, emoji: string, at: Point) => setState({ kind: "reactors", message, emoji, at }),
      open: (next: MessageMenuState) => setState(next),
    }),
    [state, close]
  );
}

export type MessageMenuControl = ReturnType<typeof useMessageMenu>;
