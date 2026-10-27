// Форматирование выделенного в поле ввода — wrapSelection, quoteSelection и сочетания
// клавиш из public/js/components/composer.js (разметку рисует formatText).

export type Edit = { text: string; start: number; end: number };

/** Обернуть выделение разметкой, а уже обёрнутое — развернуть. */
export function wrapSelection(value: string, a: number, b: number, mark: string): Edit {
  const inner = value.slice(a, b);
  const block = mark === "```";
  const open = block ? "```\n" : mark;
  const close = block ? "\n```" : mark;
  if (inner.startsWith(open) && inner.endsWith(close) && inner.length >= open.length + close.length) {
    const unwrapped = inner.slice(open.length, inner.length - close.length);
    return { text: value.slice(0, a) + unwrapped + value.slice(b), start: a, end: a + unwrapped.length };
  }
  const text = value.slice(0, a) + open + inner + close + value.slice(b);
  // Без выделения курсор встаёт между метками, иначе — после.
  const at = a === b ? a + open.length : a + open.length + inner.length + close.length;
  return { text, start: at, end: at };
}

/** Выделенные строки — цитатой «> », уже процитированные — обратно. */
export function quoteSelection(value: string, a: number, b: number): Edit {
  const lines = value.slice(a, b).split("\n");
  const quoted = (lines.every((l) => l.startsWith("> ")) ? lines.map((l) => l.slice(2)) : lines.map((l) => `> ${l}`)).join("\n");
  return { text: value.slice(0, a) + quoted + value.slice(b), start: a, end: a + quoted.length };
}

/** [выделенное](адрес); без https:// — допишем. */
export function linkSelection(value: string, a: number, b: number, address: string): Edit | null {
  const label = value
    .slice(a, b)
    .replace(/[[\]\n]/g, " ")
    .trim();
  let url = address.trim();
  if (!label || !url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const link = `[${label}](${url.replace(/[\s)]/g, "")})`;
  return { text: value.slice(0, a) + link + value.slice(b), start: a + link.length, end: a + link.length };
}

/** Сочетания как в Telegram Desktop: Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+X/M/P/K. */
export function formatShortcut(e: { code: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): string | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const marks: Record<string, string> = e.shiftKey ? { KeyX: "~~", KeyM: "`", KeyP: "||", KeyK: "```" } : { KeyB: "**", KeyI: "*", KeyU: "__" };
  return marks[e.code] ?? null;
}
