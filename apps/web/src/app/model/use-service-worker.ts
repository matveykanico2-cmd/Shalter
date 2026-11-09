import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { chatCache } from "@/entities/chat";
import { historyCache, type Message, messageQueries } from "@/entities/message";

import { forgetOutgoingMessage, syncOutgoingMessages } from "@/shared/lib/message-outbox";
import { ensurePushSubscribed, pushDiagnostics } from "@/shared/lib/push";
import { toast } from "@/shared/ui";

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
  const client = useQueryClient();
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
    // Поднять очередь прошлого запуска сразу. При pagehide SW продолжит её без открытого чата.
    void syncOutgoingMessages();
    const sync = () => void syncOutgoingMessages();
    const onWorkerMessage = (event: MessageEvent<{ type?: string; chatId?: string; clientId?: string; message?: Message }>) => {
      const { type, chatId, clientId, message } = event.data ?? {};
      if (!chatId || !clientId) return;
      if (type === "shalter:outbox-sent" && message) {
        historyCache.confirmPending(client, chatId, clientId, message);
        chatCache.noteMessage(client, chatId, message);
      } else if (type === "shalter:outbox-failed") {
        historyCache.dropPending(client, chatId, clientId);
        toast("Не удалось отправить сообщение", { error: true });
      } else return;
      void forgetOutgoingMessage(clientId);
      void client.invalidateQueries({ queryKey: messageQueries.chatHistories(chatId) });
    };
    navigator.serviceWorker.addEventListener("message", onWorkerMessage);
    window.addEventListener("online", precacheLater);
    window.addEventListener("online", sync);
    window.addEventListener("pagehide", sync);
    // При возврате во вкладку и при появлении сети — переподписка на пуши.
    window.addEventListener("visibilitychange", resubscribe);
    window.addEventListener("online", resubscribe);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", precacheLater);
      window.removeEventListener("online", sync);
      window.removeEventListener("pagehide", sync);
      navigator.serviceWorker.removeEventListener("message", onWorkerMessage);
      window.removeEventListener("visibilitychange", resubscribe);
      window.removeEventListener("online", resubscribe);
    };
  }, [client, resubscribe]);
}
