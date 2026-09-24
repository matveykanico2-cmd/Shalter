// Часы работы Shalter для бизнеса на клиенте — подписи и предпросмотр
// «открыто ли сейчас». Правила те же, что в server/lib/businessHours.js
// (он и решает, когда слать автоответ): "00:00"–"24:00" — круглосуточно,
// close раньше open — работа через полночь.
export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_LABELS = { mon: "Понедельник", tue: "Вторник", wed: "Среда", thu: "Четверг", fri: "Пятница", sat: "Суббота", sun: "Воскресенье" };
const DAY_SHORT = { mon: "пн", tue: "вт", wed: "ср", thu: "чт", fri: "пт", sat: "сб", sun: "вс" };
const EN_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// Все пояса, которые знает браузер, — для выбора. Старый браузер без
// supportedValuesOf получает короткий список самых частых.
export function timeZoneList() {
  try {
    if (Intl.supportedValuesOf) return Intl.supportedValuesOf("timeZone");
  } catch {}
  return ["Europe/Kaliningrad", "Europe/Moscow", "Europe/Samara", "Asia/Yekaterinburg", "Asia/Omsk", "Asia/Novosibirsk", "Asia/Krasnoyarsk", "Asia/Irkutsk", "Asia/Yakutsk", "Asia/Vladivostok", "Asia/Magadan", "Asia/Kamchatka", "Europe/Minsk", "Asia/Almaty", "Asia/Tashkent", "Europe/London", "Europe/Berlin", "America/New_York", "UTC"];
}

export const isAllDay = (d) => d.open === "00:00" && d.close === "24:00";
const isOvernight = (d) => d.close <= d.open;

// «09:00–18:00», «круглосуточно», «20:00–02:00 (до след. дня)».
export function formatDayHours(d) {
  if (!d || d.closed) return "выходной";
  if (isAllDay(d)) return "круглосуточно";
  const close = d.close === "24:00" ? "00:00" : d.close;
  return `${d.open}–${close}${isOvernight(d) ? " (до след. дня)" : ""}`;
}

function localNow(timeZone) {
  let parts;
  const opts = { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  try {
    parts = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: timeZone || undefined }).formatToParts(new Date());
  } catch {
    parts = new Intl.DateTimeFormat("en-US", opts).formatToParts(new Date());
  }
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { dayIndex: EN_DAYS.indexOf(p.weekday), hm: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}

// Тот же расчёт, что businessStatus на сервере, — для предпросмотра в
// настройках, где ответа сервера со статусом нет.
export function businessStatus(hours, timeZone) {
  const now = localNow(timeZone);
  const dayOf = (i) => hours?.[DAY_KEYS[(i + 7) % 7]];
  const today = dayOf(now.dayIndex);
  const yesterday = dayOf(now.dayIndex - 1);
  if (today && !today.closed) {
    if (!isOvernight(today) && now.hm >= today.open && now.hm < today.close) return { open: true, until: today.close };
    if (isOvernight(today) && now.hm >= today.open) return { open: true, until: today.close };
  }
  if (yesterday && !yesterday.closed && isOvernight(yesterday) && now.hm < yesterday.close) return { open: true, until: yesterday.close };
  if (today && !today.closed && now.hm < today.open) return { open: false, opensAt: { day: DAY_KEYS[now.dayIndex], time: today.open, today: true } };
  for (let i = 1; i <= 7; i++) {
    const d = dayOf(now.dayIndex + i);
    if (d && !d.closed) return { open: false, opensAt: { day: DAY_KEYS[(now.dayIndex + i) % 7], time: d.open, today: false } };
  }
  return { open: false, opensAt: null };
}

// «Открыто · до 18:00», «Открыто круглосуточно», «Закрыто · откроется в пн в 09:00».
export function formatStatus(status, hours) {
  if (!status) return "";
  if (status.open) {
    if (hours && DAY_KEYS.every((k) => hours[k] && !hours[k].closed && isAllDay(hours[k]))) return "Открыто круглосуточно";
    return `Открыто · до ${status.until === "24:00" ? "полуночи" : status.until}`;
  }
  if (!status.opensAt) return "Закрыто";
  const when = status.opensAt.today ? `в ${status.opensAt.time}` : `в ${DAY_SHORT[status.opensAt.day]} в ${status.opensAt.time}`;
  return `Закрыто · откроется ${when}`;
}
