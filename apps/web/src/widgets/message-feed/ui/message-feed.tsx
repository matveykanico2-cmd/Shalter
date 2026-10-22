import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type Ref, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";

import { chatCache, type ChatMember, type ChatSummary } from "@/entities/chat";
import { type FeedMessage, loadOlderHistory, type Message, MessageBubble, messageQueries, type MessageSender, type ReplyTarget } from "@/entities/message";

import { errorText } from "@/shared/lib/error-text";
import { Icon } from "@/shared/ui";

import { feedRows } from "../lib/feed-rows";
import { useHistorySync } from "../model/use-history-sync";

import styles from "./message-feed.module.css";

/** Примерная высота строки; точную меряет виртуализатор. */
const ROW_ESTIMATE = 56;
/** Ближе этого к низу — лента «прилипла» и держит низ при новых сообщениях. */
const STICK_PX = 80;
/** Ближе этого к верху — подгружаем историю раньше. */
const LOAD_OLDER_PX = 600;
const HIGHLIGHT_MS = 1600;

export type MessageFeedHandle = {
  /** Прокрутить вниз и держать низ — после своей отправки. */
  stickToBottom: () => void;
};

type Props = {
  chat: ChatSummary;
  members: readonly ChatMember[];
  meId: string;
  onReply?: (m: Message) => void;
  ref?: Ref<MessageFeedHandle>;
};

/** Лента открытого чата: история с подгрузкой вверх, живые события, виртуализация. */
export function MessageFeed({ chat, members, meId, onReply, ref }: Props) {
  const client = useQueryClient();
  useHistorySync(chat.id, meId);
  const history = useQuery(messageQueries.history(chat.id));
  const data = history.data;

  // Каждый запрос истории отмечает чат прочитанным — счётчик в списке гасим сразу.
  useEffect(() => {
    if (history.dataUpdatedAt) chatCache.markRead(client, chat.id);
  }, [client, chat.id, history.dataUpdatedAt]);

  // Плашка «Непрочитанные» — по первому ответу после открытия и до ухода из чата.
  const [unreadId, setUnreadId] = useState<string | null | undefined>(undefined);
  if (unreadId === undefined && history.isFetchedAfterMount && data) setUnreadId(data.firstUnreadId);

  const rows = useMemo(() => feedRows(data?.messages ?? [], unreadId ?? null), [data?.messages, unreadId]);
  const senders = useSenders(chat, members);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const fromBottom = useRef(0);
  const [atBottom, setAtBottom] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

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

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !data?.hasMore) return;
    setLoadingOlder(true);
    try {
      await loadOlderHistory(client, chat.id);
    } catch {
      // Не вышло — попробуем при следующей прокрутке.
    } finally {
      setLoadingOlder(false);
    }
  }, [client, chat.id, data?.hasMore, loadingOlder]);

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

  const jumpTo = (id: string) => {
    const i = rows.findIndex((r) => r.kind === "message" && r.message.id === id);
    if (i < 0) return;
    stuck.current = false;
    virtualizer.scrollToIndex(i, { align: "center" });
    setHighlightId(id);
  };

  const messagesById = useMemo(() => new Map((data?.messages ?? []).map((m) => [m.id, m])), [data?.messages]);
  const isGroup = chat.type === "group";
  const isChannel = chat.type === "channel";

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

  return (
    <div className={styles.feed}>
      <div ref={scrollRef} className={styles.scroll} onScroll={onScroll} role="log" aria-label="Сообщения">
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
                      <span>{row.label}</span>
                    </div>
                  ) : row.kind === "unread" ? (
                    <div className={styles.unread}>
                      <span>Непрочитанные сообщения</span>
                    </div>
                  ) : (
                    <div className={row.message.id === highlightId ? `${styles.message} ${styles.highlight}` : styles.message}>
                      <MessageRow
                        message={row.message}
                        meId={meId}
                        groupStart={row.groupStart}
                        groupEnd={row.groupEnd}
                        isGroup={isGroup}
                        isChannel={isChannel}
                        senders={senders}
                        replyTo={row.message.replyToId ? (messagesById.get(row.message.replyToId) ?? data?.replyTargets[row.message.replyToId]) : undefined}
                        onReply={isChannel ? undefined : onReply}
                        onJumpTo={jumpTo}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {loadingOlder ? <span className={`${styles.spinner} ${styles.topSpinner}`} aria-label="Загружаем историю" /> : null}
      </div>
      {!atBottom ? (
        <button
          type="button"
          className={styles.down}
          title="Вниз"
          onClick={() => {
            stuck.current = true;
            setAtBottom(true);
            scrollToBottom();
          }}
        >
          <Icon name="ChevronDown" size={24} />
        </button>
      ) : null}
    </div>
  );
}

type RowProps = {
  message: FeedMessage;
  meId: string;
  groupStart: boolean;
  groupEnd: boolean;
  isGroup: boolean;
  isChannel: boolean;
  senders: (m: { senderId: string; anonymous?: boolean }) => MessageSender | null;
  replyTo: Message | ReplyTarget | undefined;
  onReply?: (m: Message) => void;
  onJumpTo: (id: string) => void;
};

function MessageRow({ message, meId, groupStart, groupEnd, isGroup, isChannel, senders, replyTo, onReply, onJumpTo }: RowProps) {
  const mine = message.senderId === meId;
  const replyToName = replyTo && !("deleted" in replyTo) ? (senders(replyTo)?.name ?? null) : null;
  return (
    <MessageBubble
      message={message}
      mine={mine}
      sender={senders(message)}
      // Как в Telegram: автор поста в канале — сам канал, имя админа не показываем.
      showSender={isGroup && groupStart}
      showAvatar={isGroup && !mine ? groupEnd : undefined}
      groupStart={groupStart}
      groupEnd={groupEnd}
      isChannel={isChannel}
      replyTo={replyTo ?? null}
      replyToName={replyToName}
      onReply={onReply}
      onJumpTo={onJumpTo}
    />
  );
}

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
