import { useSyncExternalStore } from "react";

type Point = { x: number; y: number };

// Главное меню одно на приложение: его открывают аватар в панели навигации
// и кнопка «Меню» в шапке списка чатов, а рисует MainMenuHost в оболочке.
let openAt: Point | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openMainMenu(at: Point) {
  openAt = at;
  emit();
}

export function closeMainMenu() {
  openAt = null;
  emit();
}

export const useMainMenuAt = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => openAt
  );
