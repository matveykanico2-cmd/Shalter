"use client";

import { useEffect, useState } from "react";
import { Avatar } from "../Avatar";
import { Icon } from "../icons";
import { api } from "@/lib/client/api";
import type { ChatSummary } from "@/lib/data/chat-summary";

export function ForwardDialog({
  onPick,
  onClose,
}: {
  onPick: (chatId: string) => void;
  onClose: () => void;
}) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    api.listChats().then((r) => setChats(r.chats));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-serif text-base font-semibold">Переслать в…</p>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-surface-alt">
            <Icon.X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {!chats && <p className="px-4 py-6 text-center text-sm text-muted">Загрузка…</p>}
          {chats?.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">Нет чатов</p>}
          {chats
            ?.filter((c) => !c.archived)
            .map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onPick(c.id);
                  setSentTo(c.id);
                }}
                disabled={sentTo !== null}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-alt disabled:opacity-60"
              >
                <Avatar name={c.otherUser?.name ?? c.title} color={c.avatarColor} image={c.otherUser?.avatarImage} />
                <span className="truncate font-medium">{c.otherUser?.name ?? c.title}</span>
                {sentTo === c.id && <span className="ml-auto text-xs text-success">Отправлено ✓</span>}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
