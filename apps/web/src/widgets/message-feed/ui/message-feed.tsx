import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type Ref, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";

import { type CallKind, useStartCall } from "@/features/call";
import { SponsoredMessage } from "@/features/chat-ads";
import {
  canPin,
  isProtectedChat,
  MessageMenus,
  SelectionBar,
  type Summaries,
  useMessageActions,
  useMessageMenu,
  useMessageSelection,
  useSummaries,
} from "@/features/message-actions";
import { Composer } from "@/features/send-message";
import { ThreadPanel, type ThreadSource } from "@/features/thread";

import { chatCache, type ChatMember, type ChatSummary, isChatAdmin, isChatModerator, type Typing } from "@/entities/chat";
import {
  type AttachmentActions,
  type FeedMessage,
  isReadByOthers,
  loadOlderHistory,
  type Message,
  MessageBubble,
  messageQueries,
  type MessageSender,
  type ReplyTarget,
  timeLabel,
  type TopicFilter,
} from "@/entities/message";
import { type ReportInfo, ReportMessage } from "@/entities/report";
import { isServerModerator, type SelfUser } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { useTimeFormat } from "@/shared/lib/time-format";
import { Icon, MediaViewer, type ViewerItem } from "@/shared/ui";

import { type FeedRow, feedRows, lastEditable } from "../lib/feed-rows";
import { buildGallery, galleryIndex } from "../lib/gallery";
import { useEntrance } from "../model/use-entrance";
import { useHistorySync } from "../model/use-history-sync";

import { BotThinking } from "./bot-thinking";
import { ChatCalendar } from "./chat-calendar";
import styles from "./message-feed.module.css";
import { PinnedBar } from "./pinned-bar";
import { PostView } from "./post-view";

/** Примерная высота строки; точную меряет виртуализатор. */
const ROW_ESTIMATE = 56;
/** Ближе этого к низу — лента «прилипла» и держит низ при новых сообщениях. */
const STICK_PX = 80;
/** Ближе этого к верху — подгружаем историю раньше. */
const LOAD_OLDER_PX = 600;
const HIGHLIGHT_MS = 1600;
/** Сколько страниц старее листать в поисках сообщения — как jumpTo в chatView.js. */
const JUMP_MAX_PAGES = 20;

export type MessageFeedHandle = {
  /** Прокрутить вниз и держать низ — после своей отправки. */
  stickToBottom: () => void;
  /** Последнее своё сообщение, которое можно править (стрелка вверх в поле ввода). */
  lastEditable: () => Message | null;
  /** К сообщению с подсветкой; нет в ленте — подгружает историю старее (поиск по чату). */
  jumpTo: (id: string) => void;
};

type Props = {
  chat: ChatSummary;
  members: readonly ChatMember[];
  me: SelfUser;
  /** Кто печатает — для «Думает…» бота. */
  typing: Typing;
  /** quote — выделенная часть текста для цитаты. */
  onReply?: (m: Message, quote?: string) => void;
  onEdit?: (m: Message) => void;
  /** Тема группы: лента только её сообщений. */
  topic?: TopicFilter;
  ref?: Ref<MessageFeedHandle>;
};

/** Лента открытого чата: история с подгрузкой вверх, живые события, виртуализация. */
const noop = () => {};

export function MessageFeed({ chat, members, me, typing, onReply, onEdit, topic, ref }: Props) {
  const meId = me.id;
  // Сменили 12/24 часа — пузыри перерисуются с новым временем.
  useTimeFormat();
  const client = useQueryClient();
  const menu = useMessageMenu();
  const actions = useMessageActions(chat, me);
  const selection = useMessageSelection();
  const summaries = useSummaries(chat.id);
  useHistorySync(chat.id, meId);
  const history = useQuery(messageQueries.history(chat.id, topic));
  // Ветка ответов в группе или комментарии к посту канала.
  const [thread, setThread] = useState<ThreadSource | null>(null);
  const openThread = (m: Message) => setThread({ kind: "thread", chatId: chat.id, root: m });
  // Перезвонить из записи о звонке — в группе снова всем, как placeCall в chatView.js.
  const startCall = useStartCall(me);
  const callBack = (kind: CallKind) => void startCall.call(chat.id, kind, { ringAll: chat.type === "group" });
  const data = history.data;

  // Каждый запрос истории отмечает чат прочитанным — счётчик в списке гасим сразу.
  useEffect(() => {
    if (history.dataUpdatedAt) chatCache.markRead(client, chat.id);
  }, [client, chat.id, history.dataUpdatedAt]);

  // Плашка «Непрочитанные» — по первому ответу после открытия и до ухода из чата.
  const [unreadId, setUnreadId] = useState<string | null | undefined>(undefined);
  if (unreadId === undefined && history.isFetchedAfterMount && data) setUnreadId(data.firstUnreadId);

  const rows = useMemo(() => feedRows(data?.messages ?? [], unreadId ?? null), [data?.messages, unreadId]);
  const entrance = useEntrance(chat.id, data?.messages, meId);
  const senders = useSenders(chat, members);
  const attachmentActions = useMemo<AttachmentActions>(
    () => ({
      poll: {
        onVote: actions.vote,
        onRetract: actions.retractVote,
        onClose: actions.closePoll,
        // Чужой опрос останавливают админы и модераторы группы или канала.
        canCloseOthers: chat.type !== "dm" && (isChatAdmin(chat, meId) || isChatModerator(chat, meId)),
      },
      checklist: { onToggle: actions.toggleChecklist, onAdd: actions.addChecklistItems },
      onUnlockPaid: actions.unlockPaid,
    }),
    [actions, chat, meId]
  );
  const nameOf = useCallback((userId: string) => senders({ senderId: userId })?.name ?? "участник", [senders]);
  const userOf = useCallback((userId: string) => senders({ senderId: userId }), [senders]);
  const knownName = useCallback((userId: string) => senders({ senderId: userId })?.name ?? null, [senders]);
  // Кто поставил реакцию на пост канала, видят только его админы и модераторы.
  const canViewReactionDetails = chat.type !== "channel" || isChatAdmin(chat, meId) || isChatModerator(chat, meId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const fromBottom = useRef(0);
  const [atBottom, setAtBottom] = useState(true);
  // Сколько чужих сообщений пришло, пока лента не внизу, — число на кнопке «вниз» (missedWhileUp).
  const [leftAt, setLeftAt] = useState<string | null>(null);
  const lastId = data?.messages.at(-1)?.id ?? null;
  if (atBottom && leftAt) setLeftAt(null);
  if (!atBottom && !leftAt && lastId) setLeftAt(lastId);
  const missed = useMemo(() => {
    const list = data?.messages ?? [];
    const from = leftAt ? list.findIndex((m) => m.id === leftAt) : -1;
    return from < 0 ? 0 : list.slice(from + 1).filter((m) => m.senderId !== meId && m.type !== "system").length;
  }, [data?.messages, leftAt, meId]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; index: number } | null>(null);

  // eslint-disable-next-line react-hooks/incompatible-library -- виртуализатор сам следит за прокруткой
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 10,
    getItemKey: (i) => rows[i]!.key,
  });
  const totalSize = virtualizer.getTotalSize();

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useImperativeHandle(ref, () => ({
    stickToBottom: () => {
      stuck.current = true;
      setAtBottom(true);
      scrollToBottom();
    },
    lastEditable: () => lastEditable(data?.messages ?? [], meId),
    jumpTo,
  }));

  // Прилипшая лента держит низ, пока сообщения добавляются и меряются; подгруженная
  // сверху история не сдвигает то, что сейчас на экране.
  const firstKey = rows[0]?.key;
  const prevFirstKey = useRef(firstKey);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stuck.current) {
      el.scrollTop = el.scrollHeight;
    } else if (prevFirstKey.current !== firstKey) {
      el.scrollTop = el.scrollHeight - fromBottom.current;
    }
    prevFirstKey.current = firstKey;
  }, [totalSize, rows.length, firstKey]);

  // Пока истории нет (грузится, ошибка), нет и области прокрутки.
  const hasScroller = !!data;
  // Лента стала ниже (появились вкладки тем, плашка ответа над полем) — scrollTop прежний,
  // события scroll нет, и прилипшая лента уехала бы от низа.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stuck.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasScroller]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !data?.hasMore) return;
    setLoadingOlder(true);
    try {
      await loadOlderHistory(client, chat.id, topic);
    } catch {
      // Не вышло — попробуем при следующей прокрутке.
    } finally {
      setLoadingOlder(false);
    }
  }, [client, chat.id, topic, data?.hasMore, loadingOlder]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    fromBottom.current = el.scrollHeight - el.scrollTop;
    const bottom = fromBottom.current - el.clientHeight < STICK_PX;
    stuck.current = bottom;
    if (bottom !== atBottom) setAtBottom(bottom);
    if (el.scrollTop < LOAD_OLDER_PX) void loadOlder();
  };

  // Мало сообщений на экран — прокрутки нет, историю догружаем сами.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && data?.hasMore && el.scrollHeight <= el.clientHeight + LOAD_OLDER_PX) void loadOlder();
  }, [data?.hasMore, totalSize, loadOlder]);

  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => clearTimeout(t);
  }, [highlightId]);

  // Сообщения нет среди загруженных — листаем историю старее, пока не найдётся.
  const [jumpTarget, setJumpTarget] = useState<{ id: string; pages: number } | null>(null);
  const jumpTo = (id: string) => setJumpTarget({ id, pages: 0 });
  const [calendarAt, setCalendarAt] = useState<string | null>(null);
  useEffect(() => {
    if (!jumpTarget) return;
    const i = rows.findIndex((r) => r.kind === "message" && r.message.id === jumpTarget.id);
    if (i >= 0) {
      setJumpTarget(null);
      stuck.current = false;
      virtualizer.scrollToIndex(i, { align: "center" });
      setHighlightId(jumpTarget.id);
      return;
    }
    // История ещё не пришла (ссылка ?msg=… открывает чат) — ждём её.
    if (loadingOlder || !data) return;
    if (!data.hasMore || jumpTarget.pages >= JUMP_MAX_PAGES) {
      setJumpTarget(null);
      return;
    }
    setJumpTarget({ ...jumpTarget, pages: jumpTarget.pages + 1 });
    void loadOlder();
  }, [jumpTarget, rows, loadingOlder, data, loadOlder, virtualizer]);

  // Esc снимает выбор, если поверх ленты ничего не открыто (как onChatKeydown в chatView.js).
  const { active: selecting, clear: clearSelection } = selection;
  const menuOpen = !!menu.state;
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || menuOpen || document.querySelector("[role=dialog], [role=menu]")) return;
      e.stopPropagation();
      clearSelection();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [selecting, menuOpen, clearSelection]);

  const messagesById = useMemo(() => new Map((data?.messages ?? []).map((m) => [m.id, m])), [data?.messages]);
  const isGroup = chat.type === "group";
  // Контактом из ветки можно отправить участника группы, как из основного поля.
  const threadPeople = useMemo(() => members.filter((u) => u.id !== me.id), [members, me.id]);
  const isChannel = chat.type === "channel";
  const canResolveReports = isServerModerator(me);

  if (history.isPending) {
    return (
      <div className={styles.feed}>
        <span className={styles.spinner} aria-label="Загрузка" />
      </div>
    );
  }
  if (history.isError && !data) {
    return (
      <div className={styles.feed}>
        <div className={styles.center}>
          <p>{errorText(history.error, "Не удалось загрузить чат")}</p>
          <button type="button" className={styles.retry} onClick={() => void history.refetch()}>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  const senderName = (m: Message) => senders(m)?.name ?? null;
  const stickyDay = topDay(rows, virtualizer.getVirtualItems(), virtualizer.scrollOffset ?? 0);
  const toggleSelect = (m: Message) => selection.toggle(m.id);
  const selected = selection.active ? (data?.messages ?? []).filter((m) => selection.ids.has(m.id)) : [];
  const protectedContent = isProtectedChat(chat);
  const openMedia = (m: Message, url: string) => {
    const items = buildGallery(data?.messages ?? [], (x) => (x.senderId === meId && !x.anonymous ? "Вы" : senderName(x)));
    const index = galleryIndex(items, m.id, url);
    if (index >= 0) setViewer({ items, index });
  };

  return (
    <div className={styles.feed}>
      {selection.active ? <SelectionBar messages={selected} chat={chat} me={me} actions={actions} senderName={senderName} onClear={selection.clear} /> : null}
      <PinnedBar messages={data?.messages ?? []} canUnpin={canPin(chat, meId)} onJumpTo={jumpTo} onUnpin={(m) => void actions.togglePin(m)} />
      <div ref={scrollRef} className={styles.scroll} onScroll={onScroll} role="log" aria-label="Сообщения">
        {/* День верхнего видимого сообщения — плашкой поверх ленты, когда его разделитель уже уехал вверх. */}
        {stickyDay ? (
          <div className={`${styles.day} ${styles.stickyDay}`}>
            <button type="button" title="Перейти к дате" onClick={() => setCalendarAt(stickyDay.at)}>
              {stickyDay.label}
            </button>
          </div>
        ) : null}
        {rows.length === 0 ? (
          <p className={styles.empty}>Сообщений пока нет — напишите первым</p>
        ) : (
          <div className={styles.rows} style={{ height: totalSize }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index]!;
              return (
                <div key={item.key} ref={virtualizer.measureElement} data-index={item.index} className={styles.slot} style={{ transform: `translateY(${item.start}px)` }}>
                  {row.kind === "day" ? (
                    <div className={styles.day}>
                      {/* Плашка даты открывает «Перейти к дате», как в chatView.js. */}
                      <button type="button" title="Перейти к дате" onClick={() => setCalendarAt(row.at)}>
                        {row.label}
                      </button>
                    </div>
                  ) : row.kind === "unread" ? (
                    <div className={styles.unread}>
                      <span>Непрочитанные сообщения</span>
                    </div>
                  ) : (
                    <div
                      className={[
                        styles.message,
                        row.groupStart ? styles.groupStart : "",
                        row.groupEnd ? styles.groupEnd : "",
                        entrance.entering(row.message) ? styles.entering : "",
                        row.message.id === highlightId ? styles.highlight : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onAnimationEnd={(e) => {
                        if (e.target === e.currentTarget) entrance.finish(row.message.id);
                      }}
                    >
                      <MessageRow
                        message={row.message}
                        meId={meId}
                        canResolveReports={canResolveReports}
                        senderTag={isGroup && !row.message.anonymous ? memberTag(chat, row.message.senderId) : null}
                        groupStart={row.groupStart}
                        groupEnd={row.groupEnd}
                        isGroup={isGroup}
                        isChannel={isChannel}
                        senders={senders}
                        replyTo={row.message.replyToId ? (messagesById.get(row.message.replyToId) ?? data?.replyTargets[row.message.replyToId]) : undefined}
                        onReply={isChannel ? undefined : onReply}
                        onJumpTo={jumpTo}
                        onOpenMenu={menu.openMenu}
                        onOpenReactions={menu.openReactions}
                        onReact={actions.react}
                        onOpenMedia={openMedia}
                        protectedContent={protectedContent}
                        attachmentActions={attachmentActions}
                        nameOf={nameOf}
                        userOf={userOf}
                        onReactionDetails={canViewReactionDetails ? menu.openReactors : undefined}
                        selecting={selection.active}
                        selected={selection.ids.has(row.message.id)}
                        onToggleSelect={row.message.type === "gift" ? undefined : toggleSelect}
                        summaries={summaries}
                        onOpenThread={isGroup ? openThread : undefined}
                        onOpenComments={withComments(chat, row.message) ? (m) => setThread({ kind: "comments", post: m }) : undefined}
                        onCallBack={selection.active ? undefined : callBack}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <BotThinking chat={chat} members={members} typing={typing} />
        {isChannel && rows.length ? <SponsoredMessage chatId={chat.id} premium={!!me.isPremium} /> : null}
        {loadingOlder ? <span className={`${styles.spinner} ${styles.topSpinner}`} aria-label="Загружаем историю" /> : null}
      </div>
      {!atBottom ? (
        <button
          type="button"
          className={styles.down}
          title="К последним сообщениям"
          onClick={() => {
            stuck.current = true;
            setAtBottom(true);
            scrollToBottom();
          }}
        >
          <Icon name="ChevronDown" size={24} />
          {missed > 0 ? <span className={styles.downBadge}>{missed}</span> : null}
        </button>
      ) : null}
      {viewer ? <MediaViewer items={viewer.items} index={viewer.index} canDownload={!protectedContent} onClose={() => setViewer(null)} /> : null}
      <MessageMenus
        control={menu}
        actions={actions}
        chat={chat}
        me={me}
        senderName={senderName}
        author={(m) => senders(m)}
        nameOf={knownName}
        onReply={isChannel ? undefined : onReply}
        onEdit={onEdit}
        onSelect={toggleSelect}
        summaries={summaries}
        onOpenThread={isGroup ? openThread : undefined}
      />
      {thread ? (
        <ThreadPanel
          chat={chat}
          source={thread}
          me={me}
          userOf={userOf}
          onClose={() => setThread(null)}
          composer={(onSent, target) => (
            <Composer
              chatId={target.chatId}
              meId={me.id}
              channel={false}
              initialDraft=""
              replyTo={null}
              replyToName={null}
              onCancelReply={noop}
              people={target.postId ? target.people.filter((u) => u.id !== me.id) : threadPeople}
              thread={{ rootId: target.rootId, onSent, postId: target.postId }}
              paid={target.paidStars ? { stars: target.paidStars, kind: "comment" } : null}
              typing={!target.postId || target.people.some((u) => u.id === me.id)}
            />
          )}
        />
      ) : null}
      {calendarAt ? <ChatCalendar chatId={chat.id} around={calendarAt} onPick={jumpTo} onClose={() => setCalendarAt(null)} /> : null}
    </div>
  );
}

type RowProps = {
  message: FeedMessage;
  meId: string;
  /** Модератор Shalter решает жалобы прямо из сообщений-жалоб. */
  canResolveReports: boolean;
  senderTag: string | null;
  groupStart: boolean;
  groupEnd: boolean;
  isGroup: boolean;
  isChannel: boolean;
  senders: (m: { senderId: string; anonymous?: boolean }) => MessageSender | null;
  replyTo: Message | ReplyTarget | undefined;
  onReply?: (m: Message, quote?: string) => void;
  onJumpTo: (id: string) => void;
  onOpenMenu: (m: Message, at: { x: number; y: number }, quote?: string) => void;
  onOpenReactions: (m: Message, at: { x: number; y: number }) => void;
  onReact: (m: Message, emoji: string) => void;
  onOpenMedia: (m: Message, url: string) => void;
  protectedContent: boolean;
  attachmentActions: AttachmentActions;
  nameOf: (userId: string) => string;
  userOf: (userId: string) => MessageSender | null;
  onReactionDetails?: (m: Message, emoji: string, at: { x: number; y: number }) => void;
  selecting: boolean;
  selected: boolean;
  onToggleSelect?: (m: Message) => void;
  summaries: Summaries;
  onOpenThread?: (m: Message) => void;
  /** Пост канала с группой обсуждения — «Комментарии» внизу пузыря. */
  onOpenComments?: (m: Message) => void;
  /** Запись о звонке — перезвонить. */
  onCallBack?: (kind: CallKind) => void;
};

function MessageRow(props: RowProps) {
  const { message, meId, groupStart, groupEnd, isGroup, isChannel, senders, replyTo, onReply, onJumpTo, onOpenMenu, onOpenReactions, onReact } = props;
  const mine = message.senderId === meId;
  const replyToName = replyTo && !("deleted" in replyTo) ? (senders(replyTo)?.name ?? null) : null;
  const comments = props.onOpenThread && message.type !== "system" && !message.threadRootId ? (message.commentCount ?? 0) : 0;
  if (message.type === "report" && message.report && typeof message.report === "object") {
    return (
      <ReportMessage
        messageId={message.id}
        report={message.report as ReportInfo}
        canResolve={props.canResolveReports}
        time={timeLabel(message.createdAt)}
        read={mine ? isReadByOthers(message) : null}
      />
    );
  }
  const bubble = (
    <MessageBubble
      message={message}
      mine={mine}
      sender={senders(message)}
      // Как в Telegram: автор поста в канале — сам канал, имя админа не показываем.
      showSender={isGroup && groupStart}
      senderTag={props.senderTag}
      showAvatar={isGroup && !mine ? groupEnd : undefined}
      groupStart={groupStart}
      groupEnd={groupEnd}
      isChannel={isChannel}
      replyTo={replyTo ?? null}
      replyToName={replyToName}
      meId={meId}
      onReply={onReply}
      onJumpTo={onJumpTo}
      onOpenMenu={onOpenMenu}
      onOpenReactions={onOpenReactions}
      onReact={onReact}
      onOpenMedia={props.onOpenMedia}
      protectedContent={props.protectedContent}
      attachmentActions={props.attachmentActions}
      nameOf={props.nameOf}
      userOf={props.userOf}
      onReactionDetails={props.onReactionDetails}
      selecting={props.selecting}
      selected={props.selected}
      onToggleSelect={props.onToggleSelect}
      summary={props.summaries.of(message.id)}
      onCallBack={props.onCallBack}
      footer={
        props.onOpenComments ? (
          <button
            type="button"
            className={styles.postComments}
            onClick={(e) => {
              e.stopPropagation();
              props.onOpenComments?.(message);
            }}
          >
            <Icon name="MessageSquare" size={20} />
            {commentsLabel(message.commentCount ?? 0)}
          </button>
        ) : undefined
      }
    />
  );
  // Просмотры поста считаются, когда его увидел подписчик (viewObserver в chatView.js).
  const counted = isChannel && !mine && message.type !== "system" && !message.pending ? <PostView postId={message.id} /> : null;
  if (counted) {
    return (
      <>
        {bubble}
        {counted}
      </>
    );
  }
  if (!comments) return bubble;
  // Ответы в ветке — ссылкой под сообщением (post-comments-link в chatView.js).
  return (
    <>
      {bubble}
      <button type="button" className={mine ? `${styles.comments} ${styles.commentsMine}` : styles.comments} onClick={() => props.onOpenThread?.(message)}>
        💬 {comments} {repliesWord(comments)}
      </button>
    </>
  );
}

/** У поста есть обсуждение: канал связан с группой, комментарии не выключены (withComments). */
const withComments = (chat: ChatSummary, m: FeedMessage) => chat.type === "channel" && m.type !== "system" && !!chat.linkedDiscussionChatId && !chat.commentsOff && !!m.discussionAnchorId;

function commentsLabel(n: number) {
  if (!n) return "Комментарии";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} комментарий`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} комментария`;
  return `${n} комментариев`;
}

/** Тег участника группы — строка из memberTitles. */
const memberTag = (chat: ChatSummary, userId: string) => {
  const tag = chat.memberTitles?.[userId];
  return typeof tag === "string" && tag ? tag : null;
};

const repliesWord = (n: number) => (n === 1 ? "ответ" : n < 5 ? "ответа" : "ответов");

/** Автор сообщения: участник чата, собеседник в личке, сам чат — у анонимных админов. */
function useSenders(chat: ChatSummary, members: readonly ChatMember[]) {
  return useMemo(() => {
    const byId = new Map<string, MessageSender>();
    for (const u of members) byId.set(u.id, u);
    if (chat.otherUser) byId.set(chat.otherUser.id, chat.otherUser);
    const asChat: MessageSender = { id: chat.id, name: chat.title ?? "", avatarColor: chat.avatarColor, avatarImage: chat.avatarImage };
    return (m: { senderId: string; anonymous?: boolean }) => (m.anonymous ? asChat : (byId.get(m.senderId) ?? null));
  }, [chat, members]);
}

/** Разделитель дня для верхнего видимого сообщения, если сам он уже прокручен выше края ленты. */
function topDay(rows: readonly FeedRow[], items: readonly { index: number; start: number; end: number }[], offset: number) {
  const top = items.find((it) => it.end > offset);
  if (!top) return null;
  for (let i = top.index; i >= 0; i--) {
    const row = rows[i];
    if (row?.kind !== "day") continue;
    const own = items.find((it) => it.index === i);
    return own && own.start >= offset ? null : row;
  }
  return null;
}
