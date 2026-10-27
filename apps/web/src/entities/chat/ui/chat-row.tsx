import { useQueryClient } from "@tanstack/react-query";
import { type PointerEvent, useRef, useState } from "react";
import { useMatch, useNavigate } from "react-router";

import { hasMediaPreview, MediaPreview } from "@/entities/message/@x/chat";
import { SafetyBadge } from "@/entities/safety-label/@x/chat";
import { ProfileStatusBadge } from "@/entities/user/@x/chat";

import { useLongPress } from "@/shared/lib/use-long-press";
import { Avatar, EmojiText, Icon } from "@/shared/ui";

import { chatPreview, chatTitle, isChatMuted, timeLabel } from "../lib/chat-list";
import { prefetchChat } from "../model/prefetch-chat";
import type { ChatSummary } from "../model/types";

import styles from "./chat-row.module.css";

type Point = { x: number; y: number };

type Props = {
  chat: ChatSummary;
  meId: string;
  /** Меню чата: правая кнопка, долгое нажатие пальцем или «⋮». */
  onMenu?: (at: Point) => void;
  /** Свайп влево пальцем: на 72 px — звук, на 144 px — архив. */
  onSwipe?: (action: "mute" | "archive") => void;
  /** Чат входит в сообщество — значок на аватаре открывает его панель (CommunityChildBadge). */
  community?: { title: string; onOpen: () => void } | null;
};

const SWIPE_ACTION_PX = 72;
const SWIPE_MAX_PX = 140;

/** Строка списка чатов — public/js/components/chatListItem.js. */
export function ChatRow({ chat, meId, onMenu, onSwipe, community }: Props) {
  const title = chatTitle(chat);
  const muted = isChatMuted(chat);
  const preview = chatPreview(chat, meId);
  const verified = chat.type === "dm" ? chat.otherUser?.isVerified : chat.isVerified;
  const hold = useLongPress((at) => onMenu?.(at), "button");
  const swipe = useRef<{ x: number; y: number; active: boolean | null } | null>(null);
  const [shift, setShift] = useState(0);
  const endSwipe = () => {
    swipe.current = null;
    setShift(0);
  };
  const client = useQueryClient();
  const onPointerDown = (e: PointerEvent) => {
    prefetchChat(client, chat);
    if (onMenu) hold.onPointerDown(e);
    swipe.current = e.pointerType !== "mouse" && onSwipe ? { x: e.clientX, y: e.clientY, active: null } : null;
  };
  const onPointerMove = (e: PointerEvent) => {
    if (onMenu) hold.onPointerMove(e);
    const s = swipe.current;
    if (!s || s.active === false) return;
    const dx = e.clientX - s.x;
    if (s.active === null) {
      if (Math.abs(dx) < 12 && Math.abs(e.clientY - s.y) < 12) return;
      s.active = Math.abs(dx) > Math.abs(e.clientY - s.y) && dx < 0;
      if (!s.active) return;
      hold.onPointerCancel();
    }
    setShift(Math.max(-SWIPE_MAX_PX, Math.min(0, dx)));
  };
  const onPointerUp = (e: PointerEvent) => {
    hold.onPointerUp();
    const s = swipe.current;
    endSwipe();
    if (!s?.active) return;
    const dx = e.clientX - s.x;
    if (dx <= -SWIPE_ACTION_PX * 2) onSwipe?.("archive");
    else if (dx <= -SWIPE_ACTION_PX) onSwipe?.("mute");
  };
  const swiping = shift < 0;
  // Строка — кнопка, как в chatListItem.js: превью в ней не путается с текстом сообщений в чате.
  const navigate = useNavigate();
  const active = !!useMatch(`/chat/${chat.id}`);

  return (
    <div
      className={swiping ? `${styles.wrap} ${styles.swiping}` : styles.wrap}
      // Группа с именем чата связывает кнопку «Действия с чатом» со своей строкой.
      role="group"
      aria-label={title}
      onContextMenu={(e) => {
        if (!onMenu || hold.swallow(e)) return;
        e.preventDefault();
        onMenu({ x: e.clientX, y: e.clientY });
      }}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") prefetchChat(client, chat);
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        hold.onPointerCancel();
        endSwipe();
      }}
      onPointerLeave={hold.onPointerLeave}
      onClickCapture={(e) => void hold.swallow(e)}
    >
      {onSwipe ? (
        <div className={styles.swipeActions} aria-hidden="true">
          <span className={`${styles.swipeAction} ${styles.swipeMute}`}>{muted ? "Со звуком" : "Без звука"}</span>
          <span className={`${styles.swipeAction} ${styles.swipeArchive}`}>{chat.archived ? "Из архива" : "В архив"}</span>
        </div>
      ) : null}
    <button
      type="button"
      onClick={() => void navigate(`/chat/${chat.id}`)}
      aria-current={active ? "page" : undefined}
      className={[styles.row, active ? styles.active : "", onMenu ? styles.withMore : ""].filter(Boolean).join(" ")}
      style={shift ? { transform: `translateX(${shift}px)` } : undefined}
      draggable={false}
    >
      {chat.isSaved ? (
        <span className={styles.saved}>
          <Icon name="Bookmark" size={24} />
        </span>
      ) : (
        <span className={styles.avatarWrap}>
          <Avatar
            size={54}
            name={chat.otherUser?.name ?? title}
            color={chat.otherUser?.avatarColor ?? chat.avatarColor}
            image={chat.otherUser?.avatarImage ?? chat.avatarImage}
            online={chat.type === "dm" && !!chat.otherUser?.online}
          />
          {community ? (
            <span
              className={styles.communityBadge}
              role="button"
              tabIndex={-1}
              title={`Сообщество «${community.title}»`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                community.onOpen();
              }}
            >
              <Icon name="ChevronDown" size={11} />
            </span>
          ) : null}
        </span>
      )}
      <span className={styles.body}>
        <span className={styles.line}>
          {chat.secret ? (
            <span className={styles.lock} title="Секретный чат">
              <Icon name="Lock" size={13} />
            </span>
          ) : null}
          <span className={chat.secret ? `${styles.title} ${styles.secret}` : styles.title} translate="no">
            <EmojiText text={title} />
          </span>
          {verified ? (
            <span className={styles.verified} title="Аккаунт подтверждён администрацией Shalter">
              <Icon name="Verified" size={13} />
            </span>
          ) : null}
          {chat.otherUser?.isDeveloper ? (
            <span className={styles.verified} title="Разработчик Shalter">
              <Icon name="Code" size={13} />
            </span>
          ) : null}
          {chat.otherUser?.isPremium ? (
            <span className={styles.premium} title="Shalter Premium">
              <Icon name="Star" size={14} />
            </span>
          ) : null}
          <ProfileStatusBadge user={statusOf(chat)} size={15} />
          {chat.type === "dm" && chat.otherUser?.safetyLabel ? <SafetyBadge label={chat.otherUser.safetyLabel} mini /> : null}
          <span className={styles.time}>{chat.lastMessage ? timeLabel(chat.lastMessage.createdAt) : ""}</span>
        </span>
        <span className={styles.line}>
          {/* Последнее сообщение с медиа — миниатюрой (кружок, фото, видео, голосовое, подарок). */}
          {!preview.draft && chat.lastMessage && chat.lastMessage.type !== "system" && chat.lastMessage.type !== "call" && hasMediaPreview(chat.lastMessage) ? (
            <MediaPreview className={styles.preview} message={chat.lastMessage} who={preview.who} />
          ) : (
            <span className={styles.preview} translate="no">
              {preview.draft ? <span className={styles.draft}>Черновик: </span> : null}
              {preview.who}
              <EmojiText text={preview.text} />
            </span>
          )}
          <span className={styles.badges}>
            {chat.pinned ? <Icon name="Pin" size={12} /> : null}
            {/* Звук чата — всегда: перечёркнутый динамик, когда уведомления выключены. */}
            <Icon name={muted ? "VolumeOff" : "Volume"} size={12} className={styles.sound} />
            {chat.hasUnreadMention ? <span className={styles.mention}>@</span> : null}
            {chat.unreadCount > 0 ? (
              <span className={styles.unread}>{chat.unreadCount > 99 ? "99+" : String(chat.unreadCount)}</span>
            ) : chat.unread ? (
              <span className={`${styles.unread} ${styles.unreadMark}`} aria-label="Отмечен как непрочитанный" />
            ) : null}
          </span>
        </span>
      </span>
    </button>
      {onMenu ? (
        <button
          type="button"
          className={styles.more}
          title="Действия с чатом"
          aria-label="Действия с чатом"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            onMenu({ x: r.right - 8, y: r.bottom + 2 });
          }}
        >
          <Icon name="MoreVertical" size={18} />
        </button>
      ) : null}
    </div>
  );
}

/** Статус после имени — у собеседника в личке, у группы и канала свой (ProfileStatusBadge в chatListItem.js). */
function statusOf(chat: ChatSummary) {
  const who = (chat.type === "dm" ? chat.otherUser : chat) as { statusIcon?: unknown; statusName?: unknown } | null | undefined;
  return {
    statusIcon: typeof who?.statusIcon === "string" ? who.statusIcon : null,
    statusName: typeof who?.statusName === "string" ? who.statusName : null,
  };
}
