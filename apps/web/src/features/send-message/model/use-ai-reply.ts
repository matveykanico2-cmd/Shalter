// Shalter AI пишет ответ — как setAiGenerating в public/js/views/chatView.js: «стоп» в поле
// ввода, пока идёт ai:state active или дописывается пузырь бота; финальный ответ — конец.
import { useState } from "react";

import { useWsEvent } from "@/shared/api";

import { stopAi } from "../api/send-message";

export const SHALTER_AI_ID = "bot_shalter_ai";

export function useAiReply(chatId: string, enabled: boolean) {
  const [generating, setGenerating] = useState(false);
  useWsEvent("ai:state", (e) => {
    if (enabled && e.chatId === chatId) setGenerating(e.active);
  });
  useWsEvent("message:updated", (e) => {
    if (enabled && e.chatId === chatId && e.message.senderId === SHALTER_AI_ID) setGenerating(!!e.streaming);
  });
  useWsEvent("message:new", (e) => {
    if (enabled && e.chatId === chatId && e.message.senderId === SHALTER_AI_ID) setGenerating(false);
  });
  if (!enabled) return null;
  return {
    generating,
    onStop: () => {
      setGenerating(false);
      stopAi(chatId).catch(() => {});
    },
  };
}
