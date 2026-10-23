// «В сети» и «был(а) …» — как public/js/lib/presence.js.

/** Русское множественное число: plural(5, "минуту", "минуты", "минут"). */
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const TIME = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
const DATE = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
const DATE_YEAR = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

/** «5 минут назад», «вчера в 18:40», «3 марта в 10:00». */
export function timeAgo(iso: string, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = TIME.format(d);
  const minutes = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return minutes === 1 ? "минуту назад" : `${minutes} ${plural(minutes, "минуту", "минуты", "минут")} назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "час назад" : `${hours} ${plural(hours, "час", "часа", "часов")} назад`;
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d.getTime() >= dayStart.getTime() - 86_400_000) return `вчера в ${time}`;
  const days = Math.floor((dayStart.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
  if (days < 7) return `${days} ${plural(days, "день", "дня", "дней")} назад`;
  return `${(d.getFullYear() === now.getFullYear() ? DATE : DATE_YEAR).format(d)} в ${time}`;
}

type Presence = { isBot?: boolean; online?: boolean; lastSeen?: string | null };

/** Подпись собеседника: «бот», «в сети», «был(а) …»; null — время скрыто. */
export function statusLabel(user: Presence, now = new Date()) {
  if (user.isBot) return "бот";
  // Сами без сети — «в сети» у собеседника устаревшее: показываем, когда видели.
  if (user.online && navigator.onLine !== false) return "в сети";
  if (!user.lastSeen) return null;
  const ago = timeAgo(user.lastSeen, now);
  return ago ? `был(а) ${ago}` : null;
}
