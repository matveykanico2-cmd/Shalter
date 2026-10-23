import { type ChatSummary } from "@/entities/chat";
import { chosenReactions, type Message, PREMIUM_REACTIONS, QUICK_REACTIONS } from "@/entities/message";

import { allowedReactions } from "../lib/permissions";

import styles from "./message-actions.module.css";

type Props = { chat: ChatSummary; message: Message; meId: string; isPremium: boolean; onReact: (emoji: string) => void };

/** Полоса быстрых реакций: разрешённые в чате или быстрые (+ Premium). */
export function ReactionStrip({ chat, message, meId, isPremium, onReact }: Props) {
  const allowed = allowedReactions(chat);
  const list = allowed ?? [...QUICK_REACTIONS, ...(isPremium ? PREMIUM_REACTIONS : [])];
  const chosen = chosenReactions(message, meId);
  return (
    <div className={styles.strip} role="group" aria-label="Реакции">
      {list.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className={chosen.has(emoji) ? `${styles.reaction} ${styles.chosen}` : styles.reaction}
          aria-label={emoji}
          aria-pressed={chosen.has(emoji)}
          onClick={() => onReact(emoji)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
