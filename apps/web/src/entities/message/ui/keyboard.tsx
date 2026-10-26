import { use } from "react";

import { linkSafety } from "@/shared/lib/link-safety";
import { openInAppBrowser } from "@/shared/ui";

import { type KeyboardButton, keyboardOf } from "../lib/keyboard";
import { MessageLinks } from "../model/message-links";
import type { Message } from "../model/types";

import styles from "./message-bubble.module.css";

const TONE = { primary: styles.keyPrimary, success: styles.keySuccess, danger: styles.keyDanger } as const;

/** Кнопки бота под пузырём (keyboard-rows в messageBubble.js): ссылка, мини-приложение или действие. */
export function MessageKeyboard({ message }: { message: Message }) {
  const { onKeyboard } = use(MessageLinks);
  const rows = keyboardOf(message.keyboard);
  if (!rows.length) return null;
  const press = (b: KeyboardButton) => {
    if (b.url && !b.app) return openInAppBrowser(b.url, linkSafety(b.url));
    onKeyboard?.(message, b);
  };
  return (
    <div className={styles.keyboard}>
      {rows.map((row, i) => (
        <div key={i} className={styles.keyboardRow}>
          {row.map((b, j) => (
            <button
              key={j}
              type="button"
              className={[styles.key, b.app ? styles.keyApp : b.url ? styles.keyUrl : "", b.style ? TONE[b.style] : ""].filter(Boolean).join(" ")}
              title={b.url && !b.app ? b.url : undefined}
              onClick={(e) => {
                e.stopPropagation();
                press(b);
              }}
            >
              {b.text}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
