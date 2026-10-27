import { useEffect } from "react";

import { http, ws } from "@/shared/api";

/** Сокет — пока в приложении кто-то вошёл. Сеанс завершён с сервера — на экран входа. */
export function useRealtime(userId: string) {
  useEffect(() => {
    ws.start();
    const off = ws.on("ws:revoked", ({ reason }) => {
      // Заблокированному — экран бана: сведения о блокировке приходят с ответом 403 (shared/api/ban.ts);
      // сокет уже не переподключается.
      if (reason === "banned") return void http.get("/api/sessions").catch(() => {});
      // Полная перезагрузка: кэш прежнего аккаунта не должен пережить выход.
      window.location.assign(reason === "session_revoked" ? "/login?reason=revoked" : "/login");
    });
    return () => {
      off();
      ws.stop();
    };
  }, [userId]);
}
