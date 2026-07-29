"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { Icon } from "./icons";
import { api } from "@/lib/client/api";
import type { Call, PublicUser } from "@/lib/types";

type ResolvedCall = Call & { otherUser: PublicUser | null };

function timeLabel(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}, ${d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function durationLabel(sec: number) {
  if (sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CallsView({ initialCalls }: { initialCalls: ResolvedCall[] }) {
  const [calls] = useState(initialCalls);
  const router = useRouter();

  async function redial(c: ResolvedCall, kind: "audio" | "video") {
    const { call } = await api.placeCall(c.chatId, kind);
    router.push(`/call/${call.id}`);
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border bg-surface px-4 py-3">
        <p className="font-serif text-lg font-semibold">Звонки</p>
      </header>
      <div className="flex-1 overflow-y-auto">
        {calls.length === 0 && <p className="mt-10 text-center text-sm text-muted">Звонков ещё не было</p>}
        {calls.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-alt">
            <Avatar
              name={c.otherUser?.name ?? "?"}
              color={c.otherUser?.avatarColor ?? "#8A8F98"}
              image={c.otherUser?.avatarImage}
            />
            <div className="min-w-0 flex-1">
              <p className={`truncate font-medium ${c.status === "missed" ? "text-danger" : "text-text"}`}>
                {c.otherUser?.name ?? "Неизвестно"}
              </p>
              <p className="flex items-center gap-1 text-xs text-muted">
                {c.kind === "video" ? <Icon.Video size={12} /> : <Icon.Phone size={12} />}
                {c.direction === "incoming" ? "Входящий" : "Исходящий"}
                {c.status === "missed" ? " · пропущен" : c.durationSec ? ` · ${durationLabel(c.durationSec)}` : ""}
                {" · "}
                <span className="font-mono tabular-nums">{timeLabel(c.startedAt)}</span>
              </p>
            </div>
            <button onClick={() => redial(c, "audio")} className="rounded-full p-2 text-muted hover:bg-surface hover:text-accent">
              <Icon.Phone size={16} />
            </button>
            <button onClick={() => redial(c, "video")} className="rounded-full p-2 text-muted hover:bg-surface hover:text-accent">
              <Icon.Video size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
