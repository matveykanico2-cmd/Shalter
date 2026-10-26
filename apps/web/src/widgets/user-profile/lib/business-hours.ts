// Часы работы бизнеса — нужное профилю из public/js/lib/businessHours.js.
export type DayHours = { closed: boolean; open: string; close: string };
export type BusinessStatus = { open: boolean; until?: string; opensAt?: { day: DayKey; time: string; today: boolean } | null };

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export const DAY_LABELS: Record<DayKey, string> = { mon: "Понедельник", tue: "Вторник", wed: "Среда", thu: "Четверг", fri: "Пятница", sat: "Суббота", sun: "Воскресенье" };
const DAY_SHORT: Record<DayKey, string> = { mon: "пн", tue: "вт", wed: "ср", thu: "чт", fri: "пт", sat: "сб", sun: "вс" };

export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export const isAllDay = (d: DayHours) => d.open === "00:00" && d.close === "24:00";
const isOvernight = (d: DayHours) => d.close <= d.open;

export function formatDayHours(d: DayHours | undefined) {
  if (!d || d.closed) return "выходной";
  if (isAllDay(d)) return "круглосуточно";
  const close = d.close === "24:00" ? "00:00" : d.close;
  return `${d.open}–${close}${isOvernight(d) ? " (до след. дня)" : ""}`;
}

export function formatStatus(status: BusinessStatus | null | undefined, hours: Partial<Record<string, DayHours>>) {
  if (!status) return "";
  if (status.open) {
    if (DAY_KEYS.every((k) => hours[k] && !hours[k].closed && isAllDay(hours[k]))) return "Открыто круглосуточно";
    return `Открыто · до ${status.until === "24:00" ? "полуночи" : status.until}`;
  }
  if (!status.opensAt) return "Закрыто";
  const when = status.opensAt.today ? `в ${status.opensAt.time}` : `в ${DAY_SHORT[status.opensAt.day]} в ${status.opensAt.time}`;
  return `Закрыто · откроется ${when}`;
}
