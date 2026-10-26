import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";

import { closeGameScores, gameQueries, type GameRef } from "@/entities/game";

import { errorText } from "@/shared/lib/error-text";
import { Avatar, Button } from "@/shared/ui";

import styles from "./games.module.css";

const MEDALS = ["🥇", "🥈", "🥉"];

/** Таблица рекордов (openScores в games.js) — поверх окна игры, откуда её тоже открывают. */
export function GameScores({ game, chatId }: { game: GameRef; chatId: string | null }) {
  const scores = useQuery(gameQueries.scores(game.id, chatId));
  const title = `${game.emoji ?? "🎮"} Рекорды · ${game.title ?? ""}`;
  return createPortal(
    <div
      className={`${styles.modalOverlay} ${styles.scoresOverlay}`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closeGameScores();
      }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={title}>
        <h2 className={styles.modalTitle}>{title}</h2>
        {chatId ? <p className={styles.hint}>Лучшие результаты в этом чате</p> : null}
        <div className={styles.scores}>
          {scores.isError ? (
            <p className={styles.errorText}>{errorText(scores.error, "Не удалось загрузить рекорды")}</p>
          ) : !scores.data ? (
            <p className={styles.hint}>Загружаем…</p>
          ) : !scores.data.length ? (
            <p className={styles.hint}>Пока никто не играл — будьте первым!</p>
          ) : (
            scores.data.map((s, i) => (
              <div key={s.userId} className={styles.scoreRow}>
                <span className={styles.place}>{MEDALS[i] ?? String(i + 1)}</span>
                <Avatar size={32} name={s.name} color={s.avatarColor} image={s.avatarImage} />
                <span className={styles.scoreName}>{s.name}</span>
                <b>{s.score}</b>
              </div>
            ))
          )}
        </div>
        <Button variant="secondary" onClick={closeGameScores}>
          Закрыть
        </Button>
      </div>
    </div>,
    document.body
  );
}
