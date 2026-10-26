// Список чатов живёт событиями сокета, как public/js/views/chatList.js: сообщение сразу
// встаёт в превью, а перезапрос (чаты и папки) сверяет счётчики — один на пачку событий.
// Опрос — только подстраховка: раз в 30 с при живом сокете, иначе раз в 15 с, и
// никогда — пока вкладка в фоне.
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";

import { chatCache, chatQueries } from "@/entities/chat";
import { type SelfUser, sessionQueries } from "@/entities/session";

import { ws, type WsEvents } from "@/shared/api";
import { toast } from "@/shared/ui";

/** Сверка после события сообщения: сразу пересчитывать нечего, превью уже обновлено. */
const EVENT_REFETCH_MS = 1200;
const DEFAULT_REFETCH_MS = 250;
const POLL_CHECK_MS = 5000;
const POLL_WS_OPEN_MS = 30_000;
const POLL_WS_DOWN_MS = 15_000;

export function useChatListSync(meId: string) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dueAt = 0;
    const refetch = () => void client.invalidateQueries({ queryKey: chatQueries.baseKey });
    // Таймер, который сработает раньше, не откладываем: иначе поток сообщений в активной
    // группе сдвигал бы сверку бесконечно.
    const schedule = (delay = DEFAULT_REFETCH_MS) => {
      const due = Date.now() + delay;
      if (timer && dueAt <= due) return;
      clearTimeout(timer);
      dueAt = due;
      timer = setTimeout(() => {
        timer = undefined;
        refetch();
      }, delay);
    };

    let lastPoll = Date.now();
    const poll = setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - lastPoll < (ws.isOpen() ? POLL_WS_OPEN_MS : POLL_WS_DOWN_MS)) return;
      lastPoll = Date.now();
      refetch();
    }, POLL_CHECK_MS);
    const onVisible = () => {
      if (document.hidden) return;
      lastPoll = Date.now();
      schedule(0);
    };
    document.addEventListener("visibilitychange", onVisible);

    const offs = [
      ws.on("message:new", ({ chatId, message }) => {
        const known = chatCache.isKnown(client, chatId);
        chatCache.noteMessage(client, chatId, message);
        schedule(known ? EVENT_REFETCH_MS : 0);
      }),
      ws.on("message:updated", (e) => void (!e.streaming && schedule(EVENT_REFETCH_MS))),
      ws.on("message:deleted", () => schedule(EVENT_REFETCH_MS)),
      ws.on("chat:added", () => schedule()),
      ws.on("chat:updated", () => schedule()),
      ws.on("community:updated", () => schedule()),
      ws.on("chat:deleted", ({ chatId }) => {
        chatCache.removeChat(client, chatId);
        if (path.current === `/chat/${chatId}`) void navigate("/");
      }),
      ws.on("presence:update", ({ userId, online, lastSeen }) => chatCache.patchOtherUser(client, userId, { online, lastSeen })),
      ws.on("contact:updated", (e) => applyContactUpdate(client, meId, e)),
      ws.on("ws:reconnected", () => schedule(0)),
      ws.on("chat:join-declined", ({ title }) => toast(`Заявку в «${title ?? "чат"}» отклонили`)),
    ];

    return () => {
      offs.forEach((off) => off());
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [client, navigate, meId]);
}

function applyContactUpdate(client: QueryClient, meId: string, { user }: WsEvents["contact:updated"]) {
  // Без фото (удалено или скрыто приватностью) сервер поле не присылает — сбрасываем явно,
  // иначе при слиянии осталась бы старая аватарка.
  const patch = { avatarImage: undefined, avatarImages: [], ...user };
  if (user.id === meId) {
    client.setQueryData(sessionQueries.current().queryKey, (session) =>
      session?.user ? { ...session, user: { ...session.user, ...patch } as SelfUser } : session
    );
    return;
  }
  chatCache.patchOtherUser(client, user.id, patch);
}
