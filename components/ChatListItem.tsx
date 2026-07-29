"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { Icon } from "./icons";
import { DropdownMenu, MenuItem } from "./DropdownMenu";
import type { ChatSummary } from "@/lib/data/chat-summary";
import { useCurrentUser } from "@/lib/client/CurrentUserContext";

function timeLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function preview(chat: ChatSummary, meId: string): string {
  if (chat.draft) return chat.draft;
  const m = chat.lastMessage;
  if (!m) return "Нет сообщений";
  if (m.type === "system") return m.text;
  const who = m.senderId === meId ? "Вы: " : chat.type === "group" || chat.type === "channel" ? "" : "";
  if (m.deleted) return `${who}Сообщение удалено`;
  const att = m.attachments?.[0];
  if (att) {
    const map: Record<string, string> = {
      image: "📷 Фото",
      file: "📄 Файл",
      voice: "🎤 Голосовое сообщение",
      "video-note": "⏺ Видео-кружок",
      poll: `📊 ${m.text}`,
      location: "📍 Геолокация",
      contact: "👤 Контакт",
    };
    return `${who}${map[att.kind] ?? m.text}`;
  }
  return `${who}${m.text}`;
}

export function ChatListItem({
  chat,
  active,
  onPatch,
}: {
  chat: ChatSummary;
  active: boolean;
  onPatch: (id: string, patch: Partial<ChatSummary>) => void;
}) {
  const me = useCurrentUser();
  const router = useRouter();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const title = chat.type === "dm" || chat.type === "secret" ? chat.otherUser?.name ?? chat.title : chat.title;
  const online = (chat.type === "dm" || chat.type === "secret") && chat.otherUser?.online;

  return (
    <div className="relative">
      <button
        onClick={() => router.push(`/chat/${chat.id}`)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors ${
          active ? "bg-accent-soft" : "hover:bg-surface-alt"
        }`}
      >
        <Avatar
          name={chat.otherUser?.name ?? title}
          color={chat.avatarColor}
          image={chat.otherUser?.avatarImage}
          online={online}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {chat.type === "secret" && <Icon.Lock size={13} className="shrink-0 text-accent" />}
            <span className="truncate font-medium text-text">{title}</span>
            <span className="ml-auto shrink-0 font-mono text-[11px] text-muted tabular-nums">
              {chat.lastMessage ? timeLabel(chat.lastMessage.createdAt) : ""}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className={`truncate text-[13px] ${chat.draft ? "text-danger" : "text-muted"}`}>
              {preview(chat, me.id)}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1">
              {chat.pinned && <Icon.Pin size={12} className="text-muted" />}
              {chat.muted && <Icon.BellOff size={12} className="text-muted" />}
              {chat.unreadCount > 0 && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 font-mono text-[10.5px] font-medium text-accent-contrast tabular-nums">
                  {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                </span>
              )}
            </span>
          </div>
        </div>
      </button>

      {menu && (
        <DropdownMenu pos={menu} onClose={() => setMenu(null)}>
          <MenuItem
            icon={<Icon.Pin size={16} />}
            onClick={() => {
              onPatch(chat.id, { pinned: !chat.pinned });
              setMenu(null);
            }}
          >
            {chat.pinned ? "Открепить" : "Закрепить"}
          </MenuItem>
          <MenuItem
            icon={chat.muted ? <Icon.Bell size={16} /> : <Icon.BellOff size={16} />}
            onClick={() => {
              onPatch(chat.id, { muted: !chat.muted });
              setMenu(null);
            }}
          >
            {chat.muted ? "Включить уведомления" : "Отключить уведомления"}
          </MenuItem>
          <MenuItem
            icon={<Icon.Archive size={16} />}
            onClick={() => {
              onPatch(chat.id, { archived: !chat.archived });
              setMenu(null);
            }}
          >
            {chat.archived ? "Вернуть из архива" : "Архивировать"}
          </MenuItem>
        </DropdownMenu>
      )}
    </div>
  );
}
