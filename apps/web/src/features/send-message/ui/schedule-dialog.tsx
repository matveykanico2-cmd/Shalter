import { useState } from "react";

import { Button, Dialog } from "@/shared/ui";

import type { RepeatId } from "../api/send-message";
import { REPEAT_OPTIONS } from "../lib/repeat";

import styles from "./create-dialogs.module.css";

/** datetime-local в местном времени. */
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export type ScheduleChoice = { sendAt: string; repeat: RepeatId | null; whenOnline: false } | { sendAt: null; repeat: null; whenOnline: true };

type Props = {
  /** В личке — «Отправить, когда будет в сети». */
  allowWhenOnline: boolean;
  onSchedule: (choice: ScheduleChoice) => void;
  onClose: () => void;
};

/** «Отправить позже» — как public/js/components/scheduleSendDialog.js: через 5 минут по умолчанию, повтор. */
export function ScheduleDialog({ allowWhenOnline, onSchedule, onClose }: Props) {
  const [at, setAt] = useState(() => {
    const d = new Date(Date.now() + 5 * 60_000);
    d.setSeconds(0, 0);
    return toLocalInput(d);
  });
  const [min] = useState(() => toLocalInput(new Date()));
  const [repeat, setRepeat] = useState<RepeatId | "">("");
  const [error, setError] = useState<string | null>(null);

  const schedule = () => {
    if (!at) {
      setError("Выберите дату и время");
      return;
    }
    const iso = new Date(at).toISOString();
    if (iso <= new Date().toISOString()) {
      setError("Время должно быть в будущем");
      return;
    }
    onClose();
    onSchedule({ sendAt: iso, repeat: repeat || null, whenOnline: false });
  };

  return (
    <Dialog title="Отправить позже" onClose={onClose}>
      <input className={styles.input} type="datetime-local" aria-label="Когда отправить" value={at} min={min} onChange={(e) => setAt(e.target.value)} />
      <label className={styles.repeat}>
        <span>Повтор</span>
        <select className={styles.input} aria-label="Повтор" value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatId | "")}>
          {REPEAT_OPTIONS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className={styles.error}>{error}</p> : null}
      <Button onClick={schedule}>Запланировать</Button>
      {/* Как в Telegram: в личке — «Отправить, когда будет в сети». */}
      {allowWhenOnline ? (
        <Button
          variant="secondary"
          onClick={() => {
            onClose();
            onSchedule({ sendAt: null, repeat: null, whenOnline: true });
          }}
        >
          Отправить, когда будет в сети
        </Button>
      ) : null}
      <Button variant="secondary" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}
