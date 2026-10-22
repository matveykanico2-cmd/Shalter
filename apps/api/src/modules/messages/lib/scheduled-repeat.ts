// Повтор отложенного и «когда будет в сети» — как в server/data/scheduledMessages.js
// (scheduled-repeat.spec.ts сверяет с ним).

/** Повтор, как в Telegram: после отправки сообщение не удаляется, а переносится на следующий срок. */
export const REPEATS = ["day", "week", "2weeks", "month", "3months", "6months", "year"] as const;
export type Repeat = (typeof REPEATS)[number];

export const isRepeat = (value: unknown): value is Repeat => (REPEATS as readonly unknown[]).includes(value);

/**
 * «Отправить, когда будет в сети»: дата-заглушка, которую обычный проход по сроку
 * никогда не достигает. Такие сообщения уходят, когда собеседник в личке появится онлайн.
 */
export const WHEN_ONLINE = "9999-12-31T00:00:00.000Z";

const DAY_STEPS: Record<string, number> = { day: 1, week: 7, "2weeks": 14 };
const MONTH_STEPS: Record<string, number> = { month: 1, "3months": 3, "6months": 6, year: 12 };

// Месяцы считаем от исходной даты с подрезкой до конца месяца: 31 января →
// 28 февраля → 31 марта, а не 3 марта → 3 апреля.
function addMonthsClamped(base: Date, months: number): Date {
  const d = new Date(base);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** Ближайший срок повтора позже nowIso; null — повтора нет или дата битая. */
export function nextOccurrence(iso: string, repeat: string, nowIso = new Date().toISOString()): string | null {
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return null;
  for (let k = 1; k < 100_000; k++) {
    let d: Date;
    if (DAY_STEPS[repeat]) d = new Date(base.getTime() + k * DAY_STEPS[repeat] * 86400_000);
    else if (MONTH_STEPS[repeat]) d = addMonthsClamped(base, k * MONTH_STEPS[repeat]);
    else return null;
    if (d.toISOString() > nowIso) return d.toISOString();
  }
  return null;
}
