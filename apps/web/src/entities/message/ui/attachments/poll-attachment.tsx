import { use, useEffect, useState } from "react";

import { plural } from "@/shared/lib/presence";
import { askConfirm, Avatar } from "@/shared/ui";

import { pollMeta, pollView } from "../../lib/poll";
import type { Attachment } from "../../model/attachment";
import type { FeedMessage as Message } from "../../model/types";
import { MessageLinks } from "../../model/message-links";

import styles from "./interactive.module.css";

export type PollActions = {
  onVote?: (m: Message, optionIndex: number) => void;
  onRetract?: (m: Message) => void;
  onClose?: (m: Message) => void;
  /** Остановить чужой опрос — админы и модераторы группы. */
  canCloseOthers?: boolean;
};

type PollUser = { id: string; name: string; avatarColor?: string | null; avatarImage?: string | null; avatarEmoji?: string | null };
type Props = { message: Message; attachment: Attachment; meId: string; userOf?: (id: string) => PollUser | null } & PollActions;

/** Опрос и викторина — PollAttachment из messageBubble.js. Вопрос — текст сообщения. */
export function PollAttachment({ message: m, attachment, meId, userOf, onVote, onRetract, onClose, canCloseOthers }: Props) {
  const meta = pollMeta(attachment);
  const [now, setNow] = useState(Date.now);
  const { onOpenProfile } = use(MessageLinks);
  useEffect(() => {
    if (!meta.closesAt || Date.parse(meta.closesAt) <= Date.now()) return;
    const deadline = Date.parse(meta.closesAt);
    const timer = setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (next >= deadline) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [meta.closesAt]);
  const v = pollView(meta, meId, now);
  const canClose = !v.closed && !m.pending && (m.senderId === meId || canCloseOthers) && !!onClose;
  const allVoters = [...new Set(v.voterIds.flat())];
  const deadline = v.closesAt && !v.closed ? deadlineLabel(v.closesAt - now) : null;
  return (
    <div className={[styles.poll, v.isQuiz ? styles.quiz : "", v.closed ? styles.closed : ""].filter(Boolean).join(" ")}>
      <p className={styles.question}>{m.text}</p>
      <p className={styles.kind}>{v.kindLabel}</p>
      <div className={styles.options}>
        {v.options.map((o, i) => (
          <div key={i} className={styles.optionWrap}>
            <button
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
            {v.votersVisible && o.voterIds.length ? <Voters ids={o.voterIds} userOf={userOf} onOpen={onOpenProfile} small /> : null}
          </div>
        ))}
      </div>
      {v.isQuiz && v.answered ? (
        <p className={v.gotIt ? `${styles.quizResult} ${styles.ok}` : `${styles.quizResult} ${styles.bad}`}>
          {v.gotIt ? "Верно!" : `Неверно. Правильный ответ: ${v.correctText}`}
        </p>
      ) : null}
      <div className={styles.footer}>
        {v.votersVisible && allVoters.length ? <Voters ids={allVoters} userOf={userOf} onOpen={onOpenProfile} /> : null}
        <span className={styles.total}>{v.totalVoters ? `${v.totalVoters} ${plural(v.totalVoters, "проголосовал", "проголосовали", "проголосовали")}` : "Пока нет голосов"}</span>
        {deadline ? <span className={styles.deadline}>До завершения: {deadline}</span> : null}
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

function deadlineLabel(ms: number) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  if (sec < 60) return `${sec} сек.`;
  const min = Math.ceil(sec / 60);
  if (min < 60) return `${min} мин.`;
  const hours = Math.ceil(min / 60);
  return hours < 24 ? `${hours} ч.` : `${Math.ceil(hours / 24)} дн.`;
}

function Voters({ ids, userOf, onOpen, small = false }: { ids: string[]; userOf?: (id: string) => PollUser | null; onOpen?: (id: string) => void; small?: boolean }) {
  const users = ids.map((id) => userOf?.(id)).filter((u): u is PollUser => !!u);
  if (!users.length) return null;
  return (
    <span className={small ? `${styles.voters} ${styles.votersSmall}` : styles.voters} aria-label="Проголосовавшие">
      {users.slice(0, small ? 5 : 8).map((user) => (
        <button
          key={user.id}
          type="button"
          className={styles.voter}
          title={user.name}
          aria-label={`Открыть профиль: ${user.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen?.(user.id);
          }}
        >
          <Avatar name={user.name} color={user.avatarColor} image={user.avatarImage} emoji={user.avatarEmoji} size={small ? 22 : 28} />
        </button>
      ))}
      {ids.length > (small ? 5 : 8) ? <span className={styles.moreVoters}>+{ids.length - (small ? 5 : 8)}</span> : null}
    </span>
  );
}
