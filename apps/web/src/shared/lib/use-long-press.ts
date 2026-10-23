// Долгое нажатие пальцем — как в public/js/components/messageBubble.js: 450 мс без сдвига
// больше 10 px. На iPhone contextmenu не приходит вовсе, а Android после долгого нажатия
// шлёт ещё contextmenu и click — их гасим, чтобы не открыть меню дважды или ссылку.
import { type MouseEvent, type PointerEvent, useEffect, useRef } from "react";

const HOLD_MS = 450;
const SLOP_PX = 10;
const SWALLOW_MS = 1000;

export function useLongPress(onHold: (at: { x: number; y: number }) => void, ignore?: string) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const start = useRef({ x: 0, y: 0 });
  const heldAt = useRef(0);
  const cancel = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };
  useEffect(() => cancel, []);

  const swallow = (e: MouseEvent) => {
    if (Date.now() - heldAt.current < SWALLOW_MS) {
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
    return false;
  };

  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === "mouse" || (ignore && (e.target as Element).closest?.(ignore))) return;
      start.current = { x: e.clientX, y: e.clientY };
      cancel();
      timer.current = setTimeout(() => {
        timer.current = undefined;
        heldAt.current = Date.now();
        navigator.vibrate?.(12);
        onHold(start.current);
      }, HOLD_MS);
    },
    onPointerMove: (e: PointerEvent) => {
      if (timer.current && (Math.abs(e.clientX - start.current.x) > SLOP_PX || Math.abs(e.clientY - start.current.y) > SLOP_PX)) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    /** true — это хвост долгого нажатия, событие погашено. */
    swallow,
  };
}
