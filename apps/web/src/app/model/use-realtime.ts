import { useEffect } from "react";

import { ws } from "@/shared/api";

/** Сокет — пока в приложении кто-то вошёл. Сеанс завершён с сервера — на экран входа. */
export function useRealtime(userId: string) {
  useEffect(() => {
    ws.start();
    const off = ws.on("ws:revoked", ({ reason }) => {
      // Заблокированному — экран бана (его в новом клиенте ещё нет); сокет уже не переподключается.
      if (reason === "banned") return;
      // Полная перезагрузка: кэш прежнего аккаунта не должен пережить выход.
      window.location.assign(reason === "session_revoked" ? "/login?reason=revoked" : "/login");
    });
    return () => {
      off();
      ws.stop();
    };
  }, [userId]);
}
