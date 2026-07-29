"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { fireNotification } from "@/lib/client/notifications";
import { useCurrentUser } from "@/lib/client/CurrentUserContext";

const POLL_MS = 2500;

export function IncomingCallWatcher() {
  const me = useCurrentUser();
  const router = useRouter();
  const seenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const { calls } = await api.listCalls();
      if (cancelled) return;
      if (!seenRef.current) {
        // First tick primes the seen-set so calls already in progress on load don't ring.
        seenRef.current = new Set(calls.map((c) => c.id));
        return;
      }
      for (const call of calls) {
        if (seenRef.current.has(call.id)) continue;
        seenRef.current.add(call.id);
        if (call.callerId === me.id || call.status !== "ongoing") continue;
        fireNotification(call.otherUser?.name ?? "Звонок", call.kind === "video" ? "Видеозвонок…" : "Звонит…", {
          sound: true,
          onClick: () => router.push(`/call/${call.id}`),
        });
      }
    }

    tick();
    const iv = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [me.id, router]);

  return null;
}
