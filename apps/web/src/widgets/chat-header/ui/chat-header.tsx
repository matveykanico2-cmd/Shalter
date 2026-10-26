import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import { BotAppButton, botAppQueries } from "@/features/bot-app";
import { CallButtons, useVoiceRoomItem } from "@/features/call";
import { ChatMenu } from "@/features/chat-actions";
import { WallpaperDialog } from "@/features/chat-wallpaper";
import { useStartLiveItem } from "@/features/live";
import { ScheduledList } from "@/features/send-message";
import { useTopicsToggle } from "@/features/topics";

import { type ChatMember, type ChatSummary, chatTitle, type Typing } from "@/entities/chat";
import type { SelfUser } from "@/entities/session";

import { Avatar, EmojiText, Icon, type MenuItem } from "@/shared/ui";

import { chatSubtitle } from "../lib/subtitle";
import { usePresenceSync } from "../model/use-presence-sync";

import styles from "./chat-header.module.css";

type Props = {
  chat: ChatSummary;
  members: readonly ChatMember[];
  me: SelfUser;
  /** Кто печатает — useTyping в ChatView (его же видит лента). */
  typing: Typing;
  onSearch: () => void;
  /** «Информация о чате» открыта справа. */
  infoOpen: boolean;
  onInfo: (open: boolean) => void;
};

/** Шапка открытого чата: назад, аватар, название, «в сети» / «печатает…» / участники, меню «Ещё». */
export function ChatHeader({ chat, members, me, typing, onSearch, infoOpen, onInfo }: Props) {
  const meId = me.id;
  const [dialog, setDialog] = useState<"wallpaper" | "scheduled" | null>(null);
  const topicsToggle = useTopicsToggle(chat, meId);
  const search: MenuItem = { icon: "Search", label: "Поиск по чату", onClick: onSearch };
  const voiceRoom = useVoiceRoomItem({ chat, me });
  const startLive = useStartLiveItem({ chat, meId });
  const middleItems: MenuItem[] = [
    { icon: "Info", label: "Информация о чате", onClick: () => onInfo(true) },
    { icon: "Image", label: "Фон чата", onClick: () => setDialog("wallpaper") },
    { icon: "Clock", label: "Запланированные сообщения", onClick: () => setDialog("scheduled") },
  ];
  const now = usePresenceSync(chat.id);
  const title = chatTitle(chat);
  const other = chat.otherUser;
  // Личка с ботом: «бот · N пользователей» и кнопка его мини-приложения.
  const bot = chat.type === "dm" && other?.isBot ? other : null;
  const botUsers = useQuery({ ...botAppQueries.audience(bot?.id ?? ""), enabled: !!bot }).data?.users ?? null;
  const subtitle = chatSubtitle(chat, members, meId, typing, now, botUsers);
  return (
    <header className={styles.header}>
      <Link to="/" className={styles.back} title="Назад к чатам">
        <Icon name="ChevronLeft" size={22} />
      </Link>
      {/* Нажатие на аватар и название — как .chat-header-info-btn; с клавиатуры — кнопка «i» и пункт меню. */}
      <div className={styles.info} onClick={() => onInfo(true)}>
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
            <span className={styles.titleText}>
              <EmojiText text={title} />
            </span>
            {!chat.isSaved && (chat.type === "dm" ? other?.isVerified : chat.isVerified) ? (
              <span className={styles.verified} title="Подтверждённый аккаунт">
                <Icon name="Verified" size={15} />
              </span>
            ) : null}
            {chat.type === "dm" && other?.isDeveloper ? (
              <span className={styles.developer} title="Разработчик Shalter">
                <Icon name="Code" size={15} />
              </span>
            ) : null}
            {chat.type === "dm" && other?.isPremium ? (
              <span className={styles.premium} title="Shalter Premium">
                <Icon name="Star" size={15} />
              </span>
            ) : null}
          </h1>
          {subtitle.text ? (
            <p className={styles[subtitle.tone]} aria-live="polite">
              {subtitle.text}
            </p>
          ) : null}
        </div>
      </div>
      {bot ? <BotAppButton bot={bot} chatId={chat.id} /> : null}
      <CallButtons chat={chat} me={me} />
      <button type="button" className={styles.infoToggle} title={infoOpen ? "Скрыть информацию" : "Информация о чате"} aria-pressed={infoOpen} onClick={() => onInfo(!infoOpen)}>
        <Icon name="Info" size={18} />
      </button>
      <ChatMenu chat={chat} me={me} topItems={[search, voiceRoom, topicsToggle, startLive].filter((item): item is MenuItem => !!item)} middleItems={middleItems} />
      {dialog === "wallpaper" ? <WallpaperDialog chat={chat} onClose={() => setDialog(null)} /> : null}
      {dialog === "scheduled" ? <ScheduledList chatId={chat.id} onClose={() => setDialog(null)} /> : null}
    </header>
  );
}
