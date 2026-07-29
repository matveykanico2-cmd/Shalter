"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { ChatListItem } from "./ChatListItem";
import { api } from "@/lib/client/api";
import { notifyChatsChanged } from "@/lib/client/refresh";
import type { ChatSummary } from "@/lib/data/chat-summary";

export function ArchiveView({ initialChats }: { initialChats: ChatSummary[] }) {
  const [chats, setChats] = useState(initialChats);
  const params = useParams<{ id?: string }>();

  async function patchChat(id: string, patch: Partial<ChatSummary>) {
    if (patch.archived === false) {
      setChats((prev) => prev.filter((c) => c.id !== id));
    } else {
      setChats((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    }
    await api.patchChat(id, patch);
    notifyChatsChanged();
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border bg-surface px-4 py-3">
        <p className="font-serif text-lg font-semibold">Архив</p>
      </header>
      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 && <p className="mt-10 text-center text-sm text-muted">В архиве пусто</p>}
        {chats.map((c) => (
          <ChatListItem key={c.id} chat={c} active={params.id === c.id} onPatch={patchChat} />
        ))}
      </div>
    </div>
  );
}
