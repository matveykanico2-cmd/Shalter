import { useCallback, useMemo, useState } from "react";

import type { Message } from "@/entities/message";

type Point = { x: number; y: number };

/** Что сейчас открыто над лентой: меню, полоса реакций или диалог. */
export type MessageMenuState =
  | { kind: "menu"; message: Message; at: Point }
  | { kind: "reactions"; message: Message; at: Point }
  | { kind: "reactors"; message: Message; emoji: string; at: Point }
  | { kind: "delete"; message: Message }
  | { kind: "forward"; message: Message };

export function useMessageMenu() {
  const [state, setState] = useState<MessageMenuState | null>(null);
  const close = useCallback(() => setState(null), []);
  return useMemo(
    () => ({
      state,
      close,
      openMenu: (message: Message, at: Point) => setState({ kind: "menu", message, at }),
      openReactions: (message: Message, at: Point) => setState({ kind: "reactions", message, at }),
      openReactors: (message: Message, emoji: string, at: Point) => setState({ kind: "reactors", message, emoji, at }),
      openDelete: (message: Message) => setState({ kind: "delete", message }),
      openForward: (message: Message) => setState({ kind: "forward", message }),
    }),
    [state, close]
  );
}

export type MessageMenuControl = ReturnType<typeof useMessageMenu>;
