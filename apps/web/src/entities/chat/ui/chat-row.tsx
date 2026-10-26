import { NavLink } from "react-router";

import { Avatar, EmojiText, Icon } from "@/shared/ui";

import { chatPreview, chatTitle, isChatMuted, timeLabel } from "../lib/chat-list";
import type { ChatSummary } from "../model/types";

import styles from "./chat-row.module.css";

type Props = { chat: ChatSummary; meId: string };

/** Строка списка чатов (public/js/components/chatListItem.js без меню и свайпов). */
export function ChatRow({ chat, meId }: Props) {
  const title = chatTitle(chat);
  const muted = isChatMuted(chat);
  const preview = chatPreview(chat, meId);
  const verified = chat.type === "dm" ? chat.otherUser?.isVerified : chat.isVerified;
  return (
    <NavLink to={`/chat/${chat.id}`} className={({ isActive }) => (isActive ? `${styles.row} ${styles.active}` : styles.row)}>
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
    </NavLink>
  );
}
