import { useCallback, useEffect, useRef } from "react";

import { ensurePushSubscribed, pushDiagnostics } from "@/shared/lib/push";

/**
 * Service worker /sw.js (кэш на случай без сети) и push-подписка этого устройства, если
 * уведомления уже разрешены, — как конец boot() в public/js/app.js.
 *
 * Пуши не приходят, если устройство отписалось или токен устарел (особенно на iPhone:
 * веб-push работает только для PWA, добавленного на главный экран, iOS 16.4+).
 * Поэтому при возврате во вкладку и при появлении сети переподписываемся — так пуши
 * не «задерживаются до входа в приложение».
 */
export function useServiceWorker() {
  const diagnosed = useRef(false);
  const resubscribe = useCallback(() => {
    void ensurePushSubscribed().catch(() => {});
    if (!diagnosed.current) {
      void pushDiagnostics().then(() => {
        diagnosed.current = true;
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    // При первом запуске и при возврате во вкладку — переподписываемся на пуши.
    resubscribe();
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
    // При возврате во вкладку и при появлении сети — переподписка на пуши.
    window.addEventListener("visibilitychange", resubscribe);
    window.addEventListener("online", resubscribe);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", precacheLater);
      window.removeEventListener("visibilitychange", resubscribe);
      window.removeEventListener("online", resubscribe);
    };
  }, [resubscribe]);
}
