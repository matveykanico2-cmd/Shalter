import { useState } from "react";
import { Link } from "react-router";

import { ChatMenu } from "@/features/chat-actions";
import { ScheduledList } from "@/features/send-message";
import { useTopicsToggle } from "@/features/topics";

import { type ChatMember, type ChatSummary, chatTitle } from "@/entities/chat";
import type { SelfUser } from "@/entities/session";

import { Avatar, Icon, type MenuItem } from "@/shared/ui";

import { chatSubtitle } from "../lib/subtitle";
import { usePresenceSync } from "../model/use-presence-sync";
import { useTyping } from "../model/use-typing";

import styles from "./chat-header.module.css";

type Props = { chat: ChatSummary; members: readonly ChatMember[]; me: SelfUser; onSearch: () => void };

/** Шапка открытого чата: назад, аватар, название, «в сети» / «печатает…» / участники, меню «Ещё». */
export function ChatHeader({ chat, members, me, onSearch }: Props) {
  const meId = me.id;
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const topicsToggle = useTopicsToggle(chat, meId);
  const search: MenuItem = { icon: "Search", label: "Поиск по чату", onClick: onSearch };
  const scheduled: MenuItem = { icon: "Clock", label: "Запланированные сообщения", onClick: () => setScheduledOpen(true) };
  const typing = useTyping(chat.id, meId);
  const now = usePresenceSync(chat.id);
  const title = chatTitle(chat);
  const other = chat.otherUser;
  const subtitle = chatSubtitle(chat, members, meId, typing, now);
  return (
    <header className={styles.header}>
      <Link to="/" className={styles.back} title="Назад к чатам">
        <Icon name="ChevronLeft" size={22} />
      </Link>
      {chat.isSaved ? (
        <span className={styles.saved}>
          <Icon name="Bookmark" size={20} />
        </span>
      ) : (
        <Avatar
          size={40}
          name={other?.name ?? title}
          color={other?.avatarColor ?? chat.avatarColor}
          image={other?.avatarImage ?? chat.avatarImage}
          online={chat.type === "dm" && !!other?.online}
        />
      )}
      <div className={styles.titles}>
        <h1 className={styles.title}>
          {chat.secret ? (
            <span className={styles.lock} title="Секретный чат">
              <Icon name="Lock" size={14} />
            </span>
          ) : null}
          <span className={styles.titleText}>{title}</span>
          {!chat.isSaved && (chat.type === "dm" ? other?.isVerified : chat.isVerified) ? (
            <span className={styles.verified} title="Подтверждённый аккаунт">
              <Icon name="Verified" size={15} />
            </span>
          ) : null}
        </h1>
        {subtitle.text ? (
          <p className={styles[subtitle.tone]} aria-live="polite">
            {subtitle.text}
          </p>
        ) : null}
      </div>
      <ChatMenu chat={chat} me={me} topItems={topicsToggle ? [search, topicsToggle] : [search]} middleItems={[scheduled]} />
      {scheduledOpen ? <ScheduledList chatId={chat.id} onClose={() => setScheduledOpen(false)} /> : null}
    </header>
  );
}
