import { useSyncExternalStore } from "react";

import { useWsStatus } from "@/shared/api";

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/** Заголовок над чатами, как в Telegram: «Shalter», а без связи — «Ожидание сети…» и т. п. */
export function useConnectionTitle(): string | null {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine);
  const ws = useWsStatus();
  if (!online) return "Ожидание сети…";
  if (ws.down) return ws.everOpened ? "Переподключение…" : "Соединение…";
  return null;
}
