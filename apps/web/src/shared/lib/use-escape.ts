import { useEffect, useRef } from "react";

const overlayOpen = () => !!document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]');

/**
 * Esc закрывает панель (подстраницу правки, информацию о чате), а не весь чат: ловим
 * раньше горячих клавиш и помечаем событие обработанным. Окно или меню поверх — их черёд.
 */
export function useEscape(onEscape: () => void, enabled = true) {
  const handler = useRef(onEscape);
  useEffect(() => {
    handler.current = onEscape;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || overlayOpen()) return;
      e.preventDefault();
      handler.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [enabled]);
}
