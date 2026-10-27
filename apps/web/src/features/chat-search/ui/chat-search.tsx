import { useEffect, useRef, useState } from "react";

import { type Message, messagePreview } from "@/entities/message";

import { Icon } from "@/shared/ui";

import { searchInChat } from "../api/chat-search";

import styles from "./chat-search.module.css";

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

type Props = {
  chatId: string;
  senderName: (m: Message) => string | null;
  onPick: (m: Message) => void;
  onClose: () => void;
  /** Начальный запрос — #тег, нажатый в сообщении. */
  initialQuery?: string;
};

/** «Поиск по чату» над лентой — как openSearch в public/js/views/chatView.js. */
export function ChatSearch({ chatId, senderName, onPick, onClose, initialQuery = "" }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Message[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const q = query.trim();
  useEffect(() => {
    if (q.length < MIN_CHARS) return;
    const abort = new AbortController();
    const t = setTimeout(() => {
      searchInChat(chatId, q, abort.signal).then(
        ({ messages }) => setResults(messages),
        () => !abort.signal.aborted && setResults([])
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      abort.abort();
    };
  }, [chatId, q]);
  const shown = q.length < MIN_CHARS ? null : results;

  return (
    <div className={styles.panel} role="search">
      <div className={styles.bar}>
        <input
          ref={input}
          className={styles.field}
          type="search"
          placeholder="Найти в этом чате"
          aria-label="Найти в этом чате"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setResults(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <button type="button" className={styles.close} title="Закрыть поиск" onClick={onClose}>
          <Icon name="X" size={16} />
        </button>
      </div>
      {shown ? (
        <div className={styles.results}>
          {shown.length === 0 ? <p className={styles.empty}>Ничего не найдено</p> : null}
          {shown.map((m) => (
            <button key={m.id} type="button" className={styles.hit} onClick={() => onPick(m)}>
              <span className={styles.who}>{senderName(m) ?? ""}</span>
              <span className={styles.text}>{messagePreview(m)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
