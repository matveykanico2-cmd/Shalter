import { type PointerEvent, useRef, useState } from "react";
import { useMatch, useNavigate } from "react-router";

import { useLongPress } from "@/shared/lib/use-long-press";
import { Avatar, EmojiText, Icon } from "@/shared/ui";

import { chatPreview, chatTitle, isChatMuted, timeLabel } from "../lib/chat-list";
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
};

const SWIPE_ACTION_PX = 72;
const SWIPE_MAX_PX = 140;

/** Строка списка чатов — public/js/components/chatListItem.js. */
export function ChatRow({ chat, meId, onMenu, onSwipe }: Props) {
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
  const onPointerDown = (e: PointerEvent) => {
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
      onContextMenu={(e) => {
        if (!onMenu || hold.swallow(e)) return;
        e.preventDefault();
        onMenu({ x: e.clientX, y: e.clientY });
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
        <Avatar
          size={54}
          name={chat.otherUser?.name ?? title}
          color={chat.otherUser?.avatarColor ?? chat.avatarColor}
          image={chat.otherUser?.avatarImage ?? chat.avatarImage}
          online={chat.type === "dm" && !!chat.otherUser?.online}
        />
      )}
      <span className={styles.body}>
        <span className={styles.line}>
          {chat.secret ? (
            <span className={styles.lock} title="Секретный чат">
              <Icon name="Lock" size={13} />
            </span>
          ) : null}
          <span className={chat.secret ? `${styles.title} ${styles.secret}` : styles.title}>
            <EmojiText text={title} />
          </span>
          {verified ? (
            <span className={styles.verified} title="Аккаунт подтверждён администрацией Shalter">
              <Icon name="Verified" size={13} />
            </span>
          ) : null}
          <span className={styles.time}>{chat.lastMessage ? timeLabel(chat.lastMessage.createdAt) : ""}</span>
        </span>
        <span className={styles.line}>
          <span className={styles.preview}>
            {preview.draft ? <span className={styles.draft}>Черновик: </span> : null}
            {preview.who}
            <EmojiText text={preview.text} />
          </span>
          <span className={styles.badges}>
            {chat.pinned ? <Icon name="Pin" size={12} /> : null}
            {muted ? <Icon name="BellOff" size={12} /> : null}
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
