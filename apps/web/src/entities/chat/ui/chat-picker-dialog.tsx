import { useMemo, useState } from "react";

import { Avatar, Button, Dialog, Icon } from "@/shared/ui";

import { chatTitle } from "../lib/chat-list";
import type { ChatSummary } from "../model/types";
import { useChats } from "../model/use-chats";

import styles from "./chat-picker-dialog.module.css";

type Props = {
  title: string;
  /** Чаты, которых в списке нет (личка с тем, чей контакт отправляем). */
  exclude?: readonly string[];
  /** Отправить в один чат; ошибка — показывает вызывающий. */
  onSend: (chatId: string) => Promise<void>;
  onClose: () => void;
};

const titleOf = (c: ChatSummary) => (c.isSaved ? "Избранное" : chatTitle(c));

/**
 * Кому отправить (контакт, QR-код) — openForwardDialog с title в public/js/components/forwardDialog.js:
 * касание отмечает чат, отправить можно сразу нескольким; Избранное — первым, архив и секретные — нет.
 */
export function ChatPickerDialog({ title, exclude, onSend, onClose }: Props) {
  const chats = useChats().data;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [sending, setSending] = useState<number | null>(null);

  const candidates = useMemo(
    () => (chats ?? []).filter((c) => (!c.archived || c.isSaved) && !c.secret && !exclude?.includes(c.id)).sort((a, b) => Number(!!b.isSaved) - Number(!!a.isSaved)),
    [chats, exclude]
  );
  const q = query.trim().toLowerCase();
  const shown = q ? candidates.filter((c) => titleOf(c).toLowerCase().includes(q)) : candidates;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const send = async () => {
    if (!selected.size || sending !== null) return;
    const ids = candidates.filter((c) => selected.has(c.id)).map((c) => c.id);
    for (let i = 0; i < ids.length; i++) {
      setSending(i);
      await onSend(ids[i]!).catch(() => {});
    }
    onClose();
  };

  const total = selected.size;
  const sendLabel = sending !== null ? (total > 1 ? `Отправляем… ${sending + 1}/${total}` : "Отправляем…") : total ? `Отправить (${total})` : "Выберите чаты";

  return (
    <Dialog title={title} onClose={onClose} className={styles.dialog}>
      <input className={styles.search} type="search" placeholder="Поиск" aria-label="Поиск" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className={styles.list}>
        {shown.length ? (
          shown.map((c) => (
            <button
              key={c.id}
              type="button"
              className={selected.has(c.id) ? `${styles.row} ${styles.selected}` : styles.row}
              aria-pressed={selected.has(c.id)}
              disabled={sending !== null}
              onClick={() => toggle(c.id)}
            >
              {c.isSaved ? (
                <span className={styles.saved}>
                  <Icon name="Bookmark" size={18} />
                </span>
              ) : (
                <Avatar size={36} name={titleOf(c)} color={c.otherUser?.avatarColor ?? c.avatarColor} image={c.otherUser ? c.otherUser.avatarImage : c.avatarImage} />
              )}
              <span className={styles.title}>{titleOf(c)}</span>
              <span className={styles.check}>
                <Icon name="Check" size={14} />
              </span>
            </button>
          ))
        ) : (
          <p className={styles.hint}>Ничего не найдено</p>
        )}
      </div>
      <div className={styles.footer}>
        <span />
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={!total || sending !== null} onClick={() => void send()}>
            {sendLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
