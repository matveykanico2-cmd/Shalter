import { useMemo, useState } from "react";

import { type ChatSummary, chatTitle, useChats } from "@/entities/chat";

import { Avatar, Button, Dialog, Icon } from "@/shared/ui";

import styles from "./message-actions.module.css";

type Props = {
  /** Отправить в эти чаты; вернуть, сколько не ушло. */
  onSend: (chatIds: string[], hideAuthor: boolean, progress: (done: number) => void) => Promise<void>;
  onClose: () => void;
};

const titleOf = (c: ChatSummary) => (c.isSaved ? "Избранное" : chatTitle(c));

/**
 * Выбор чатов для пересылки — как public/js/components/forwardDialog.js: касание отмечает
 * чат, отправить можно сразу нескольким; Избранное — первым, архив и секретные — нет.
 */
export function ForwardDialog({ onSend, onClose }: Props) {
  const chats = useChats().data;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [hideAuthor, setHideAuthor] = useState(false);
  const [sending, setSending] = useState<{ done: number } | null>(null);

  const candidates = useMemo(
    () => (chats ?? []).filter((c) => (!c.archived || c.isSaved) && !c.secret).sort((a, b) => Number(!!b.isSaved) - Number(!!a.isSaved)),
    [chats]
  );
  const q = query.trim().toLowerCase();
  const shown = q ? candidates.filter((c) => titleOf(c).toLowerCase().includes(q)) : candidates;
  const allOn = shown.length > 0 && shown.every((c) => selected.has(c.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of shown) {
        if (allOn) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });

  const send = async () => {
    if (!selected.size || sending) return;
    const ids = candidates.filter((c) => selected.has(c.id)).map((c) => c.id);
    setSending({ done: 0 });
    await onSend(ids, hideAuthor, (done) => setSending({ done }));
    onClose();
  };

  const total = selected.size;
  const sendLabel = sending ? (total > 1 ? `Отправляем… ${Math.min(sending.done + 1, total)}/${total}` : "Отправляем…") : total ? `Отправить (${total})` : "Выберите чаты";

  return (
    <Dialog title="Переслать сообщение" onClose={onClose} className={styles.forward}>
      <input className={styles.search} type="search" placeholder="Поиск" aria-label="Поиск" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className={styles.forwardList}>
        {shown.length ? (
          shown.map((c) => (
            <button
              key={c.id}
              type="button"
              className={selected.has(c.id) ? `${styles.forwardRow} ${styles.selected}` : styles.forwardRow}
              aria-pressed={selected.has(c.id)}
              disabled={!!sending}
              onClick={() => toggle(c.id)}
            >
              {c.isSaved ? (
                <span className={styles.savedAvatar}>
                  <Icon name="Bookmark" size={18} />
                </span>
              ) : (
                <Avatar size={36} name={titleOf(c)} color={c.otherUser?.avatarColor ?? c.avatarColor} image={c.otherUser ? c.otherUser.avatarImage : c.avatarImage} />
              )}
              <span className={styles.forwardTitle}>{titleOf(c)}</span>
              <span className={styles.forwardCheck}>
                <Icon name="Check" size={14} />
              </span>
            </button>
          ))
        ) : (
          <p className={styles.hint}>Ничего не найдено</p>
        )}
      </div>
      {/* Как в Telegram: сообщение уходит как своё, без подписи «Переслано от». */}
      <label className={styles.checkRow}>
        <input type="checkbox" checked={hideAuthor} onChange={(e) => setHideAuthor(e.target.checked)} />
        <span>Скрыть имя отправителя</span>
      </label>
      <div className={styles.forwardFooter}>
        {shown.length ? (
          <Button variant="link" onClick={toggleAll} disabled={!!sending}>
            {allOn ? "Снять выбор" : "Выбрать всех"}
          </Button>
        ) : (
          <span />
        )}
        <div className={styles.forwardActions}>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={!total || !!sending} onClick={() => void send()}>
            {sendLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
