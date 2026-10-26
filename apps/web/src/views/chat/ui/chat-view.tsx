import { useQueryClient } from "@tanstack/react-query";
import { type DragEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router";

import { ChatHeader } from "@/widgets/chat-header";
import { ChatInfoPanel } from "@/widgets/chat-info";
import { MessageFeed, type MessageFeedHandle } from "@/widgets/message-feed";

import { MiniApp, type MiniAppTarget } from "@/features/bot-app";
import { SubscribeBar } from "@/features/channel-subscription";
import { useChatActions } from "@/features/chat-actions";
import { ChatSearch } from "@/features/chat-search";
import { ContactBar } from "@/features/contact-bar";
import { useMessageActions } from "@/features/message-actions";
import { useMentionProfile, UserProfileDialog } from "@/features/open-profile";
import { botCommandsOf, Composer, type ComposerHandle, useAiReply } from "@/features/send-message";
import { isTopicStaff, TopicTabs, useTopics } from "@/features/topics";

import { type ChatCard, type ChatMember, chatQueries, type ChatSummary, chatTitle, isChatAdmin, isChatModerator, useChatCard, useChatFromList, useTyping } from "@/entities/chat";
import { inTopic, type Message, type MessageLinkHandlers, MessageLinks, type TopicFilter } from "@/entities/message";
import { type SelfUser, useSession } from "@/entities/session";
import { chatWallpaper, useSettings } from "@/entities/settings";

import { useWsEvent } from "@/shared/api";
import { Button, NowPlayingBar, wallpaperProps } from "@/shared/ui";

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
  return <OpenChat key={chat.id} chat={chat} members={card.data?.members ?? NO_MEMBERS} card={card.data ?? null} me={me} />;
}

type OpenChatProps = { chat: ChatSummary; members: readonly ChatMember[]; card: ChatCard | null; me: SelfUser };

function OpenChat({ chat, members, card, me }: OpenChatProps) {
  const feed = useRef<MessageFeedHandle>(null);
  const composer = useRef<ComposerHandle>(null);
  const drop = useFileDrop((files) => composer.current?.attach(files));
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const actions = useMessageActions(chat, me);
  const chatActions = useChatActions(chat, me.id);
  const blockedOther = !!chat.otherUser && me.blockedUserIds.includes(chat.otherUser.id);
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
  // Кнопки бота: действие — текстом в чат, приложение — мини-приложение (onKeyboardAction, onKeyboardApp).
  const [miniApp, setMiniApp] = useState<MiniAppTarget | null>(null);
  const settings = useSettings().data;
  const links: MessageLinkHandlers = {
    tapToLoad: settings?.autoDownload === false,
    onMention: (h) => void mention.openMention(h),
    onHashtag: (tag) => setSearching(tag),
    onOpenProfile: (userId) => mention.openProfile(userId),
    onKeyboard: (m, button) => {
      if (button.app) setMiniApp({ botId: m.senderId, botName: senderName(m), chatId: chat.id, url: button.app });
      else if (button.action) composer.current?.sendText(button.action);
    },
  };
  // «Печатает…» в шапке и «Думает…» бота в ленте — с одной подписки и одного опроса.
  const typing = useTyping(chat.id, me.id);
  const ai = useAiReply(chat.id, chat.type === "dm" && chat.otherUser?.id === "bot_shalter_ai");
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
  // Подсказки «@» — участники с ником; «/» — команды бота из карточки чата.
  const mentionable = useMemo(() => people.filter((u) => !!u.username), [people]);
  const botCommands = useMemo(() => botCommandsOf(card?.commands), [card?.commands]);
  const paid = card?.paidMessages?.youPay ? { stars: card.paidMessages.stars, kind: card.paidMessages.kind ?? ("message" as const) } : null;
  const senderName = (m: Message) => (m.anonymous ? title : m.senderId === me.id ? me.name : (members.find((u) => u.id === m.senderId) ?? chat.otherUser)?.name ?? null);

  return (
    <section className={drop.active ? `${styles.view} ${styles.dropActive}` : styles.view} aria-label={title} {...drop.handlers}>
      <div className={styles.main}>
        <ChatHeader chat={chat} members={members} me={me} typing={typing} onSearch={() => setSearching("")} infoOpen={infoOpen} onInfo={setInfoOpen} />
        <NowPlayingBar />
        {searching !== null ? (
          <ChatSearch key={searching} chatId={chat.id} senderName={senderName} initialQuery={searching} onPick={jumpToFound} onClose={() => setSearching(null)} />
        ) : null}
        {topics ? <TopicTabs chat={chat} meId={me.id} topics={topics} active={topic} onSelect={selectTopic} /> : null}
        <ContactBar chat={chat} blocked={blockedOther} onToggleBlock={chatActions.toggleBlock} />
        {/* Обои под лентой и полем ввода, как у .message-list с .composer-slot поверх. */}
        <div className={`${styles.body} ${wallpaper.className}`} style={wallpaper.style}>
          {/* key: у темы своя лента — плашка непрочитанных и прокрутка с нуля. */}
          <MessageLinks value={links}>
            <MessageFeed key={topic ?? "all"} ref={feed} chat={chat} members={members} me={me} typing={typing} onReply={reply} onEdit={edit} topic={topic} />
          </MessageLinks>
          <Bottom
            chat={chat}
            me={me}
            onUnblock={() => void chatActions.toggleBlock()}
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
                mentions={mentionable}
                botCommands={botCommands}
                canPostAnonymously={chat.type === "group" && !!chat.anonymousAdmins && (isChatAdmin(chat, me.id) || isChatModerator(chat, me.id))}
                paid={paid}
                canPostPaid={!chat.isSaved && !chat.secret && (chat.type !== "channel" || isChatAdmin(chat, me.id))}
                ai={ai}
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
      {miniApp ? <MiniApp target={miniApp} onClose={() => setMiniApp(null)} /> : null}
    </section>
  );
}

/** Поле ввода — или почему писать нельзя (как buildComposer в public/js/views/chatView.js). */
type BottomProps = { chat: ChatSummary; me: SelfUser; topicClosed: boolean; composer: ReactNode; onUnblock: () => void };

function Bottom({ chat, me, topicClosed, composer, onUnblock }: BottomProps) {
  if (chat.otherUser && me.blockedUserIds?.includes(chat.otherUser.id)) {
    return (
      <div className={styles.blocked}>
        <p>Вы заблокировали этого пользователя</p>
        <Button onClick={onUnblock}>Разблокировать</Button>
      </div>
    );
  }
  if (chat.type === "channel" && !isChatAdmin(chat, me.id)) return <SubscribeBar chat={chat} />;
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
