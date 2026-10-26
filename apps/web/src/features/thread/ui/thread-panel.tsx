import { useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { type ChatSummary, isChatAdmin, isChatModerator } from "@/entities/chat";
import { type Message, MessageBubble, messageQueries, type MessageSender } from "@/entities/message";
import type { SelfUser } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, askText, Icon, Menu, type MenuItem, toast } from "@/shared/ui";

import { deleteReply, editReply, sendThreadReply } from "../api/thread";
import { useThread } from "../model/use-thread";

import styles from "./thread-panel.module.css";

type Props = {
  chat: ChatSummary;
  root: Message;
  me: SelfUser;
  userOf: (userId: string) => MessageSender | null;
  onClose: () => void;
};

const isServerModerator = (me: SelfUser) => !!me.isDeveloper || (me.adminSections ?? []).includes("moderation");

/** Ответы на сообщение группы — боковая панель, как openThreadPanel в public/js/components/threadPanel.js. */
export function ThreadPanel({ chat, root: initialRoot, me, userOf, onClose }: Props) {
  const client = useQueryClient();
  const { query, add, replace, remove } = useThread(chat.id, initialRoot.id);
  const root = query.data?.root ?? initialRoot;
  const replies = query.data?.replies ?? [];
  const [menu, setMenu] = useState<{ message: Message; at: { x: number; y: number } } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const staff = isChatAdmin(chat, me.id) || isChatModerator(chat, me.id) || isServerModerator(me);
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

  const sender = (m: Message) => (m.senderId === me.id ? { id: me.id, name: me.name, avatarColor: me.avatarColor, avatarImage: me.avatarImage } : userOf(m.senderId));

  const edit = async (m: Message) => {
    const text = await askText("Изменить комментарий", { initial: m.text ?? "", okLabel: "Сохранить" });
    const clean = text?.trim();
    if (!clean || clean === m.text) return;
    try {
      replace((await editReply(chat.id, m.id, clean)).message);
    } catch (err) {
      toast(errorText(err, "Не удалось сохранить"), { error: true });
    }
  };

  const removeReply = async (m: Message) => {
    const name = sender(m)?.name ?? "участника";
    if (!(await askConfirm(m.senderId === me.id ? "Удалить комментарий?" : `Удалить комментарий ${name}?`, { okLabel: "Удалить", danger: true }))) return;
    try {
      await deleteReply(chat.id, m.id);
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
      <aside className={styles.panel} role="dialog" aria-modal="true" aria-label="Тема" data-thread="">
        <header className={styles.header}>
          <h2>Тема</h2>
          <button type="button" className={styles.close} title="Закрыть" onClick={onClose}>
            <Icon name="X" size={18} />
          </button>
        </header>
        <div ref={body} className={styles.body}>
          <div className={styles.root}>
            <MessageBubble message={root} mine={root.senderId === me.id} sender={sender(root)} showSender meId={me.id} />
          </div>
          <p className={styles.label}>Ответы ({replies.length})</p>
          {query.isPending ? <span className={styles.spinner} aria-label="Загрузка" /> : null}
          {!query.isPending && !replies.length ? <p className={styles.empty}>Пока нет ответов — начните тему первым</p> : null}
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
        <ThreadComposer
          onSend={async (text) => {
            const { message } = await sendThreadReply(chat.id, root.id, text);
            add(message);
            touchFeed();
          }}
        />
        {menu ? <Menu at={menu.at} label="Комментарий" items={menuItems(menu.message)} onClose={() => setMenu(null)} /> : null}
      </aside>
    </div>,
    document.body
  );
}

/** Поле ответа: Enter — отправить, Shift+Enter — новая строка. */
function ThreadComposer({ onSend }: { onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => input.current?.focus(), []);
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(value);
      setText("");
    } catch (err) {
      setError(errorText(err, "Не удалось отправить"));
    } finally {
      setSending(false);
      input.current?.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className={styles.composer}>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.inputRow}>
        <textarea
          ref={input}
          className={styles.input}
          rows={1}
          placeholder="Ответить в теме"
          aria-label="Ответ в теме"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
        />
        <button type="button" className={styles.send} title="Отправить" disabled={!text.trim() || sending} onClick={() => void send()}>
          <Icon name="Send" size={20} />
        </button>
      </div>
    </div>
  );
}
