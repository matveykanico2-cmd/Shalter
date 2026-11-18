// Лента открытого чата живёт событиями сокета, как public/js/views/chatView.js: чужое
// сообщение встаёт в ленту сразу, а сверка с сервером — одна на пачку событий. Опрос —
// подстраховка — только после reconnect/online/возврата во вкладку. Постоянный polling
// на мобильной сети отбирает канал у сообщений и будит приложение без необходимости.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { canApplyLive, historyCache, messageQueries } from "@/entities/message";

import { ws } from "@/shared/api";

const LIVE_RECONCILE_MS = 1000;
const DEFAULT_REFRESH_MS = 200;

export function useHistorySync(chatId: string, meId: string) {
  const client = useQueryClient();

  useEffect(() => {
    const queryKey = messageQueries.chatHistories(chatId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      // При входе в чат событие может прийти до первого успешного запроса истории.
      // В этом случае одной invalidate недостаточно: активный query ещё находится в
      // loading и иногда не запускает второй запрос, поэтому сообщение появлялось
      // только после ручного обновления страницы.
      void client.refetchQueries({ queryKey, type: "active" });
    };
    const scheduleRefresh = (delay = DEFAULT_REFRESH_MS) => {
      clearTimeout(timer);
      timer = setTimeout(refresh, delay);
    };
    // Сверка после живого сообщения — не чаще раза в секунду, поток её не откладывает.
    let reconcileAt = 0;
    const reconcileSoon = () => {
      const now = Date.now();
      if (reconcileAt > now) return;
      reconcileAt = now + LIVE_RECONCILE_MS;
      scheduleRefresh(LIVE_RECONCILE_MS);
    };

    const catchUp = () => {
      if (document.hidden) return;
      scheduleRefresh(0);
    };
    document.addEventListener("visibilitychange", catchUp);
    window.addEventListener("online", catchUp);

    const offs = [
      ws.on("message:new", ({ chatId: id, message }) => {
        if (id !== chatId) return;
        // Свои сообщения показывает сама отправка; с другого устройства — сверка.
        if (canApplyLive(message, chatId, meId) && historyCache.applyLive(client, chatId, message, true)) reconcileSoon();
        else scheduleRefresh();
      }),
      ws.on("message:updated", ({ chatId: id, message, streaming }) => {
        if (id !== chatId) return;
        // Ответ бота дописывается: пропавший пузырь вставляем обратно, без сверки.
        if (streaming) {
          if (canApplyLive(message, chatId, meId)) historyCache.applyLive(client, chatId, message, true);
          return;
        }
        if (canApplyLive(message, chatId, meId) && historyCache.applyLive(client, chatId, message, false)) reconcileSoon();
        else scheduleRefresh();
      }),
      ws.on("message:deleted", ({ chatId: id, id: messageId }) => {
        if (id !== chatId) return;
        // Убираем сразу: сверка не трогает историю старше свежей страницы.
        historyCache.remove(client, chatId, messageId);
        scheduleRefresh();
      }),
      ws.on("message:read", ({ chatId: id, readerId, messageIds, readAt }) => {
        if (id !== chatId) return;
        historyCache.markRead(client, chatId, readerId, messageIds, readAt);
        // И сверка, как в chatView.js: своё, ушедшее не отсюда («Отправить сейчас» из запланированных,
        // другое устройство), сокет нам не присылает — его прочли, значит, оно уже в ленте сервера.
        scheduleRefresh();
      }),
      ws.on("ws:reconnected", catchUp),
    ];

    return () => {
      offs.forEach((off) => off());
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", catchUp);
      window.removeEventListener("online", catchUp);
    };
  }, [client, chatId, meId]);
}
