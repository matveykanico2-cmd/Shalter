import { useEffect, useRef, useState } from "react";

import { useWsEvent,ws } from "@/shared/api";
import { startRingtone, stopRingtone } from "@/shared/lib/media/sounds";

import { callApi, type CallListItem } from "../api/call-api";

/** Входящий звонок на экране: из call:incoming или из опроса GET /api/calls. */
export type RingingCall = Pick<CallListItem, "id" | "kind" | "callerId" | "status" | "startedAt" | "participantIds"> & {
  otherUser?: { name: string; username?: string | null; avatarColor?: string | null; avatarImage?: string | null } | null;
};

const POLL_MS = 20_000;
// Звонок старше минуты уже не звонит: звонящий мог сбросить, пока связи не было.
const RINGING_WINDOW_MS = 60_000;
// Уже показанные (и завершённые к первому опросу) звонки — на всю вкладку.
const seen = new Set<string>();
let primed = false;

/**
 * Входящие — как public/js/components/incomingCallWatcher.js: по сокету, а пока сокета
 * нет — опросом раз в 20 с; после переподключения и возврата во вкладку сверяемся сразу.
 */
export function useIncomingCall(meId: string) {
  const [ringing, setRinging] = useState<RingingCall | null>(null);
  const dismiss = () => setRinging(null);

  const offer = (call: RingingCall) => {
    if (seen.has(call.id)) return;
    seen.add(call.id);
    if (call.callerId === meId || call.status !== "ongoing") return;
    const startedAt = new Date(call.startedAt).getTime();
    if (Number.isFinite(startedAt) && Date.now() - startedAt > RINGING_WINDOW_MS) return;
    setRinging(call);
  };

  useWsEvent("call:incoming", (e) => offer(e.call));
  // Только про тот звонок, что на экране: событие о другом звонке баннер не закрывает.
  useWsEvent("call:updated", (e) => {
    if (e.call.id === ringing?.id && e.call.status !== "ongoing") dismiss();
  });
  // Ответили на другом устройстве.
  useWsEvent("call:answered", (e) => {
    if (e.callId === ringing?.id) dismiss();
  });

  const tick = async (force: boolean) => {
    if (!force && primed && ws.isOpen()) return;
    // Без сети опрос просто пропускаем.
    const res = await callApi.list().catch(() => null);
    if (!res) return;
    if (!primed) {
      primed = true;
      for (const c of res.calls) if (c.status !== "ongoing") seen.add(c.id);
    }
    // Звонок на экране уже завершён (отмену по сокету пропустили) — закрываем.
    setRinging((cur) => (cur && !res.calls.some((c) => c.id === cur.id && c.status === "ongoing") ? null : cur));
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
    if (!ringing) return;
    startRingtone();
    const left = new Date(ringing.startedAt).getTime() + RINGING_WINDOW_MS - Date.now();
    const timer = setTimeout(() => setRinging(null), Math.max(5000, Number.isFinite(left) ? left : RINGING_WINDOW_MS));
    return () => {
      clearTimeout(timer);
      stopRingtone();
    };
  }, [ringing]);

  return { ringing, dismiss };
}
