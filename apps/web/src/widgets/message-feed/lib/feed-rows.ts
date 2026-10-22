// Строки ленты — как renderList в public/js/views/chatView.js: плашка дня перед первым
// сообщением дня, «Непрочитанные сообщения» перед первым непрочитанным, серии сообщений
// одного автора (одного типа, в пределах 5 минут) склеиваются.
import type { FeedMessage } from "@/entities/message";

const GROUP_WINDOW_MS = 5 * 60 * 1000;

export type FeedRow =
  | { kind: "day"; key: string; label: string }
  | { kind: "unread"; key: string }
  | { kind: "message"; key: string; message: FeedMessage; groupStart: boolean; groupEnd: boolean };

export function sameDay(a: string | Date, b: string | Date) {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** «Сегодня», «Вчера», «12 октября», в прошлые годы — с годом. */
export function dayLabel(iso: string, now = new Date()) {
  if (sameDay(iso, now)) return "Сегодня";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(iso, yesterday)) return "Вчера";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

const runsWith = (a: FeedMessage | undefined, b: FeedMessage | undefined) =>
  !!a &&
  !!b &&
  a.senderId === b.senderId &&
  !a.anonymous === !b.anonymous &&
  a.type === b.type &&
  sameDay(a.createdAt, b.createdAt) &&
  Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt)) < GROUP_WINDOW_MS;

export function feedRows(messages: readonly FeedMessage[], firstUnreadId: string | null, now = new Date()): FeedRow[] {
  const rows: FeedRow[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    if (!prev || !sameDay(prev.createdAt, m.createdAt)) rows.push({ kind: "day", key: `day:${m.id}`, label: dayLabel(m.createdAt, now) });
    if (m.id === firstUnreadId) rows.push({ kind: "unread", key: `unread:${m.id}` });
    rows.push({ kind: "message", key: m.id, message: m, groupStart: !runsWith(prev, m), groupEnd: !runsWith(m, next) });
  });
  return rows;
}
