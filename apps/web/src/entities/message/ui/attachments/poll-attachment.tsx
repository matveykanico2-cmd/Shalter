import { plural } from "@/shared/lib/presence";
import { askConfirm } from "@/shared/ui";

import { pollMeta, pollView } from "../../lib/poll";
import type { Attachment } from "../../model/attachment";
import type { FeedMessage as Message } from "../../model/types";

import styles from "./interactive.module.css";

export type PollActions = {
  onVote?: (m: Message, optionIndex: number) => void;
  onRetract?: (m: Message) => void;
  onClose?: (m: Message) => void;
  /** Остановить чужой опрос — админы и модераторы группы. */
  canCloseOthers?: boolean;
};

type Props = { message: Message; attachment: Attachment; meId: string } & PollActions;

/** Опрос и викторина — PollAttachment из messageBubble.js. Вопрос — текст сообщения. */
export function PollAttachment({ message: m, attachment, meId, onVote, onRetract, onClose, canCloseOthers }: Props) {
  const v = pollView(pollMeta(attachment), meId);
  const canClose = !v.closed && !m.pending && (m.senderId === meId || canCloseOthers) && !!onClose;
  return (
    <div className={[styles.poll, v.isQuiz ? styles.quiz : "", v.closed ? styles.closed : ""].filter(Boolean).join(" ")}>
      <p className={styles.question}>{m.text}</p>
      <p className={styles.kind}>{v.kindLabel}</p>
      <div className={styles.options}>
        {v.options.map((o, i) => (
          <button
            key={i}
            type="button"
            className={[styles.option, o.leader ? styles.leader : "", o.mark ? styles[o.mark] : ""].filter(Boolean).join(" ")}
            disabled={!v.canVote || m.pending || !onVote}
            aria-pressed={o.mine}
            onClick={() => onVote?.(m, i)}
          >
            {v.showResults ? <span className={styles.pct}>{o.pct}%</span> : <span className={v.multiple ? `${styles.radio} ${styles.square}` : styles.radio} />}
            <span className={styles.label}>
              {o.text}
              {o.mine && !v.isQuiz ? <span className={`${styles.mark} ${styles.markMine}`}>✓</span> : null}
              {o.mark === "correct" ? <span className={styles.mark}>✓</span> : null}
              {o.mark === "wrong" ? <span className={styles.mark}>✗</span> : null}
            </span>
            {v.showResults ? <span className={styles.fill} style={{ width: `${o.pct}%` }} /> : null}
          </button>
        ))}
      </div>
      {v.isQuiz && v.answered ? (
        <p className={v.gotIt ? `${styles.quizResult} ${styles.ok}` : `${styles.quizResult} ${styles.bad}`}>
          {v.gotIt ? "Верно!" : `Неверно. Правильный ответ: ${v.correctText}`}
        </p>
      ) : null}
      <div className={styles.footer}>
        <span className={styles.total}>{v.totalVoters ? `${v.totalVoters} ${plural(v.totalVoters, "проголосовал", "проголосовали", "проголосовали")}` : "Пока нет голосов"}</span>
        {v.answered && !v.isQuiz && !v.closed && onRetract ? (
          <button type="button" className={styles.action} onClick={() => onRetract(m)}>
            Отменить голос
          </button>
        ) : null}
        {canClose ? (
          <button
            type="button"
            className={`${styles.action} ${styles.danger}`}
            onClick={async () => {
              if (await askConfirm("Остановить опрос? Голосовать больше будет нельзя, итоги сохранятся.", { okLabel: "Остановить", danger: true })) onClose?.(m);
            }}
          >
            Остановить
          </button>
        ) : null}
      </div>
    </div>
  );
}
