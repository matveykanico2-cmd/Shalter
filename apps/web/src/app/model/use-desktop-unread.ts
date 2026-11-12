import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { chatQueries, isChatMuted } from "@/entities/chat";

type DesktopWindow = Window & { shalterDesktop?: { setUnread?: (n: number) => void } };
type BadgeNavigator = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

/** Значок установленного приложения (PWA, Badging API): число непрочитанных или ничего. */
function setAppBadge(n: number) {
  const nav = navigator as BadgeNavigator;
  try {
    if (n > 0) void nav.setAppBadge?.(n).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  } catch {
    // браузер не умеет — без значка
  }
}

/**
 * Непрочитанные без заглушённых и архива → бейдж и трей приложения для компьютера
 * (window.shalterDesktop) и значок установленного PWA.
 */
export function useDesktopUnread() {
  const bridge = (window as DesktopWindow).shalterDesktop;
  const chats = useQuery({ ...chatQueries.list(), enabled: false }).data;
  const last = useRef(-1);
  useEffect(() => {
    if (!chats) return;
    const n = chats.filter((c) => !c.archived && !isChatMuted(c)).reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    if (n === last.current) return;
    last.current = n;
    bridge?.setUnread?.(n);
    setAppBadge(n);
  }, [bridge, chats]);
  // Вышли из приложения (компонент размонтирован) — значок не должен висеть.
  useEffect(() => () => setAppBadge(0), []);
}
