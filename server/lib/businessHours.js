// Часы работы Shalter для бизнеса — «открыто ли сейчас» и «когда откроется»,
// по часовому поясу самого бизнеса (settings.business.timeZone), а не
// сервера: кофейня в Новосибирске открывается в 9 утра по Новосибирску,
// где бы ни стоял сервер.
//
// Формат дня — { closed, open: "HH:MM", close: "HH:MM" }:
// - close позже open — обычный день, [open, close);
// - "00:00"–"24:00" — круглосуточно;
// - close раньше open (или равен) — работа через полночь: 20:00–02:00 значит
//   с 20:00 этого дня до 02:00 следующего.
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const EN_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Существует ли такой часовой пояс — Intl бросает на неизвестном.
function isValidTimeZone(tz) {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// День недели, время и дата «сейчас» в поясе бизнеса. Без пояса (старые
// настройки) — пояс сервера, как было раньше.
function localNow(timeZone, at = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: isValidTimeZone(timeZone) ? timeZone : undefined,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    dayIndex: EN_DAYS.indexOf(parts.weekday),
    hm: `${hour}:${parts.minute}`,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

const isOvernight = (d) => d.close <= d.open;

// { open: true, until: "18:00" } | { open: false, opensAt: { day: "mon", time: "09:00", today: bool } | null }
function businessStatus(hours, timeZone, at = new Date()) {
  const now = localNow(timeZone, at);
  const dayOf = (i) => hours?.[DAY_KEYS[(i + 7) % 7]];
  const today = dayOf(now.dayIndex);
  const yesterday = dayOf(now.dayIndex - 1);

  if (today && !today.closed) {
    if (!isOvernight(today) && now.hm >= today.open && now.hm < today.close) return { open: true, until: today.close };
    if (isOvernight(today) && now.hm >= today.open) return { open: true, until: today.close };
  }
  if (yesterday && !yesterday.closed && isOvernight(yesterday) && now.hm < yesterday.close) {
    return { open: true, until: yesterday.close };
  }

  if (today && !today.closed && now.hm < today.open) {
    return { open: false, opensAt: { day: DAY_KEYS[now.dayIndex], time: today.open, today: true } };
  }
  for (let i = 1; i <= 7; i++) {
    const d = dayOf(now.dayIndex + i);
    if (d && !d.closed) return { open: false, opensAt: { day: DAY_KEYS[(now.dayIndex + i) % 7], time: d.open, today: false } };
  }
  return { open: false, opensAt: null };
}

function isWithinBusinessHours(hours, timeZone) {
  return businessStatus(hours, timeZone).open;
}

module.exports = { DAY_KEYS, isValidTimeZone, localNow, businessStatus, isWithinBusinessHours };
