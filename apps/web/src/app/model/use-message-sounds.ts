// Звук входящего — как обработчик message:new в public/js/app.js: не своё, не тихое, чат
// не без звука, звук в настройках не выключен и вкладку видно (в фоне — уведомления системы).
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { chatQueries, isChatMuted } from "@/entities/chat";
import { settingsQueries } from "@/entities/settings";

import { ws } from "@/shared/api";
import { installSoundUnlock, playIncomingMessageSound } from "@/shared/lib/media/sounds";

export function useMessageSounds(meId: string) {
  const client = useQueryClient();
  useEffect(() => {
    installSoundUnlock();
    return ws.on("message:new", ({ chatId, message, silent }) => {
      if (silent || message.senderId === meId || message.threadRootId) return;
      const settings = client.getQueryData(settingsQueries.current().queryKey);
      if ((settings?.notifications as { sound?: boolean } | undefined)?.sound === false) return;
      const chat = client.getQueryData(chatQueries.list().queryKey)?.find((c) => c.id === chatId);
      if (chat && isChatMuted(chat)) return;
      if (document.visibilityState === "visible") playIncomingMessageSound();
    });
  }, [client, meId]);
}
