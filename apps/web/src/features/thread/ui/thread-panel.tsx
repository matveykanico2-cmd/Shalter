import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { type ChatSummary, useChats } from "@/entities/chat";
import { type Message, MessageBubble, type MessageSender } from "@/entities/message";
import { type SelfUser } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { askText, Icon, toast } from "@/shared/ui";

import { MessageMenus, useMessageActions, useMessageMenu } from "../../message-actions";
import { editReply } from "../api/thread";
import { type ThreadSource, useThread } from "../model/use-thread";

import styles from "./thread-panel.module.css";

/** Куда пишет поле ответа: чат и корень ветки; у комментариев — ещё пост и его цена. */
export type ThreadTarget = { chatId: string; rootId: string; postId?: string; paidStars?: number; people: readonly MessageSender[] };

type Props = {
  /** Чат, где открыли ветку: группа или канал (у канала ответы живут в группе обсуждения). */
  chat: ChatSummary;
  source: ThreadSource;
  me: SelfUser;
  userOf: (userId: string) => MessageSender | null;
  onClose: () => void;
  /** Поле ответа (Composer в режиме ветки): onSent — ответ ушёл, сразу в список. */
  composer: (onSent: (m: Message) => void, target: ThreadTarget, replyTo: Message | null) => ReactNode;
};

/**
 * Ответы на сообщение группы или комментарии к посту канала — боковая панель, как
 * openThreadPanel в public/js/components/threadPanel.js (openPostComments в chatView.js).
 */
export function ThreadPanel({ chat, source, me, userOf, onClose, composer }: Props) {
  const { query, replies, comments, chatId, rootId, add, replace } = useThread(source);
  const isComments = source.kind === "comments";
  const root = isComments ? (comments?.anchor ?? source.post) : ((query.data as { root?: Message } | undefined)?.root ?? source.root);
  const title = isComments ? "Комментарии" : "Тема";
  const [entering, setEntering] = useState(true);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const menu = useMessageMenu();
  const body = useRef<HTMLDivElement>(null);
  // Комментарии лежат в группе обсуждения, и удаляет их её админ, а не админ канала.
  const chats = useChats().data;
  const scope = isComments ? (chats?.find((c) => c.id === chatId) ?? null) : chat;
  const actionChat = scope ?? chat;
  const actions = useMessageActions(actionChat, me);
  // Комментаторы — из ответа сервера: в группе обсуждения могут быть не подписчики канала.
  const people = comments?.members ?? null;
  const author = (id: string) => people?.find((u) => u.id === id) ?? userOf(id);
  const channelSender: MessageSender = { id: chat.id, name: chat.title ?? "Канал", avatarColor: chat.avatarColor, avatarImage: chat.avatarImage, avatarEmoji: chat.avatarEmoji };
  const displayRoot = isComments && root.forwardedFrom ? { ...root, forwardedFrom: undefined } : root;
  useLayoutEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [replies.length]);

  // Escape закрывает, если поверх нет окна или меню.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("[role=dialog]:not([data-thread]), [role=menu]")) return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const sender = (m: Message) => {
    if (isComments && (m.anonymous || (m.id === root.id && !chat.signMessages))) return channelSender;
    return m.senderId === me.id
      ? { id: me.id, name: me.name, avatarColor: me.avatarColor, avatarImage: me.avatarImage, avatarEmoji: me.avatarEmoji }
      : author(m.senderId);
  };
  const fromChannel = (m: Message) => isComments && (m.anonymous || (m.id === root.id && !chat.signMessages));

  const edit = async (m: Message) => {
    const text = await askText("Изменить комментарий", { initial: m.text ?? "", okLabel: "Сохранить" });
    const clean = text?.trim();
    if (!clean || clean === m.text) return;
    try {
      replace((await editReply(chatId, m.id, clean)).message);
    } catch (err) {
      toast(errorText(err, "Не удалось сохранить"), { error: true });
    }
  };

  return createPortal(
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className={entering ? `${styles.panel} ${isComments ? styles.channelCommentsPanel : ""} ${styles.entering}` : `${styles.panel} ${isComments ? styles.channelCommentsPanel : ""}`}
        // Боковая панель (complementary), как thread-panel в старом клиенте.
        aria-label={title}
        data-thread=""
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget) setEntering(false);
        }}
      >
        <header className={styles.header}>
          <button type="button" className={styles.back} title="Назад" aria-label="Назад" onClick={onClose}>
            <Icon name="ChevronLeft" size={20} />
          </button>
          <h2>{isComments ? `${chat.title ?? "Канал"} — комментарии` : title}</h2>
          <button type="button" className={styles.close} title="Закрыть" onClick={onClose}>
            <Icon name="X" size={18} />
          </button>
        </header>
        <div ref={body} className={isComments ? `${styles.body} ${styles.commentsBody}` : styles.body}>
          <div className={styles.root}>
            <MessageBubble
              message={displayRoot}
              mine={displayRoot.senderId === me.id && !fromChannel(root)}
              sender={sender(root)}
              showSender
              showAvatar={isComments}
              meId={me.id}
            />
          </div>
          <p className={styles.label}>
            {isComments ? "Комментарии" : "Ответы"} ({replies.length})
          </p>
          {query.isPending ? <span className={styles.spinner} aria-label="Загрузка" /> : null}
          {query.isError ? <p className={styles.empty}>{errorText(query.error, isComments ? "Комментарии недоступны" : "Не удалось загрузить ответы")}</p> : null}
          {query.isSuccess && !replies.length ? <p className={styles.empty}>{isComments ? "Комментариев пока нет — напишите первым" : "Пока нет ответов — начните тему первым"}</p> : null}
          {replies.map((m) => {
            const mine = m.senderId === me.id && !fromChannel(m);
            return (
              <MessageBubble
                key={m.id}
                message={m}
                mine={mine}
                sender={sender(m)}
                showSender={!mine}
                showAvatar
                meId={me.id}
                metaApart
                className={mine ? styles.mineReply : styles.otherReply}
                onOpenMenu={menu.openMenu}
              />
            );
          })}
        </div>
        {chatId && rootId ? (
          <div className={styles.composer}>
            {composer(add, {
              chatId,
              rootId,
              postId: isComments ? source.post.id : undefined,
              paidStars: comments && !comments.commentPriceFree ? comments.commentPriceStars : 0,
              people: people ?? [],
            }, replyTo)}
          </div>
        ) : null}
        <MessageMenus
          control={menu}
          actions={actions}
          chat={actionChat}
          me={me}
          senderName={(m) => sender(m)?.name ?? null}
          userOf={userOf}
          onReply={(m) => {
            menu.close();
            setReplyTo(m);
          }}
          onEdit={(m) => {
            menu.close();
            void edit(m);
          }}
        />
      </aside>
    </div>,
    document.body
  );
}
