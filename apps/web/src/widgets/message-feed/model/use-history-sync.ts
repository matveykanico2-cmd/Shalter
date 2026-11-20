// Лента открытого чата живёт событиями сокета, как public/js/views/chatView.js: чужое
// сообщение встаёт в ленту сразу, а сверка с сервером — одна на пачку событий. Опрос —
// подстраховка — только после reconnect/online/возврата во вкладку. Постоянный polling
// на мобильной сети отбирает канал у сообщений и будит приложение без необходимости.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { canApplyLive, historyCache, messageQueries } from "@/entities/message";

import { ws } from "@/shared/api";
import { listOutgoingMessages } from "@/shared/lib/message-outbox";

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

    // Если приложение было свернуто во время офлайн-отправки, UI-компонент мог
    // размонтироваться, хотя запись в outbox осталась. Показываем её сразу при
    // повторном открытии чата; SW позже заменит пузырь настоящим сообщением.
    void listOutgoingMessages(chatId).then((entries) => {
      for (const entry of entries) {
        if (historyCache.find(client, chatId, entry.id)) continue;
        const body = entry.body as { text?: string; attachments?: unknown[]; sticker?: unknown; replyToId?: string | null; topicId?: string | null; effect?: string; article?: unknown };
        const pending = {
          id: entry.id,
          chatId,
          senderId: meId,
          type: body.sticker ? "sticker" : body.article ? "article" : "text",
          text: body.text ?? "",
          createdAt: new Date(entry.createdAt).toISOString(),
          pinned: false,
          replyToId: body.replyToId ?? null,
          ...(body.topicId ? { topicId: body.topicId } : {}),
          ...(body.sticker ? { sticker: body.sticker } : {}),
          ...(body.effect ? { effect: body.effect } : {}),
          attachments: body.attachments ?? [],
          reactions: [],
          readByIds: [],
          deletedForIds: [],
          mentionedUserIds: [],
          views: null,
        } as never;
        historyCache.addPending(client, chatId, pending);
      }
    });
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
