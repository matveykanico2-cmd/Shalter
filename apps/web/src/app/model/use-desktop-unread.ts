import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { chatQueries, isChatMuted } from "@/entities/chat";

type DesktopWindow = Window & { shalterDesktop?: { setUnread?: (n: number) => void } };

/** Приложение для компьютера: непрочитанные без заглушённых и архива → бейдж и трей (window.shalterDesktop). */
export function useDesktopUnread() {
  const bridge = (window as DesktopWindow).shalterDesktop;
  const chats = useQuery({ ...chatQueries.list(), enabled: false }).data;
  const last = useRef(-1);
  useEffect(() => {
    if (!bridge?.setUnread || !chats) return;
    const n = chats.filter((c) => !c.archived && !isChatMuted(c)).reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    if (n !== last.current) bridge.setUnread((last.current = n));
  }, [bridge, chats]);
}
