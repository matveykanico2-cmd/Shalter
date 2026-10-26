import { useRef } from "react";
import { useNavigate } from "react-router";

import { errorText } from "@/shared/lib/error-text";
import { toast } from "@/shared/ui";

import type { CallKind, CallPeer } from "../api/call-api";

import { joinVoiceRoom, placeCall } from "./call-store";

/** Позвонить в чат и открыть экран звонка; ошибку (нет звёзд, приватность) — тостом. */
export function useStartCall(me: CallPeer) {
  const navigate = useNavigate();
  const busy = useRef(false);
  const run = async (start: () => Promise<string>, fallback: string) => {
    if (busy.current) return;
    busy.current = true;
    try {
      void navigate(`/call/${await start()}`);
    } catch (err) {
      toast(errorText(err, fallback), { error: true });
    } finally {
      busy.current = false;
    }
  };
  return {
    /** ringAll — в группе звонят всем участникам. */
    call: (chatId: string, kind: CallKind, opts?: { ringAll?: boolean }) => run(() => placeCall(chatId, kind, me, opts), "Не удалось позвонить"),
    /** Голосовой чат группы — войти или начать. */
    joinRoom: (chatId: string) => run(() => joinVoiceRoom(chatId, me), "Не удалось войти в голосовой чат"),
  };
}
