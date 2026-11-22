import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import { AiSettingsDialog } from "@/features/ai-settings";
import { BotAppButton, botAppQueries } from "@/features/bot-app";
import { CallButtons, useVoiceRoomItem } from "@/features/call";
import { ChatMenu } from "@/features/chat-actions";
import { WallpaperDialog } from "@/features/chat-wallpaper";
import { useStartLiveItem } from "@/features/live";
import { ScheduledList } from "@/features/send-message";
import { ChannelStoryButton } from "@/features/stories";
import { useTopicsToggle } from "@/features/topics";

import { isChatAdmin, type ChatMember, type ChatSummary, chatTitle, type Typing } from "@/entities/chat";
import { SafetyBadge } from "@/entities/safety-label";
import type { SelfUser } from "@/entities/session";
import { openStoryViewer, storyQueries } from "@/entities/story";
import { openUserProfile, ProfileStatusBadge } from "@/entities/user";

import { Avatar, EmojiText, Icon, type MenuItem } from "@/shared/ui";

import { chatSubtitle } from "../lib/subtitle";
import { usePresenceSync } from "../model/use-presence-sync";

import styles from "./chat-header.module.css";

const SHALTER_AI_ID = "bot_shalter_ai";

type Props = {
  chat: ChatSummary;
  members: readonly ChatMember[];
  me: SelfUser;
  /** Кто печатает — useTyping в ChatView (его же видит лента). */
  typing: Typing;
  hideMembers?: boolean;
  onSearch: () => void;
  /** «Информация о чате» открыта справа. */
  infoOpen: boolean;
  onInfo: (open: boolean) => void;
};

/** Шапка открытого чата: назад, аватар, название, «в сети» / «печатает…» / участники, меню «Ещё». */
export function ChatHeader({ chat, members, me, typing, hideMembers = false, onSearch, infoOpen, onInfo }: Props) {
  const meId = me.id;
  const [dialog, setDialog] = useState<"wallpaper" | "scheduled" | "ai" | null>(null);
  const topicsToggle = useTopicsToggle(chat, meId);
  const search: MenuItem = { icon: "Search", label: "Поиск по чату", onClick: onSearch };
  const voiceRoom = useVoiceRoomItem({ chat, me });
  const startLive = useStartLiveItem({ chat, meId });
  const middleItems: MenuItem[] = [
    // Личка с Shalter AI: тариф и «крутилки» ответов.
    ...(chat.type === "dm" && chat.otherUser?.id === SHALTER_AI_ID ? [{ icon: "Settings", label: "Настройки ИИ и тариф", onClick: () => setDialog("ai") } satisfies MenuItem] : []),
    ...(chat.type === "dm" ? [] : [{ icon: "Info" as const, label: "Информация о чате", onClick: () => onInfo(true) }]),
    { icon: "Image", label: "Фон чата", onClick: () => setDialog("wallpaper") },
    { icon: "Clock", label: "Запланированные сообщения", onClick: () => setDialog("scheduled") },
  ];
  const now = usePresenceSync(chat.id);
  const title = chatTitle(chat);
  const other = chat.otherUser;
  // Личка с ботом: «бот · N пользователей» и кнопка его мини-приложения.
  const bot = chat.type === "dm" && other?.isBot ? other : null;
  const botUsers = useQuery({ ...botAppQueries.audience(bot?.id ?? ""), enabled: !!bot }).data?.users ?? null;
  const subtitle = hideMembers && !typing ? null : chatSubtitle(chat, members, meId, typing, now, botUsers);
  const stories = useQuery({ ...storyQueries.ofUser(other?.id ?? ""), enabled: chat.type === "dm" && !!other && !other.isBot }).data?.group ?? null;
  const channelStories = useQuery({ ...storyQueries.ofUser(chat.id), enabled: chat.type === "channel" }).data?.group ?? null;
  const openAvatar = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    if (chat.type === "dm" && other) openUserProfile(other.id);
    else onInfo(true);
  };
  const avatar = (
    <Avatar
      size={40}
      name={other?.name ?? title}
      color={other?.avatarColor ?? chat.avatarColor}
      image={other?.avatarImage ?? chat.avatarImage}
      emoji={other ? other.avatarEmoji : !chat.avatarType || chat.avatarType === "emoji" ? chat.avatarEmoji : undefined}
      sticker={!other && chat.avatarType === "sticker"}
      online={chat.type === "dm" && !!other?.online}
    />
  );
  return (
    // Шапка чата — banner, как <header> старого клиента вне <main>.
    <header className={styles.header} role="banner">
      <Link to="/" className={styles.back} title="Назад к чатам">
        <Icon name="ChevronLeft" size={20} />
      </Link>
      {/* Нажатие на аватар и название — как .chat-header-info-btn; с клавиатуры — кнопка «i» и пункт меню. */}
      <div
        className={styles.info}
        role="button"
        tabIndex={0}
        aria-label={chat.type === "dm" ? `${title} · Открыть профиль` : `Открыть информацию о чате: ${title}`}
        onClick={() => (chat.type === "dm" && other ? openUserProfile(other.id) : onInfo(true))}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onInfo(true);
          }
        }}
      >
        {chat.isSaved ? (
          <span className={styles.saved}>
            <Icon name="Bookmark" size={20} />
          </span>
        ) : chat.type === "dm" ? (
          <span className={styles.avatarStoryButton} onClick={openAvatar}>
            <span className={stories?.stories.length ? styles.avatarStoryRing : undefined}>
              {avatar}
            </span>
          </span>
        ) : chat.type === "channel" && channelStories ? (
          <span
            className={styles.avatarStoryButton}
            onClick={(event) => {
              event.stopPropagation();
              if (channelStories.stories.length) openStoryViewer([channelStories], 0);
            }}
            role="button"
            tabIndex={0}
            aria-label="Открыть истории канала"
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && channelStories.stories.length) {
                event.preventDefault();
                event.stopPropagation();
                openStoryViewer([channelStories], 0);
              }
            }}
          >
            <span className={channelStories.stories.length ? styles.avatarStoryRing : undefined}>{avatar}</span>
          </span>
        ) : (
          avatar
        )}
        <div className={styles.titles}>
          <h1 className={chat.secret ? `${styles.title} ${styles.secretTitle}` : styles.title} translate="no">
            {chat.secret ? (
              <span className={styles.lock} title="Секретный чат">
                <Icon name="Lock" size={14} />
              </span>
            ) : null}
            <span className={styles.titleText}>
              <EmojiText text={title} />
            </span>
            {!chat.isSaved && (chat.type === "dm" ? other?.isVerified : chat.isVerified) ? (
              <span className={styles.verified} role="img" aria-label="Аккаунт подтверждён администрацией Shalter" title="Аккаунт подтверждён администрацией Shalter">
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
            {chat.type === "dm" && other ? <ProfileStatusBadge user={other} size={15} /> : null}
            {chat.type === "dm" && other?.safetyLabel ? <SafetyBadge label={other.safetyLabel} mini /> : null}
          </h1>
          {subtitle?.text ? (
            <p className={styles[subtitle.tone]} aria-live="polite">
              {subtitle.text}
            </p>
          ) : null}
        </div>
      </div>
      {bot ? <BotAppButton bot={bot} chatId={chat.id} /> : null}
      <div className={styles.actions}>
        {chat.type === "channel" && isChatAdmin(chat, meId) ? (
          <ChannelStoryButton chatId={chat.id}>
            {(open, progress) => (
              <button
                type="button"
                className={styles.storyAction}
                title={progress ?? "Добавить историю канала"}
                aria-label={progress ?? "Добавить историю канала"}
                onClick={open}
                disabled={!!progress}
              >
                <Icon name="Plus" size={19} />
              </button>
            )}
          </ChannelStoryButton>
        ) : null}
        <CallButtons chat={chat} me={me} />
        <ChatMenu chat={chat} me={me} topItems={[search, voiceRoom, topicsToggle, startLive].filter((item): item is MenuItem => !!item)} middleItems={middleItems} />
        {/* «i» — после «Ещё», как .info-toggle в chatView.js. */}
        {chat.type !== "dm" ? (
          <button type="button" className={styles.infoToggle} title={infoOpen ? "Скрыть информацию" : "Информация о чате"} aria-pressed={infoOpen} onClick={() => onInfo(!infoOpen)}>
            <Icon name="Info" size={18} />
          </button>
        ) : null}
        <Link to="/" className={styles.desktopClose} title="Закрыть чат" aria-label="Закрыть чат">
          <Icon name="X" size={19} />
        </Link>
      </div>
      {dialog === "wallpaper" ? <WallpaperDialog chat={chat} onClose={() => setDialog(null)} /> : null}
      {dialog === "scheduled" ? <ScheduledList chatId={chat.id} onClose={() => setDialog(null)} /> : null}
      {dialog === "ai" ? <AiSettingsDialog onClose={() => setDialog(null)} /> : null}
    </header>
  );
}
