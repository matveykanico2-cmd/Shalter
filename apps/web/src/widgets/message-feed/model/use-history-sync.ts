// Лента открытого чата живёт событиями сокета, как public/js/views/chatView.js: чужое
// сообщение встаёт в ленту сразу, а сверка с сервером — одна на пачку событий. Опрос —
// подстраховка: раз в минуту при живом сокете, раз в 15 с без него, и не в фоне.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { canApplyLive, historyCache, messageQueries } from "@/entities/message";

import { ws } from "@/shared/api";

const LIVE_RECONCILE_MS = 1000;
const DEFAULT_REFRESH_MS = 200;
const POLL_CHECK_MS = 5000;
const POLL_WS_OPEN_MS = 60_000;
const POLL_WS_DOWN_MS = 15_000;

export function useHistorySync(chatId: string, meId: string) {
  const client = useQueryClient();

  useEffect(() => {
    const queryKey = messageQueries.chatHistories(chatId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastPoll = Date.now();
    const refresh = () => {
      lastPoll = Date.now();
      void client.invalidateQueries({ queryKey });
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

    const poll = setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - lastPoll < (ws.isOpen() ? POLL_WS_OPEN_MS : POLL_WS_DOWN_MS)) return;
      refresh();
    }, POLL_CHECK_MS);
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
      clearInterval(poll);
      document.removeEventListener("visibilitychange", catchUp);
      window.removeEventListener("online", catchUp);
    };
  }, [client, chatId, meId]);
}
