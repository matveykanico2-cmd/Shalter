// Вопрос человеку — как askConfirm/askText в public/js/components/confirmDialog.js: промис,
// который ответит окно <AskHost />. Одно окно за раз; новое закрывает прежнее с «нет».
export type Ask =
  | { id: number; kind: "confirm"; text: string; detail: string | null; okLabel: string; cancelLabel: string; danger: boolean; resolve: (ok: boolean) => void }
  | { id: number; kind: "text"; text: string; okLabel: string; initial: string; resolve: (value: string | null) => void };

let current: Ask | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function open(ask: Ask) {
  if (current?.kind === "confirm") current.resolve(false);
  else if (current) current.resolve(null);
  current = ask;
  emit();
}

// Как tw-confirm в старом клиенте: опасное действие — красной кнопкой.
const DANGER_RE = /^(удалить|заблокировать|завершить|отписаться|убрать|выйти|сбросить|отключить|остановить|отменить|скрыть|обменять|выключить|перегенерировать|обновить токен)/i;

/**
 * Да или нет. Первая часть вопроса (до пустой строки) — заголовок, остальное — пояснение;
 * кнопка называется глаголом из вопроса («Удалить чат?» → «Удалить»), иначе «OK».
 */
export function askConfirm(message: string, { okLabel, cancelLabel = "Отмена", danger }: { okLabel?: string; cancelLabel?: string; danger?: boolean } = {}) {
  const [head = "", ...rest] = message.split(/\n\s*\n/);
  const verb = /^([А-ЯЁA-Z][а-яёa-z]+(?:ть|ться))(?=[\s?,.!]|$)/.exec(head)?.[1];
  return new Promise<boolean>((resolve) =>
    open({
      id: ++seq,
      kind: "confirm",
      text: head,
      detail: rest.length ? rest.join("\n\n") : null,
      okLabel: okLabel ?? verb ?? "OK",
      cancelLabel,
      danger: danger ?? DANGER_RE.test(head),
      resolve,
    })
  );
}

/** Текст или null — передумали. */
export function askText(text: string, { okLabel = "Готово", initial = "" } = {}) {
  return new Promise<string | null>((resolve) => open({ id: ++seq, kind: "text", text, okLabel, initial, resolve }));
}

export const askStore = {
  get: () => current,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  /** Ответ из окна. */
  answer(id: number, value: boolean | string | null) {
    if (!current || current.id !== id) return;
    const ask = current;
    current = null;
    emit();
    if (ask.kind === "confirm") ask.resolve(value === true);
    else ask.resolve(typeof value === "string" ? value : null);
  },
};
