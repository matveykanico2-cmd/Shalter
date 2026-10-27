import { formatClock } from "@/shared/lib/time-format";

const DATE = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" });

/** «Прочитано сегодня в 12:30» — пункт меню своего сообщения в личке (messageBubble.js). */
export function readAtLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const diff = Math.floor((day.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  const when = diff <= 0 ? "сегодня" : diff === 1 ? "вчера" : DATE.format(d);
  return `Прочитано ${when} в ${formatClock(d)}`;
}
