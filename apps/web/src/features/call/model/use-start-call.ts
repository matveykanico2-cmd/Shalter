import { useRef } from "react";
import { useNavigate } from "react-router";

import { ApiError } from "@/shared/api";
import { copyText } from "@/shared/lib/clipboard";
import { errorText } from "@/shared/lib/error-text";
import { askConfirm, toast } from "@/shared/ui";

import type { CallKind, CallPeer } from "../api/call-api";

import { createInviteLink, joinVoiceRoom, placeCall } from "./call-store";

/** Позвонить в чат и открыть экран звонка; ошибку (нет звёзд, приватность) — тостом. */
export function useStartCall(me: CallPeer) {
  const navigate = useNavigate();
  const busy = useRef(false);
  const run = async (start: () => Promise<string | null>, fallback: string) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const id = await start();
      if (id) void navigate(`/call/${id}`);
    } catch (err) {
      toast(errorText(err, fallback), { error: true });
    } finally {
      busy.current = false;
    }
  };
  return {
    /** ringAll — в группе звонят всем участникам. */
    call: (chatId: string, kind: CallKind, opts?: { ringAll?: boolean }) =>
      run(async () => {
        try {
          return await placeCall(chatId, kind, me, opts);
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 403 || err.message !== "Пользователь ограничил звонки") throw err;
          const makeLink = await askConfirm(
            "Пользователь не принимает входящие звонки. Отправить ему ссылку-приглашение?",
            { okLabel: "Создать ссылку", cancelLabel: "Не сейчас" }
          );
          if (!makeLink) return null;
          const callId = await placeCall(chatId, kind, me, { ...opts, inviteOnly: true });
          const url = await createInviteLink();
          await copyText(url, "Ссылка скопирована — отправьте её человеку");
          return callId;
        }
      }, "Не удалось позвонить"),
    /** Голосовой чат группы — войти или начать. */
    joinRoom: (chatId: string) => run(() => joinVoiceRoom(chatId, me), "Не удалось войти в голосовой чат"),
  };
}
