import { useEffect, useState } from "react";

import { diceResult } from "../../lib/message-preview";
import type { Attachment } from "../../model/attachment";
import type { Message } from "../../model/types";

import styles from "./interactive.module.css";

const FRESH_MS = 8000;
const ROLL_MS = 1200;

/** Эмодзи-игра: свежий бросок крутится секунду, потом результат (DiceAttachment). */
export function DiceAttachment({ message, attachment }: { message: Message; attachment: Attachment }) {
  const meta = (attachment.meta ?? {}) as { emoji?: string; value?: number };
  const [fresh] = useState(() => Date.now() - Date.parse(message.createdAt) < FRESH_MS);
  const [rolling, setRolling] = useState(fresh);
  useEffect(() => {
    if (!rolling || !meta.value) return;
    const t = setTimeout(() => setRolling(false), ROLL_MS);
    return () => clearTimeout(t);
  }, [rolling, meta.value]);
  // Пока сервер не ответил (временный пузырь), значения ещё нет — просто крутим.
  const waiting = !meta.value;
  return (
    <div className={styles.dice}>
      <span className={[styles.diceEmoji, rolling || waiting ? styles.rolling : "", waiting ? styles.waiting : ""].filter(Boolean).join(" ")} role="img" aria-label={meta.emoji ?? "🎲"}>
        {meta.emoji ?? "🎲"}
      </span>
      {!waiting && !rolling ? <span className={styles.diceResult}>{diceResult(meta)}</span> : null}
    </div>
  );
}

/** Карточка игры. Сами игры (каталог, запуск, рекорды) переедут с их экраном. */
export function GameCard({ attachment }: { attachment: Attachment }) {
  const meta = (attachment.meta ?? {}) as { title?: string; emoji?: string; description?: string };
  return (
    <div className={styles.game}>
      <div className={styles.gameCover}>
        <span className={styles.gameEmoji}>{meta.emoji || "🎮"}</span>
      </div>
      <div className={styles.gameBody}>
        <p className={styles.gameTitle}>{meta.title || "Игра"}</p>
        {meta.description ? <p className={styles.gameDesc}>{meta.description}</p> : null}
      </div>
    </div>
  );
}
