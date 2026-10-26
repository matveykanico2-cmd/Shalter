import { useEffect } from "react";

import { ensurePushSubscribed } from "@/shared/lib/push";

/**
 * Service worker /sw.js (кэш на случай без сети) и push-подписка этого устройства, если
 * уведомления уже разрешены, — как конец boot() в public/js/app.js.
 */
export function useServiceWorker() {
  useEffect(() => {
    void ensurePushSubscribed().catch(() => {});
    if (!("serviceWorker" in navigator)) return;
    // Без сети приложение открывается из кэша: просим SW докачать сборку при запуске и когда сеть
    // вернулась — но не сразу, а в простое: на медленной сети это отбирало бы канал у чатов.
    const precache = () =>
      void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: "precache" })).catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const precacheLater = () => {
      clearTimeout(timer);
      timer = setTimeout(() => ("requestIdleCallback" in window ? requestIdleCallback(precache, { timeout: 10000 }) : precache()), 15000);
    };
    navigator.serviceWorker.register("/sw.js").then(precacheLater, () => {});
    window.addEventListener("online", precacheLater);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", precacheLater);
    };
  }, []);
}
