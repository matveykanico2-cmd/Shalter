import { useState } from "react";

import { type FeedMessage, type Message, messagePreview, stripCustomEmoji } from "@/entities/message";

import { Icon } from "@/shared/ui";

import styles from "./message-feed.module.css";

type Props = {
  messages: readonly FeedMessage[];
  canUnpin: boolean;
  onJumpTo: (id: string) => void;
  onUnpin: (m: Message) => void;
};

/**
 * Закреплённое над лентой — как renderPinnedBar в public/js/views/chatView.js: из
 * загруженных сообщений; нажатие ведёт к нему, следующее — к следующему закреплённому.
 */
export function PinnedBar({ messages, canUnpin, onJumpTo, onUnpin }: Props) {
  const [index, setIndex] = useState(0);
  const pinned = messages.filter((m) => m.pinned && !m.pending);
  if (!pinned.length) return null;
  const current = pinned[index % pinned.length]!;
  return (
    <div className={styles.pinned}>
      <button
        type="button"
        className={styles.pinnedJump}
        title="Перейти к закреплённому"
        onClick={() => {
          onJumpTo(current.id);
          setIndex((i) => i + 1);
        }}
      >
        <Icon name="Pin" size={14} />
        <span className={styles.pinnedText}>{stripCustomEmoji(messagePreview(current)) || "Сообщение"}</span>
        {pinned.length > 1 ? <span className={styles.pinnedCount}>{pinned.length}</span> : null}
      </button>
      {canUnpin ? (
        <button type="button" className={styles.pinnedUnpin} title="Открепить" onClick={() => onUnpin(current)}>
          <Icon name="X" size={15} />
        </button>
      ) : null}
    </div>
  );
}
