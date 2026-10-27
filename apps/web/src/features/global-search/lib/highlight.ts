// Найденное слово в тексте сообщения — highlightMatch из public/js/views/chatList.js:
// длинное начало сокращается до «…», чтобы совпадение было видно.

export type Highlighted = { head: string; hit: string; tail: string } | null;

export function highlightMatch(text: string, q: string): Highlighted {
  const needle = q.trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return null;
  const start = at > 24 ? at - 16 : 0;
  return { head: (start ? "…" : "") + text.slice(start, at), hit: text.slice(at, at + needle.length), tail: text.slice(at + needle.length) };
}

const TIME = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const FULL = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });

/** Время найденного сообщения: сегодня — часы, в этом году — день, иначе — дата. */
export function searchTimeLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  if (d.toDateString() === now.toDateString()) return TIME.format(d);
  return (d.getFullYear() === now.getFullYear() ? DAY : FULL).format(d);
}
