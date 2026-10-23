// «В сети» участников открытого чата: событие presence:update правит его карточку
// (список чатов обновляет собеседника в личках сам). «Был(а) N минут назад»
// пересчитывается раз в минуту.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { chatCache } from "@/entities/chat";

import { ws } from "@/shared/api";

const TICK_MS = 60_000;

export function usePresenceSync(chatId: string) {
  const client = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const off = ws.on("presence:update", ({ userId, online, lastSeen }) =>
      chatCache.patchCardUser(client, chatId, userId, lastSeen ? { online, lastSeen } : { online })
    );
    const tick = setInterval(() => setNow(new Date()), TICK_MS);
    return () => {
      off();
      clearInterval(tick);
    };
  }, [client, chatId]);
  return now;
}
