import { useEffect, useRef, useSyncExternalStore } from "react";

// Подстраница раздела (правило приватности, правка папки): её заголовок и «Назад» — в шапке настроек.
type Subpage = { title: string; back: () => void };
let subpage: Subpage | null = null;
const subpageListeners = new Set<() => void>();
const setSubpage = (next: Subpage | null) => {
  subpage = next;
  subpageListeners.forEach((fn) => fn());
};
const subscribeSubpage = (fn: () => void) => {
  subpageListeners.add(fn);
  return () => void subpageListeners.delete(fn);
};

/**
 * Раздел открыл подстраницу: пока title не null, шапка настроек показывает его,
 * а «Назад» зовёт onBack вместо выхода в меню.
 */
export function useSettingsSubpage(title: string | null, onBack: () => void) {
  const backRef = useRef(onBack);
  useEffect(() => {
    backRef.current = onBack;
  });
  useEffect(() => {
    if (title == null) return;
    const entry = { title, back: () => backRef.current() };
    setSubpage(entry);
    return () => {
      if (subpage === entry) setSubpage(null);
    };
  }, [title]);
}

/** Для шапки настроек: открытая подстраница или null. */
export const useSettingsSubpageState = () => useSyncExternalStore(subscribeSubpage, () => subpage);
