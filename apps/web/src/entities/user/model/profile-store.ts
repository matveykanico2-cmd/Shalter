import { useSyncExternalStore } from "react";

// Открытый профиль человека — как openProfileDialog(userId) в public/js/components/profileDialog.js:
// открыть можно откуда угодно (шапка, @упоминание, контакты, меню аккаунта), а панель
// одна на всё приложение — её рисует widgets/user-profile.
let current: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function openUserProfile(userId: string) {
  current = userId;
  emit();
}

export function closeUserProfile() {
  if (current === null) return;
  current = null;
  emit();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** id человека, чей профиль сейчас открыт, или null. */
export const useOpenedProfile = () => useSyncExternalStore(subscribe, () => current);

