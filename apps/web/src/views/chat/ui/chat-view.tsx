import { useQueryClient } from "@tanstack/react-query";
import { type DragEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router";

import { ChatHeader } from "@/widgets/chat-header";
import { ChatInfoPanel } from "@/widgets/chat-info";
import { MessageFeed, type MessageFeedHandle } from "@/widgets/message-feed";

import { ChatSearch } from "@/features/chat-search";
import { useMessageActions } from "@/features/message-actions";
import { useMentionProfile, UserProfileDialog } from "@/features/open-profile";
import { Composer, type ComposerHandle } from "@/features/send-message";
import { isTopicStaff, TopicTabs, useTopics } from "@/features/topics";

import { type ChatMember, chatQueries, type ChatSummary, chatTitle, isChatAdmin, useChatCard, useChatFromList } from "@/entities/chat";
import { inTopic, type Message, MessageLinks, type TopicFilter } from "@/entities/message";
import { type SelfUser, useSession } from "@/entities/session";
import { chatWallpaper, useSettings } from "@/entities/settings";

import { useWsEvent } from "@/shared/api";
import { wallpaperProps } from "@/shared/ui";

import styles from "./chat-view.module.css";

const NO_MEMBERS: ChatMember[] = [];

/** Открытый чат: шапка, лента, поле ввода. */
export function ChatView() {
  const { chatId = "" } = useParams();
  const me = useSession().data?.user;
  const listed = useChatFromList(chatId);
  const card = useChatCard(chatId);
  // Чат изменили (запрет пересылки, темы, участники) — карточка с личным состоянием заново.
  const client = useQueryClient();
  useWsEvent("chat:updated", (e) => {
    if (e.chat.id === chatId) void client.invalidateQueries({ queryKey: chatQueries.card(chatId).queryKey });
  });
  // Пока карточка грузится, чат берём из списка — экран открывается сразу.
  const chat = card.data?.chat ?? listed.data ?? null;

  if (!me) return null;
  if (!chat) {
    if (listed.isPending || card.isPending) return null;
    return <div className={styles.missing}>Чат не найден</div>;
  }
  // key: новый чат — новое состояние ленты и поля ввода (ответ, плашка непрочитанных).
  return <OpenChat key={chat.id} chat={chat} members={card.data?.members ?? NO_MEMBERS} me={me} />;
}

function OpenChat({ chat, members, me }: { chat: ChatSummary; members: readonly ChatMember[]; me: SelfUser }) {
  const feed = useRef<MessageFeedHandle>(null);
  const composer = useRef<ComposerHandle>(null);
  const drop = useFileDrop((files) => composer.current?.attach(files));
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const actions = useMessageActions(chat, me);
  const title = chatTitle(chat);
  const wallpaper = wallpaperProps(chatWallpaper(useSettings().data, chat.id, chat.wallpaper));
  // Темы группы: undefined — «Все», "general" — «Общее», иначе id темы.
  const topics = useTopics(chat);
  const [chosenTopic, setTopic] = useState<TopicFilter>(undefined);
  // Тему удалили или темы выключили — обратно ко всем сообщениям.
  const topic = !topics || (chosenTopic && chosenTopic !== "general" && !topics.some((t) => t.id === chosenTopic)) ? undefined : chosenTopic;
  const openTopic = topic && topic !== "general" ? (topics?.find((t) => t.id === topic) ?? null) : null;
  const selectTopic = (next: TopicFilter) => {
    if (next === topic) return;
    setTopic(next);
    setReplyTo(null);
    setEditing(null);
  };
  // Поиск по чату ищет во всём чате: найденное не в открытой теме — переходим во «Все»,
  // к сообщению — когда лента «Всех» появится.
  // searching — строка запроса (#тег из сообщения) или null, если поиск закрыт.
  const [searching, setSearching] = useState<string | null>(null);
  // Профиль по ссылке /u/имя открывает личку сразу с панелью справа.
  const location = useLocation();
  const [infoOpen, setInfoOpen] = useState(() => !!(location.state as { info?: boolean } | null)?.info);
  const mention = useMentionProfile(me, members);
  const links = { onMention: (h: string) => void mention.openMention(h), onHashtag: (tag: string) => setSearching(tag) };
  // Ссылка на сообщение (?msg=…) — прокрутить к нему.
  const [params] = useSearchParams();
  const linkedMessage = params.get("msg");
  useEffect(() => {
    if (linkedMessage) feed.current?.jumpTo(linkedMessage);
  }, [linkedMessage]);
  const pendingJump = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingJump.current) return;
    feed.current?.jumpTo(pendingJump.current);
    pendingJump.current = null;
  }, [topic]);
  const jumpToFound = (m: Message) => {
    setSearching(null);
    if (inTopic(m, topic)) feed.current?.jumpTo(m.id);
    else {
      pendingJump.current = m.id;
      selectTopic(undefined);
    }
  };
  const reply = (m: Message, quote?: string) => {
    // Правка уступает место ответу. Цитату во время правки не вставляем: поле вернёт набранное до неё.
    const wasEditing = !!editing;
    setEditing(null);
    setReplyTo(m);
    if (quote && !wasEditing) composer.current?.quote(quote);
  };
  const edit = (m: Message) => {
    setReplyTo(null);
    setEditing(m);
  };
  // Контактом можно отправить и участника чата, а в личке — не самого собеседника.
  const people = useMemo(() => members.filter((u) => u.id !== me.id), [members, me.id]);
  const notContacts = useMemo(() => (chat.otherUser ? [chat.otherUser.id] : []), [chat.otherUser]);
  const senderName = (m: Message) => (m.anonymous ? title : m.senderId === me.id ? me.name : (members.find((u) => u.id === m.senderId) ?? chat.otherUser)?.name ?? null);

  return (
    <section className={drop.active ? `${styles.view} ${styles.dropActive}` : styles.view} aria-label={title} {...drop.handlers}>
      <div className={styles.main}>
        <ChatHeader chat={chat} members={members} me={me} onSearch={() => setSearching("")} infoOpen={infoOpen} onInfo={setInfoOpen} />
        {searching !== null ? (
          <ChatSearch key={searching} chatId={chat.id} senderName={senderName} initialQuery={searching} onPick={jumpToFound} onClose={() => setSearching(null)} />
        ) : null}
        {topics ? <TopicTabs chat={chat} meId={me.id} topics={topics} active={topic} onSelect={selectTopic} /> : null}
        {/* Обои под лентой и полем ввода, как у .message-list с .composer-slot поверх. */}
        <div className={`${styles.body} ${wallpaper.className}`} style={wallpaper.style}>
          {/* key: у темы своя лента — плашка непрочитанных и прокрутка с нуля. */}
          <MessageLinks value={links}>
            <MessageFeed key={topic ?? "all"} ref={feed} chat={chat} members={members} me={me} onReply={reply} onEdit={edit} topic={topic} />
          </MessageLinks>
          <Bottom
            chat={chat}
            me={me}
            topicClosed={!!openTopic?.closed && !isTopicStaff(chat, me.id)}
            composer={
              <Composer
                ref={composer}
                chatId={chat.id}
                meId={me.id}
                channel={chat.type === "channel"}
                topicId={openTopic?.id ?? null}
                people={people}
                excludeContacts={notContacts}
                allowEffects={chat.type === "dm" && !chat.isSaved}
                allowWhenOnline={chat.type === "dm" && !chat.isSaved && !!chat.otherUser && !chat.otherUser.isBot}
                initialDraft={typeof chat.draft === "string" ? chat.draft : ""}
                replyTo={replyTo}
                replyToName={replyTo ? senderName(replyTo) : null}
                onCancelReply={() => setReplyTo(null)}
                onSent={() => feed.current?.stickToBottom()}
                editing={editing}
                onSaveEdit={(m, text) => void actions.edit(m, text)}
                onCancelEdit={() => setEditing(null)}
                onEditLast={() => {
                  const last = feed.current?.lastEditable();
                  if (last) edit(last);
                }}
              />
            }
          />
        </div>
      </div>
      {infoOpen ? <ChatInfoPanel chat={chat} members={members} me={me} onClose={() => setInfoOpen(false)} /> : null}
      {mention.profileId ? <UserProfileDialog userId={mention.profileId} meId={me.id} onClose={mention.closeProfile} /> : null}
    </section>
  );
}

/** Поле ввода — или почему писать нельзя (как buildComposer в public/js/views/chatView.js). */
function Bottom({ chat, me, topicClosed, composer }: { chat: ChatSummary; me: SelfUser; topicClosed: boolean; composer: ReactNode }) {
  if (chat.otherUser && me.blockedUserIds?.includes(chat.otherUser.id)) return <p className={styles.hint}>Вы заблокировали этого пользователя</p>;
  // Подписка и отписка от канала появятся вместе с его экраном.
  if (chat.type === "channel" && !isChatAdmin(chat, me.id)) return null;
  if (chat.otherUser?.isServiceBot) return <p className={styles.hint}>Shalter — служебный чат: сюда приходят коды входа и уведомления, отвечать в нём нельзя</p>;
  if (topicClosed) return <p className={styles.hint}>Тема закрыта — писать в неё могут только администраторы</p>;
  const restrictedUntil = chat.restrictions?.[me.id];
  if (typeof restrictedUntil === "string") {
    if (restrictedUntil === "forever") return <p className={styles.hint}>Вам запрещено писать в этом чате</p>;
    if (restrictedUntil > new Date().toISOString()) {
      return <p className={styles.hint}>Вам запрещено писать в этом чате до {new Date(restrictedUntil).toLocaleString("ru-RU")}</p>;
    }
  }
  return composer;
}

const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files");

/** Файлы, брошенные на чат, — в окно отправки (как mainCol drop в chatView.js). */
function useFileDrop(onFiles: (files: File[]) => void) {
  const depth = useRef(0);
  const [active, setActive] = useState(false);
  return {
    active,
    handlers: {
      onDragEnter: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current++;
        setActive(true);
      },
      onDragOver: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      },
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setActive(false);
      },
      onDrop: (e: DragEvent) => {
        depth.current = 0;
        setActive(false);
        const files = [...(e.dataTransfer?.files ?? [])];
        if (!files.length) return;
        e.preventDefault();
        onFiles(files);
      },
    },
  };
}
