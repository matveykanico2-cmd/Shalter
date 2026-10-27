import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { Button, Dialog, Icon } from "@/shared/ui";

import { messageAt, messageDays } from "../api/message-days";

import styles from "./chat-calendar.module.css";

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

const pad = (n: number) => String(n).padStart(2, "0");
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

type Props = { chatId: string; around: string; onPick: (messageId: string) => void; onClose: () => void };

/** «Перейти к дате» — public/js/components/chatCalendarDialog.js: дни с сообщениями нажимаются. */
export function ChatCalendar({ chatId, around, onPick, onClose }: Props) {
  const [shown, setShown] = useState(() => {
    const d = new Date(around);
    return Number.isNaN(d.getTime()) ? new Date() : new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const month = monthKey(shown);
  const days = useQuery({ queryKey: ["chat-calendar", chatId, month], queryFn: () => messageDays(chatId, month), staleTime: 60_000 });
  const has = new Set(days.data?.days ?? []);
  const loadError = days.isError ? errorText(days.error, "Не удалось загрузить") : null;

  const pick = async (key: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { message } = await messageAt(chatId, key);
      if (!message) {
        setError("В этот день и позже сообщений нет");
        setBusy(false);
        return;
      }
      onClose();
      onPick(message.id);
    } catch (err) {
      setError(errorText(err, "Не получилось перейти"));
      setBusy(false);
    }
  };

  const shift = (delta: number) => {
    setShown((s) => new Date(s.getFullYear(), s.getMonth() + delta, 1));
    setError(null);
  };

  const first = new Date(shown.getFullYear(), shown.getMonth(), 1);
  const daysInMonth = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const today = dayKey(new Date());

  return (
    <Dialog title="Перейти к дате" onClose={onClose}>
      <div className={styles.head}>
        <button type="button" className={styles.nav} aria-label="Предыдущий месяц" onClick={() => shift(-1)}>
          <Icon name="ChevronLeft" size={18} />
        </button>
        <span className={styles.month}>{`${MONTHS[shown.getMonth()]} ${shown.getFullYear()}`}</span>
        <button type="button" className={styles.nav} aria-label="Следующий месяц" onClick={() => shift(1)}>
          <Icon name="ChevronRight" size={18} />
        </button>
      </div>
      <div className={styles.weekdays}>
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      {days.isPending ? (
        <p className={styles.loading}>Загрузка…</p>
      ) : (
        <div className={styles.grid}>
          {Array.from({ length: leading }, (_, i) => (
            <span key={`e${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const key = `${month}-${pad(i + 1)}`;
            const on = has.has(key);
            return (
              <button
                key={key}
                type="button"
                className={[styles.cell, on ? styles.has : "", key === today ? styles.today : ""].filter(Boolean).join(" ")}
                disabled={!on || busy}
                title={on ? "Перейти к сообщениям этого дня" : "В этот день не писали"}
                onClick={() => void pick(key)}
              >
                {String(i + 1)}
              </button>
            );
          })}
        </div>
      )}
      {error || loadError ? <p className={styles.error}>{error ?? loadError}</p> : null}
      <Button variant="link" onClick={onClose}>
        Закрыть
      </Button>
    </Dialog>
  );
}
