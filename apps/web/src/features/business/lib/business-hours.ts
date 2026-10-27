// Часы работы бизнеса — как public/js/lib/businessHours.js: статус «открыто/закрыто» в часовом
// поясе бизнеса, смены через полночь и круглосуточно.
export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type DayHours = { closed: boolean; open: string; close: string };
export type Hours = Record<DayKey, DayHours>;

export const DAY_LABELS: Record<DayKey, string> = { mon: "Понедельник", tue: "Вторник", wed: "Среда", thu: "Четверг", fri: "Пятница", sat: "Суббота", sun: "Воскресенье" };
const DAY_SHORT: Record<DayKey, string> = { mon: "пн", tue: "вт", wed: "ср", thu: "чт", fri: "пт", sat: "сб", sun: "вс" };
const EN_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function timeZoneList(): string[] {
  try {
    if (Intl.supportedValuesOf) return Intl.supportedValuesOf("timeZone");
  } catch {
    // Старый браузер — короткий список ниже.
  }
  return ["Europe/Kaliningrad", "Europe/Moscow", "Europe/Samara", "Asia/Yekaterinburg", "Asia/Omsk", "Asia/Novosibirsk", "Asia/Krasnoyarsk", "Asia/Irkutsk", "Asia/Yakutsk", "Asia/Vladivostok", "Asia/Magadan", "Asia/Kamchatka", "Europe/Minsk", "Asia/Almaty", "Asia/Tashkent", "Europe/London", "Europe/Berlin", "America/New_York", "UTC"];
}

export const isAllDay = (d: DayHours) => d.open === "00:00" && d.close === "24:00";
const isOvernight = (d: DayHours) => d.close <= d.open;

export function formatDayHours(d: DayHours | undefined) {
  if (!d || d.closed) return "выходной";
  if (isAllDay(d)) return "круглосуточно";
  const close = d.close === "24:00" ? "00:00" : d.close;
  return `${d.open}–${close}${isOvernight(d) ? " (до след. дня)" : ""}`;
}

function localNow(timeZone: string | null, now: Date) {
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: timeZone || undefined }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", opts).formatToParts(now);
  }
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { dayIndex: EN_DAYS.indexOf(p.weekday ?? ""), hm: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}

export type BusinessStatus = { open: true; until: string } | { open: false; opensAt: { day: DayKey; time: string; today: boolean } | null };

export function businessStatus(hours: Hours, timeZone: string | null, now = new Date()): BusinessStatus {
  const cur = localNow(timeZone, now);
  const dayOf = (i: number) => hours[DAY_KEYS[(i + 7) % 7]!];
  const today = dayOf(cur.dayIndex);
  const yesterday = dayOf(cur.dayIndex - 1);
  if (today && !today.closed) {
    if (!isOvernight(today) && cur.hm >= today.open && cur.hm < today.close) return { open: true, until: today.close };
    if (isOvernight(today) && cur.hm >= today.open) return { open: true, until: today.close };
  }
  if (yesterday && !yesterday.closed && isOvernight(yesterday) && cur.hm < yesterday.close) return { open: true, until: yesterday.close };
  if (today && !today.closed && cur.hm < today.open) return { open: false, opensAt: { day: DAY_KEYS[cur.dayIndex]!, time: today.open, today: true } };
  for (let i = 1; i <= 7; i++) {
    const d = dayOf(cur.dayIndex + i);
    if (d && !d.closed) return { open: false, opensAt: { day: DAY_KEYS[(cur.dayIndex + i) % 7]!, time: d.open, today: false } };
  }
  return { open: false, opensAt: null };
}

export function formatStatus(status: BusinessStatus, hours: Hours) {
  if (status.open) {
    if (DAY_KEYS.every((k) => hours[k] && !hours[k].closed && isAllDay(hours[k]))) return "Открыто круглосуточно";
    return `Открыто · до ${status.until === "24:00" ? "полуночи" : status.until}`;
  }
  if (!status.opensAt) return "Закрыто";
  const when = status.opensAt.today ? `в ${status.opensAt.time}` : `в ${DAY_SHORT[status.opensAt.day]} в ${status.opensAt.time}`;
  return `Закрыто · откроется ${when}`;
}
