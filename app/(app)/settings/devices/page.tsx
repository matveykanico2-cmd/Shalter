"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { api } from "@/lib/client/api";
import type { Session } from "@/lib/types";

function timeLabel(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}, ${d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function DevicesSettingsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    api.listSessions().then((r) => setSessions(r.sessions));
  }, []);

  async function terminate(id: string) {
    setSessions((s) => s.filter((x) => x.id !== id));
    await api.removeSession(id);
  }

  const current = sessions.find((s) => s.current);
  const others = sessions.filter((s) => !s.current);

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <p className="mb-1 font-serif text-xl font-semibold">Устройства</p>
      <p className="mb-4 text-sm text-muted">Активные сеансы вашего аккаунта</p>

      {current && (
        <div className="mb-4 rounded-lg border border-accent bg-accent-soft px-4 py-3">
          <p className="text-sm font-medium text-accent">Это устройство</p>
          <p className="text-sm">{current.device}</p>
          <p className="font-mono text-xs text-muted">{current.city} · {timeLabel(current.lastActive)}</p>
        </div>
      )}

      {others.length > 0 && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Другие сеансы</p>
            <button
              onClick={() => {
                others.forEach((s) => terminate(s.id));
              }}
              className="text-xs font-medium text-danger"
            >
              Завершить все
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {others.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
                <Icon.Phone size={16} className="text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{s.device}</p>
                  <p className="font-mono text-xs text-muted">{s.city} · {timeLabel(s.lastActive)}</p>
                </div>
                <button onClick={() => terminate(s.id)} className="rounded-full p-1.5 text-muted hover:text-danger">
                  <Icon.X size={15} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
