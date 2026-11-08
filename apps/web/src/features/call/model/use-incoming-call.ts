import { useEffect, useRef, useState } from "react";

import { useWsEvent, ws } from "@/shared/api";
import { startRingtone, stopRingtone } from "@/shared/lib/media/sounds";

import { callApi, type CallListItem } from "../api/call-api";

/** Входящий звонок на экране: из call:incoming или из опроса GET /api/calls. */
export type RingingCall = Pick<CallListItem, "id" | "kind" | "callerId" | "status" | "startedAt" | "participantIds" | "answered"> & {
  otherUser?: { name: string; username?: string | null; avatarColor?: string | null; avatarImage?: string | null; avatarEmoji?: string | null } | null;
};

const POLL_MS = 5_000;
// Звонок старше минуты уже не звонит: звонящий мог сбросить, пока связи не было.
const RINGING_WINDOW_MS = 60_000;
/**
 * Входящие — как public/js/components/incomingCallWatcher.js: по сокету, а пока сокета
 * нет — опросом раз в 5 с; после переподключения и возврата во вкладку сверяемся сразу.
 */
export function useIncomingCall(meId: string, activeCallId?: string) {
  const seen = useRef(new Set<string>());
  const primed = useRef(false);
  const [ringing, setRinging] = useState<RingingCall | null>(null);
  const dismiss = () => setRinging(null);

  const offer = (call: RingingCall) => {
    if (seen.current.has(call.id)) return;
    seen.current.add(call.id);
    if (call.callerId === meId || call.status !== "ongoing" || call.answered || call.id === activeCallId) return;
    const startedAt = new Date(call.startedAt).getTime();
    if (Number.isFinite(startedAt) && Date.now() - startedAt > RINGING_WINDOW_MS) return;
    setRinging(call);
  };

  useWsEvent("call:incoming", (e) => offer(e.call));
  // Только про тот звонок, что на экране: событие о другом звонке баннер не закрывает.
  useWsEvent("call:updated", (e) => {
    if (e.call.status !== "ongoing") {
      seen.current.add(e.call.id);
      setRinging((cur) => cur?.id === e.call.id ? null : cur);
    }
  });
  // Ответили на другом устройстве.
  useWsEvent("call:answered", (e) => {
    seen.current.add(e.callId);
    setRinging((cur) => cur?.id === e.callId ? null : cur);
  });

  const tick = async (force: boolean) => {
    if (!force && primed.current && ws.isOpen() && !ringing) return;
    // Без сети опрос просто пропускаем.
    const res = await callApi.list().catch(() => null);
    if (!res) return;
    if (!primed.current) {
      primed.current = true;
      for (const c of res.calls) if (c.status !== "ongoing") seen.current.add(c.id);
    }
    // Звонок на экране уже завершён (отмену по сокету пропустили) — закрываем.
    setRinging((cur) => (cur && !res.calls.some((c) => c.id === cur.id && c.status === "ongoing" && !c.answered) ? null : cur));
    res.calls.forEach(offer);
  };
  useWsEvent("ws:reconnected", () => void tick(true));
  const latestTick = useRef(tick);
  useEffect(() => {
    latestTick.current = tick;
  });
  useEffect(() => {
    void latestTick.current(false);
    const timer = setInterval(() => void latestTick.current(false), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void latestTick.current(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [meId]);

  // Пока баннер на экране — рингтон; дольше окна звонка не звоним.
  useEffect(() => {
    if (!ringing || ringing.id === activeCallId) return;
    startRingtone();
    const left = new Date(ringing.startedAt).getTime() + RINGING_WINDOW_MS - Date.now();
    const timer = setTimeout(() => setRinging(null), Math.max(5000, Number.isFinite(left) ? left : RINGING_WINDOW_MS));
    return () => {
      clearTimeout(timer);
      stopRingtone();
    };
  }, [ringing, activeCallId]);

  return { ringing, dismiss };
}
