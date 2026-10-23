// Короткая подсказка внизу экрана: «Текст скопирован», ошибка действия. Вместо alert()
// и profile-copy-toast старого клиента — не прерывает работу. Рисует её <Toaster />.
const SHOW_MS = 1600;
const ERROR_MS = 4000;

export type Toast = { id: number; text: string; error: boolean };

let current: Toast | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function toast(text: string, { error = false } = {}) {
  clearTimeout(timer);
  current = { id: ++seq, text, error };
  emit();
  timer = setTimeout(
    () => {
      current = null;
      emit();
    },
    error ? ERROR_MS : SHOW_MS
  );
}

export const toastStore = {
  get: () => current,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
};
