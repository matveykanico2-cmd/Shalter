"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "../Avatar";
import { Icon } from "../icons";
import { DropdownMenu, MenuItem } from "../DropdownMenu";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { InfoPanel } from "./InfoPanel";
import { ForwardDialog } from "./ForwardDialog";
import { useCurrentUser } from "@/lib/client/CurrentUserContext";
import { api } from "@/lib/client/api";
import { notifyChatsChanged } from "@/lib/client/refresh";
import type { ChatSummary } from "@/lib/data/chat-summary";
import type { Bot, Message, PublicUser } from "@/lib/types";

function lastSeenLabel(user: PublicUser) {
  if (user.online) return "в сети";
  const d = new Date(user.lastSeen);
  return `был(а) в сети ${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })} в ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

export function ChatView({
  chat: initialChat,
  members: initialMembers,
  initialMessages,
  bot,
}: {
  chat: ChatSummary;
  members: PublicUser[];
  initialMessages: Message[];
  bot: Bot | null;
}) {
  const me = useCurrentUser();
  const router = useRouter();
  const [chat, setChat] = useState(initialChat);
  const [members, setMembers] = useState(initialMembers);
  const [messages, setMessages] = useState(initialMessages);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [pinIndex, setPinIndex] = useState(0);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [typingUserId, setTypingUserId] = useState<string | null>(null);
  const [iBlockedThem, setIBlockedThem] = useState(
    () => !!initialChat.otherUser && !!me.blockedUserIds?.includes(initialChat.otherUser.id)
  );
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, []);

  useEffect(() => {
    if (messages.length > initialMessages.length) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, initialMessages.length]);

  const isDm = chat.type === "dm" || chat.type === "secret";
  const other = chat.otherUser;
  const title = isDm ? other?.name ?? chat.title : chat.title;
  const pinned = messages.filter((m) => m.pinned && !m.deleted);

  const subtitle = useMemo(() => {
    if (typingUserId) {
      if (isDm) return "печатает…";
      const typist = members.find((m) => m.id === typingUserId);
      if (typist) return `${typist.name} печатает…`;
    }
    if (chat.type === "bot") return "бот";
    if (isDm && other) return lastSeenLabel(other);
    if (chat.type === "group") return `${members.length} участников`;
    if (chat.type === "channel") return `${members.length} подписчиков`;
    return "";
  }, [typingUserId, chat.type, isDm, other, members]);

  async function refreshMessages() {
    const { messages } = await api.listMessages(chat.id);
    setMessages(messages);
  }

  // Polling stands in for a realtime transport: keeps this chat's messages
  // (and the sidebar's unread counts) current across tabs/accounts without
  // requiring a manual page refresh.
  useEffect(() => {
    const iv = setInterval(refreshMessages, 3000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id]);

  useEffect(() => {
    let cancelled = false;
    const poll = () =>
      api.getTyping(chat.id).then((r) => {
        if (!cancelled) setTypingUserId(r.typingUserId);
      });
    poll();
    const iv = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [chat.id]);

  async function handleSend(text: string, attachments?: Message["attachments"]) {
    const replyToId = replyingTo?.id ?? null;
    setReplyingTo(null);
    try {
      await api.sendMessage(chat.id, text, { replyToId, attachments });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось отправить сообщение");
    }
    await refreshMessages();
    notifyChatsChanged();
  }

  async function handleForward(message: Message, targetChatId: string) {
    const sender = members.find((u) => u.id === message.senderId);
    await api.sendMessage(targetChatId, message.text, {
      attachments: message.attachments,
      forwardedFrom: {
        chatId: chat.id,
        chatTitle: title,
        senderId: message.senderId,
        senderName: sender?.name ?? "Аноним",
      },
    });
    notifyChatsChanged();
  }

  async function handleSaveEdit(text: string) {
    if (!editingMessage) return;
    setEditingMessage(null);
    await api.editMessage(chat.id, editingMessage.id, text);
    await refreshMessages();
  }

  async function handleDelete(m: Message) {
    await api.deleteMessage(chat.id, m.id);
    await refreshMessages();
    notifyChatsChanged();
  }

  async function handleReact(m: Message, emoji: string) {
    setMessages((prev) =>
      prev.map((mm) => {
        if (mm.id !== m.id) return mm;
        const existing = mm.reactions.find((r) => r.emoji === emoji);
        let reactions = mm.reactions.map((r) => ({ ...r, userIds: [...r.userIds] }));
        if (existing) {
          existing.userIds = existing.userIds.includes(me.id)
            ? existing.userIds.filter((u) => u !== me.id)
            : [...existing.userIds, me.id];
          reactions = reactions.filter((r) => r.userIds.length > 0);
        } else {
          reactions.push({ emoji, userIds: [me.id] });
        }
        return { ...mm, reactions };
      })
    );
    await api.react(chat.id, m.id, emoji);
  }

  async function handlePin(m: Message) {
    await api.pinMessage(chat.id, m.id, !m.pinned);
    await refreshMessages();
  }

  async function toggleMute() {
    const muted = !chat.muted;
    setChat((c) => ({ ...c, muted }));
    await api.patchChat(chat.id, { muted });
    notifyChatsChanged();
  }

  async function setSecretTimer(sec: number | null) {
    setChat((c) => ({ ...c, secretTimer: sec }));
    await api.patchChat(chat.id, { secretTimer: sec });
  }

  async function placeCall(kind: "audio" | "video") {
    const { call } = await api.placeCall(chat.id, kind);
    router.push(`/call/${call.id}`);
  }

  function jumpTo(id: string) {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleClearHistory() {
    if (!confirm("Очистить всю историю сообщений в этом чате?")) return;
    await api.clearHistory(chat.id);
    setMessages([]);
    notifyChatsChanged();
  }

  async function handleLeaveOrDelete() {
    const isGroupLike = chat.type === "group" || chat.type === "channel";
    const label = chat.type === "channel" ? "отписаться от канала" : isGroupLike ? "покинуть группу" : "удалить чат";
    if (!confirm(`Вы уверены, что хотите ${label}?`)) return;
    if (isGroupLike) await api.leaveChat(chat.id);
    else await api.deleteChat(chat.id);
    notifyChatsChanged();
    router.push("/");
  }

  async function toggleBlock() {
    if (!other) return;
    const next = !iBlockedThem;
    setIBlockedThem(next);
    await api.setBlocked(other.id, next);
  }

  async function handleMemberAction(userId: string, role: "kick" | "promote" | "demote") {
    await api.setMemberRole(chat.id, userId, role);
    const { chat: updated, members: refreshedMembers } = await api.getChat(chat.id);
    setChat(updated);
    setMembers(refreshedMembers);
  }

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2.5">
          <button
            onClick={() => router.push("/")}
            className="rounded-full p-1.5 text-muted hover:bg-surface-alt md:hidden"
          >
            <Icon.ChevronLeft size={20} />
          </button>
          <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => setInfoOpen(true)}>
            <Avatar
              name={other?.name ?? title}
              color={chat.avatarColor}
              image={isDm ? other?.avatarImage : undefined}
              size={38}
              online={isDm ? other?.online : undefined}
            />
            <div className="min-w-0">
              <p className="flex items-center gap-1 truncate font-medium">
                {chat.type === "secret" && <Icon.Lock size={13} className="text-accent" />}
                {title}
              </p>
              <p className="truncate text-xs text-muted">{subtitle}</p>
            </div>
          </button>
          {(isDm || chat.type === "group") && (
            <>
              <button onClick={() => placeCall("audio")} className="rounded-full p-2 text-muted hover:bg-surface-alt hover:text-text" title="Позвонить">
                <Icon.Phone size={18} />
              </button>
              <button onClick={() => placeCall("video")} className="rounded-full p-2 text-muted hover:bg-surface-alt hover:text-text" title="Видеозвонок">
                <Icon.Video size={18} />
              </button>
            </>
          )}
          <button
            onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}
            className="rounded-full p-2 text-muted hover:bg-surface-alt hover:text-text"
          >
            <Icon.More size={18} />
          </button>
          <button
            onClick={() => setInfoOpen((v) => !v)}
            className="hidden rounded-full p-2 text-muted hover:bg-surface-alt hover:text-text md:block"
          >
            <Icon.Info size={18} />
          </button>
        </header>

        {pinned.length > 0 && (
          <button
            onClick={() => {
              jumpTo(pinned[pinIndex % pinned.length].id);
              setPinIndex((i) => i + 1);
            }}
            className="flex items-center gap-2 border-b border-border bg-accent-soft px-4 py-1.5 text-left"
          >
            <Icon.Pin size={14} className="shrink-0 text-accent" />
            <span className="truncate text-[13px] text-text">{pinned[pinIndex % pinned.length].text}</span>
            {pinned.length > 1 && <span className="ml-auto font-mono text-[11px] text-muted">{pinned.length}</span>}
          </button>
        )}

        <div ref={listRef} className="flex-1 overflow-y-auto py-3">
          {messages.length === 0 && (
            <p className="mt-10 text-center text-sm text-muted">Сообщений пока нет — напишите первым</p>
          )}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const showSender = (chat.type === "group" || chat.type === "channel") && (!prev || prev.senderId !== m.senderId);
            const sender = members.find((u) => u.id === m.senderId);
            const replyToMessage = m.replyToId ? messages.find((x) => x.id === m.replyToId) : undefined;
            return (
              <MessageBubble
                key={m.id}
                message={m}
                me={me}
                sender={sender}
                showSender={showSender}
                replyToMessage={replyToMessage}
                onReply={setReplyingTo}
                onEdit={setEditingMessage}
                onDelete={handleDelete}
                onReact={handleReact}
                onPin={handlePin}
                onJumpTo={jumpTo}
                onForward={setForwardMessage}
              />
            );
          })}
        </div>

        {iBlockedThem ? (
          <div className="flex items-center justify-between border-t border-border bg-surface-alt px-4 py-3">
            <p className="text-sm text-muted">Вы заблокировали этого пользователя</p>
            <button onClick={toggleBlock} className="rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-contrast">
              Разблокировать
            </button>
          </div>
        ) : (
          <Composer
            key={`composer-${editingMessage?.id ?? "compose"}`}
            chatId={chat.id}
            replyingTo={replyingTo}
            editingMessage={editingMessage}
            onCancelReply={() => setReplyingTo(null)}
            onCancelEdit={() => setEditingMessage(null)}
            onSend={handleSend}
            onSaveEdit={handleSaveEdit}
          />
        )}
      </div>

      {infoOpen && (
        <InfoPanel
          chat={chat}
          members={members}
          messages={messages}
          bot={bot}
          isBlocked={iBlockedThem}
          onClose={() => setInfoOpen(false)}
          onToggleMute={toggleMute}
          onSetSecretTimer={setSecretTimer}
          onToggleBlock={toggleBlock}
          onMemberAction={handleMemberAction}
        />
      )}

      {forwardMessage && (
        <ForwardDialog
          onPick={(chatId) => handleForward(forwardMessage, chatId)}
          onClose={() => setForwardMessage(null)}
        />
      )}

      {menu && (
        <DropdownMenu pos={menu} onClose={() => setMenu(null)}>
          <MenuItem icon={chat.muted ? <Icon.Bell size={16} /> : <Icon.BellOff size={16} />} onClick={() => {
            toggleMute();
            setMenu(null);
          }}>
            {chat.muted ? "Включить уведомления" : "Отключить уведомления"}
          </MenuItem>
          <MenuItem icon={<Icon.Info size={16} />} onClick={() => {
            setInfoOpen(true);
            setMenu(null);
          }}>
            Информация о чате
          </MenuItem>
          <MenuItem icon={<Icon.Trash size={16} />} onClick={() => {
            handleClearHistory();
            setMenu(null);
          }}>
            Очистить историю
          </MenuItem>
          <MenuItem
            danger
            icon={<Icon.X size={16} />}
            onClick={() => {
              handleLeaveOrDelete();
              setMenu(null);
            }}
          >
            {chat.type === "channel" ? "Отписаться от канала" : chat.type === "group" ? "Покинуть группу" : "Удалить чат"}
          </MenuItem>
        </DropdownMenu>
      )}
    </div>
  );
}
