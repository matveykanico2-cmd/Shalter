"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "../Avatar";
import { Icon } from "../icons";
import { DropdownMenu, MenuItem } from "../DropdownMenu";
import { useCurrentUser } from "@/lib/client/CurrentUserContext";
import type { ChatSummary } from "@/lib/data/chat-summary";
import type { Bot, Message, PublicUser } from "@/lib/types";

const MEDIA_TABS = [
  { id: "image", label: "Медиа" },
  { id: "file", label: "Файлы" },
  { id: "voice", label: "Голосовые" },
] as const;

function roleLabel(chat: ChatSummary, userId: string) {
  if (chat.ownerId === userId) return "владелец";
  if (chat.adminIds?.includes(userId)) return "админ";
  return null;
}

export function InfoPanel({
  chat,
  members,
  messages,
  bot,
  isBlocked,
  onClose,
  onToggleMute,
  onSetSecretTimer,
  onToggleBlock,
  onMemberAction,
}: {
  chat: ChatSummary;
  members: PublicUser[];
  messages: Message[];
  bot: Bot | null;
  isBlocked: boolean;
  onClose: () => void;
  onToggleMute: () => void;
  onSetSecretTimer: (sec: number | null) => void;
  onToggleBlock: () => void;
  onMemberAction?: (userId: string, role: "kick" | "promote" | "demote") => void;
}) {
  const router = useRouter();
  const me = useCurrentUser();
  const [mediaTab, setMediaTab] = useState<(typeof MEDIA_TABS)[number]["id"]>("image");
  const [memberMenu, setMemberMenu] = useState<{ x: number; y: number; userId: string } | null>(null);
  const isDm = chat.type === "dm" || chat.type === "secret";
  const other = chat.otherUser;
  const iCanManage = chat.ownerId === me.id || chat.adminIds?.includes(me.id);

  const mediaItems = messages.flatMap((m) => (m.attachments ?? []).filter((a) => a.kind === mediaTab).map((a) => ({ m, a })));

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="font-serif text-base font-semibold">Информация</p>
        <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-surface-alt">
          <Icon.X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <Avatar
            name={isDm ? other?.name ?? chat.title : chat.title}
            color={chat.avatarColor}
            image={isDm ? other?.avatarImage : undefined}
            size={84}
            online={isDm ? other?.online : undefined}
          />
          <p className="font-serif text-lg font-semibold">{isDm ? other?.name ?? chat.title : chat.title}</p>
          {isDm && other?.username && <p className="text-sm text-muted">@{other.username}</p>}
          {chat.type === "group" && <p className="text-sm text-muted">{members.length} участников</p>}
          {chat.type === "channel" && <p className="text-sm text-muted">{members.length} подписчиков · канал</p>}
          {isDm && other?.bio && <p className="mt-1 text-sm text-text">{other.bio}</p>}
          {(chat.type === "group" || chat.type === "channel") && chat.description && (
            <p className="mt-1 text-sm text-muted">{chat.description}</p>
          )}
          {bot && <p className="mt-1 text-sm text-muted">{bot.description}</p>}

          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button
              onClick={onToggleMute}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
            >
              {chat.muted ? <Icon.Bell size={14} /> : <Icon.BellOff size={14} />}
              {chat.muted ? "Включить уведомления" : "Отключить"}
            </button>
            {isDm && other && (
              <button
                onClick={onToggleBlock}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                  isBlocked ? "border-accent bg-accent-soft text-accent" : "border-border text-danger hover:bg-surface-alt"
                }`}
              >
                <Icon.X size={14} />
                {isBlocked ? "Разблокировать" : "Заблокировать"}
              </button>
            )}
          </div>
        </div>

        {chat.type === "secret" && (
          <div className="border-t border-border px-4 py-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-accent">
              <Icon.Lock size={14} /> Секретный чат
            </p>
            <p className="mb-3 text-[13px] text-muted">
              Доступен только на устройстве, где создан. Веб-клиент не может гарантированно заблокировать
              пересылку или скриншоты.
            </p>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
              Самоуничтожение
            </label>
            <select
              value={chat.secretTimer ?? ""}
              onChange={(e) => onSetSecretTimer(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm"
            >
              <option value="">Выключено</option>
              <option value="10">10 секунд</option>
              <option value="60">1 минута</option>
              <option value="3600">1 час</option>
              <option value="86400">1 день</option>
            </select>
          </div>
        )}

        {(chat.type === "group" || chat.type === "channel") && (
          <div className="border-t border-border">
            <p className="px-4 pt-4 text-xs font-medium uppercase tracking-wide text-muted">
              {chat.type === "group" ? "Участники" : "Администраторы"}
            </p>
            <div className="py-1">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2.5 px-4 py-2">
                  <Avatar name={m.name} color={m.avatarColor} image={m.avatarImage} size={32} online={m.online} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                  </div>
                  {roleLabel(chat, m.id) && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                      {roleLabel(chat, m.id)}
                    </span>
                  )}
                  {iCanManage && m.id !== chat.ownerId && m.id !== me.id && onMemberAction && (
                    <button
                      onClick={(e) => setMemberMenu({ x: e.clientX, y: e.clientY, userId: m.id })}
                      className="rounded-full p-1 text-muted hover:bg-surface-alt"
                    >
                      <Icon.More size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {chat.type === "channel" && chat.linkedDiscussionChatId && (
              <button
                onClick={() => router.push(`/chat/${chat.linkedDiscussionChatId}`)}
                className="mx-4 mb-4 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-accent hover:bg-surface-alt"
              >
                <Icon.Users size={15} /> Обсуждение
              </button>
            )}
          </div>
        )}

        <div className="border-t border-border">
          <div className="flex gap-1 px-3 pt-3">
            {MEDIA_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setMediaTab(t.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  mediaTab === t.id ? "bg-accent text-accent-contrast" : "bg-surface-alt text-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="px-4 py-3">
            {mediaItems.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">Пусто</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {mediaItems.map(({ a }, i) => (
                  <li key={i} className="truncate text-sm text-muted">
                    {a.name ?? a.kind}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {memberMenu && onMemberAction && (
        <DropdownMenu pos={memberMenu} onClose={() => setMemberMenu(null)}>
          {!chat.adminIds?.includes(memberMenu.userId) ? (
            <MenuItem
              onClick={() => {
                onMemberAction(memberMenu.userId, "promote");
                setMemberMenu(null);
              }}
            >
              Сделать админом
            </MenuItem>
          ) : (
            <MenuItem
              onClick={() => {
                onMemberAction(memberMenu.userId, "demote");
                setMemberMenu(null);
              }}
            >
              Убрать из админов
            </MenuItem>
          )}
          <MenuItem
            danger
            icon={<Icon.Trash size={16} />}
            onClick={() => {
              onMemberAction(memberMenu.userId, "kick");
              setMemberMenu(null);
            }}
          >
            Исключить из группы
          </MenuItem>
        </DropdownMenu>
      )}
    </aside>
  );
}
