import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { type ChatSummary, isChatAdmin, isChatModerator, useChats } from "@/entities/chat";
import { type Message, MessageBubble, messageQueries, type MessageSender } from "@/entities/message";
import { isServerModerator, type SelfUser } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, askText, Icon, Menu, type MenuItem, toast } from "@/shared/ui";

import { deleteReply, editReply } from "../api/thread";
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
  composer: (onSent: (m: Message) => void, target: ThreadTarget) => ReactNode;
};

/**
 * Ответы на сообщение группы или комментарии к посту канала — боковая панель, как
 * openThreadPanel в public/js/components/threadPanel.js (openPostComments в chatView.js).
 */
export function ThreadPanel({ chat, source, me, userOf, onClose, composer }: Props) {
  const client = useQueryClient();
  const { query, replies, comments, chatId, rootId, add, replace, remove } = useThread(source);
  const isComments = source.kind === "comments";
  const root = isComments ? (comments?.anchor ?? source.post) : ((query.data as { root?: Message } | undefined)?.root ?? source.root);
  const title = isComments ? "Комментарии" : "Тема";
  const [entering, setEntering] = useState(true);
  const [menu, setMenu] = useState<{ message: Message; at: { x: number; y: number } } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  // Комментарии лежат в группе обсуждения, и удаляет их её админ, а не админ канала.
  const chats = useChats().data;
  const scope = isComments ? (chats?.find((c) => c.id === chatId) ?? null) : chat;
  const staff = (!!scope && (isChatAdmin(scope, me.id) || isChatModerator(scope, me.id))) || isServerModerator(me);
  // Комментаторы — из ответа сервера: в группе обсуждения могут быть не подписчики канала.
  const people = comments?.members ?? null;
  const author = (id: string) => people?.find((u) => u.id === id) ?? userOf(id);
  // Счётчик «N ответов» под сообщением в ленте.
  const touchFeed = () => void client.invalidateQueries({ queryKey: messageQueries.chatHistories(chat.id) });

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

  const sender = (m: Message) => (m.senderId === me.id ? { id: me.id, name: me.name, avatarColor: me.avatarColor, avatarImage: me.avatarImage } : author(m.senderId));

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

  const removeReply = async (m: Message) => {
    const name = sender(m)?.name ?? "участника";
    if (!(await askConfirm(m.senderId === me.id ? "Удалить комментарий?" : `Удалить комментарий ${name}?`, { okLabel: "Удалить", danger: true }))) return;
    try {
      await deleteReply(chatId, m.id);
      remove(m.id);
      touchFeed();
    } catch (err) {
      toast(errorText(err, "Не удалось удалить"), { error: true });
    }
  };

  const menuItems = (m: Message): MenuItem[] => [
    ...(m.senderId === me.id && m.text ? [{ icon: "Edit" as const, label: "Изменить", onClick: () => void edit(m) }] : []),
    ...(m.senderId === me.id || staff ? [{ icon: "Trash" as const, label: "Удалить", danger: true, onClick: () => void removeReply(m) }] : []),
  ];

  return createPortal(
    <div
      className={styles.overlay}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className={entering ? `${styles.panel} ${styles.entering}` : styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-thread=""
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget) setEntering(false);
        }}
      >
        <header className={styles.header}>
          <h2>{title}</h2>
          <button type="button" className={styles.close} title="Закрыть" onClick={onClose}>
            <Icon name="X" size={18} />
          </button>
        </header>
        <div ref={body} className={styles.body}>
          <div className={styles.root}>
            <MessageBubble message={root} mine={root.senderId === me.id} sender={sender(root)} showSender meId={me.id} />
          </div>
          <p className={styles.label}>
            {isComments ? "Комментарии" : "Ответы"} ({replies.length})
          </p>
          {query.isPending ? <span className={styles.spinner} aria-label="Загрузка" /> : null}
          {query.isError ? <p className={styles.empty}>{errorText(query.error, isComments ? "Комментарии недоступны" : "Не удалось загрузить ответы")}</p> : null}
          {query.isSuccess && !replies.length ? <p className={styles.empty}>{isComments ? "Комментариев пока нет — напишите первым" : "Пока нет ответов — начните тему первым"}</p> : null}
          {replies.map((m) => {
            const mine = m.senderId === me.id;
            const canAct = menuItems(m).length > 0;
            return (
              <MessageBubble
                key={m.id}
                message={m}
                mine={mine}
                sender={sender(m)}
                showSender={!mine}
                showAvatar={!mine}
                meId={me.id}
                onOpenMenu={canAct ? (msg, at) => setMenu({ message: msg, at }) : undefined}
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
            })}
          </div>
        ) : null}
        {menu ? <Menu at={menu.at} label="Комментарий" items={menuItems(menu.message)} onClose={() => setMenu(null)} /> : null}
      </aside>
    </div>,
    document.body
  );
}
