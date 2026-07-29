"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChatListItem } from "./ChatListItem";
import { Icon } from "./icons";
import { api } from "@/lib/client/api";
import { onChatsChanged } from "@/lib/client/refresh";
import { fireNotification } from "@/lib/client/notifications";
import { useCurrentUser } from "@/lib/client/CurrentUserContext";
import type { ChatSummary } from "@/lib/data/chat-summary";
import type { Folder, Message, PublicUser, Settings } from "@/lib/types";

const SYSTEM_TABS = [
  { id: "all", name: "Все" },
  { id: "personal", name: "Личные" },
  { id: "groups", name: "Группы" },
  { id: "channels", name: "Каналы" },
] as const;

export function ChatListPane({
  initialChats,
  folders: initialFolders,
}: {
  initialChats: ChatSummary[];
  folders: Folder[];
}) {
  const [chats, setChats] = useState(initialChats);
  const [folders, setFolders] = useState(initialFolders);
  const [tab, setTab] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ chats: ChatSummary[]; users: PublicUser[]; messages: Message[] } | null>(null);
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const me = useCurrentUser();
  const settingsRef = useRef<Settings | null>(null);
  const lastMessageIdsRef = useRef<Map<string, string>>(
    new Map(initialChats.filter((c) => c.lastMessage).map((c) => [c.id, c.lastMessage!.id]))
  );

  useEffect(() => {
    const loadSettings = () => api.getSettings().then((r) => (settingsRef.current = r.settings));
    loadSettings();
    window.addEventListener("focus", loadSettings);
    return () => window.removeEventListener("focus", loadSettings);
  }, []);

  useEffect(() => {
    const refetch = () => {
      api.listChats().then((r) => {
        notifyNewMessages(r.chats);
        setChats(r.chats);
      });
      api.listFolders().then((r) => setFolders(r.folders));
    };
    const notifyNewMessages = (nextChats: ChatSummary[]) => {
      const settings = settingsRef.current;
      for (const chat of nextChats) {
        const last = chat.lastMessage;
        const seen = lastMessageIdsRef.current.get(chat.id);
        if (last) lastMessageIdsRef.current.set(chat.id, last.id);
        if (!last || last.id === seen || last.senderId === me.id) continue;
        if (chat.muted || settings?.notifications.mutedChatIds.includes(chat.id)) continue;
        const viewingThisChat = !document.hidden && params.id === chat.id;
        if (viewingThisChat) continue;
        const title = chat.type === "dm" || chat.type === "secret" ? chat.otherUser?.name ?? chat.title : chat.title;
        const body = settings?.notifications.previewText === false ? "Новое сообщение" : last.text || "Медиа";
        fireNotification(title, body, {
          sound: settings?.notifications.sound,
          onClick: () => router.push(`/chat/${chat.id}`),
        });
      }
    };
    const off = onChatsChanged(refetch);
    // Polling stands in for realtime delivery — picks up messages sent from
    // another tab/account without requiring a manual page refresh.
    const iv = setInterval(refetch, 4000);
    return () => {
      off();
      clearInterval(iv);
    };
  }, [me.id, params.id, router]);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const t = setTimeout(() => {
      api.search(q).then((r) =>
        setResults({
          chats: chats.filter((c) => c.title.toLowerCase().includes(q.toLowerCase())),
          users: r.users,
          messages: r.messages,
        })
      );
    }, 150);
    return () => clearTimeout(t);
  }, [query, chats]);

  function updateQuery(v: string) {
    setQuery(v);
    if (!v.trim()) setResults(null);
  }

  async function patchChat(id: string, patch: Partial<ChatSummary>) {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await api.patchChat(id, patch);
  }

  const visible = useMemo(() => {
    let list = chats.filter((c) => !c.archived);
    const folder = folders.find((f) => f.id === tab);
    if (folder) list = list.filter((c) => folder.chatIds.includes(c.id));
    else if (tab === "personal") list = list.filter((c) => c.type === "dm" || c.type === "secret" || c.type === "bot");
    else if (tab === "groups") list = list.filter((c) => c.type === "group");
    else if (tab === "channels") list = list.filter((c) => c.type === "channel");

    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const at = a.lastMessage?.createdAt ?? a.createdAt;
      const bt = b.lastMessage?.createdAt ?? b.createdAt;
      return bt.localeCompare(at);
    });
  }, [chats, tab, folders]);

  const tabs = [...SYSTEM_TABS, ...folders.map((f) => ({ id: f.id, name: f.name }))];

  return (
    <div className="flex h-full w-full flex-col md:w-[340px] md:shrink-0 md:border-r md:border-border">
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <div className="relative flex-1">
          <Icon.Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            placeholder="Поиск"
            className="w-full rounded-lg border border-border bg-surface-alt py-2 pl-9 pr-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {results ? (
        <div className="flex-1 overflow-y-auto px-1 pb-4">
          {results.chats.length === 0 && results.users.length === 0 && results.messages.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted">Ничего не найдено</p>
          )}
          {results.chats.length > 0 && (
            <div className="mb-2">
              <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Чаты</p>
              {results.chats.map((c) => (
                <ChatListItem key={c.id} chat={c} active={params.id === c.id} onPatch={patchChat} />
              ))}
            </div>
          )}
          {results.users.length > 0 && (
            <div className="mb-2">
              <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Люди</p>
              {results.users.map((u) => (
                <button
                  key={u.id}
                  onClick={async () => {
                    const { chat } = await api.startDm(u.id, u.name, u.avatarColor);
                    api.listChats().then((r) => setChats(r.chats));
                    router.push(`/chat/${chat.id}`);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-alt"
                >
                  <span className="font-medium text-text">{u.name}</span>
                  <span className="text-sm text-muted">@{u.username}</span>
                </button>
              ))}
            </div>
          )}
          {results.messages.length > 0 && (
            <div>
              <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Сообщения</p>
              {results.messages.map((m) => (
                <button
                  key={m.id}
                  onClick={() => router.push(`/chat/${m.chatId}`)}
                  className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-surface-alt"
                >
                  <span className="truncate text-sm text-text">{m.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex gap-1 overflow-x-auto px-3 pb-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  tab === t.id ? "bg-accent text-accent-contrast" : "bg-surface-alt text-muted hover:text-text"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto pb-2">
            {visible.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">Чатов нет</p>}
            {visible.map((c) => (
              <ChatListItem key={c.id} chat={c} active={params.id === c.id} onPatch={patchChat} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
