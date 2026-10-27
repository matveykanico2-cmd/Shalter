import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { Button, Dialog, Icon, toast } from "@/shared/ui";

import { clearHistoryBeforeDay, messageDays } from "../api/message-days";

import styles from "./chat-calendar.module.css";

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

const pad = (n: number) => String(n).padStart(2, "0");
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

type Props = { chatId: string; onClose: () => void };

/** Календарь удаления истории: выберите дни, затем удалите историю за выбранное. */
export function ChatHistoryClear({ chatId, onClose }: Props) {
  const client = useQueryClient();
  const [shown, setShown] = useState(() => new Date());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const month = monthKey(shown);
  const days = useQuery({ queryKey: ["chat-history-clear", chatId, month], queryFn: () => messageDays(chatId, month), staleTime: 60_000 });
  const has = new Set(days.data?.days ?? []);
  const loadError = days.isError ? errorText(days.error, "Не удалось загрузить") : null;

  const toggle = (key: string) => {
    setError(null);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const shift = (delta: number) => {
    setSelected(new Set());
    setError(null);
    setShown((s) => new Date(s.getFullYear(), s.getMonth() + delta, 1));
  };

  const clearSelected = async () => {
    if (busy || selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const latest = [...selected].sort().pop()!;
      await clearHistoryBeforeDay(chatId, latest);
      await client.invalidateQueries({ queryKey: ["chat-history-clear", chatId, month] });
      await client.invalidateQueries({ queryKey: ["chats", "list"] });
      toast("История за выбранное удалена");
      onClose();
    } catch (err) {
      setError(errorText(err, "Не удалось удалить историю"));
    } finally {
      setBusy(false);
    }
  };

  const first = new Date(shown.getFullYear(), shown.getMonth(), 1);
  const daysInMonth = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const today = dayKey(new Date());

  return (
    <Dialog title="Удалить историю за дату" onClose={onClose}>
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
            const sel = selected.has(key);
            return (
              <button
                key={key}
                type="button"
                className={[styles.cell, on ? styles.has : "", sel ? styles.selected : "", key === today ? styles.today : ""].filter(Boolean).join(" ")}
                disabled={!on || busy}
                title={on ? sel ? "Убрать из выбранного" : "Выбрать день" : "В этот день не писали"}
                onClick={() => (on ? void toggle(key) : null)}
                aria-pressed={sel}
              >
                {String(i + 1)}
              </button>
            );
          })}
        </div>
      )}
      {error || loadError ? <p className={styles.error}>{error ?? loadError}</p> : null}
      <p className={styles.hint}>
        Выбрано дней: {selected.size}. История скроется для вас до конца последнего выбранного дня включительно.
      </p>
      <div className={styles.footer}>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button disabled={busy || selected.size === 0} onClick={() => void clearSelected()}>
          {busy ? "Удаляем…" : `Удалить историю за ${selected.size} дн${selected.size === 1 ? "ь" : selected.size <= 4 ? "я" : "ей"}`}
        </Button>
      </div>
    </Dialog>
  );
}
