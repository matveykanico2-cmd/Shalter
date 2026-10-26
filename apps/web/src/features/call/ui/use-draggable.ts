import { type PointerEvent, useState } from "react";

type Pos = { x: number; y: number };

function readPos(key: string): Pos | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null") as Pos | null;
    return raw && Number.isFinite(raw.x) && Number.isFinite(raw.y) ? raw : null;
  } catch {
    return null;
  }
}

// Не дальше 8 px от краёв родителя.
function clamp(node: HTMLElement, x: number, y: number): Pos {
  const parent = node.offsetParent as HTMLElement | null;
  const pw = parent?.clientWidth ?? window.innerWidth;
  const ph = parent?.clientHeight ?? window.innerHeight;
  return {
    x: Math.min(Math.max(8, x), Math.max(8, pw - node.offsetWidth - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, ph - node.offsetHeight - 8)),
  };
}

/**
 * Перетаскивание своего превью и полосы участников — как makeDraggable в callScreen.js:
 * место запоминается на устройстве; после перетаскивания нажатие не считается кликом.
 */
// Когда закончили тянуть (по ключу): клик сразу после перетаскивания — не клик.
const draggedAt = new Map<string, number>();

export function useDraggable(key: string) {
  const [pos, setPos] = useState<Pos | null>(() => readPos(key));

  // Сохранённое место могло оказаться за краем (окно меньше) — прижимаем, когда элемент появился.
  const attach = (node: HTMLElement | null) => {
    if (!node || !pos) return;
    const fit = clamp(node, pos.x, pos.y);
    if (fit.x !== pos.x || fit.y !== pos.y) setPos(fit);
  };

  /** Тянут за handle; двигается ближайший предок с data-draggable. */
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    const node = e.currentTarget.closest<HTMLElement>("[data-draggable]") ?? e.currentTarget;
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = node.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    let last: Pos | null = null;
    const move = (ev: globalThis.PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
      moved = true;
      const parent = (node.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? { left: 0, top: 0 };
      last = clamp(node, ev.clientX - parent.left - dx, ev.clientY - parent.top - dy);
      setPos(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!moved) return;
      draggedAt.set(key, Date.now());
      try {
        localStorage.setItem(key, JSON.stringify(last));
      } catch {
        // Место не запомнится — не страшно.
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const style = pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto", transform: "none" } : undefined;
  /** Только что перетащили — нажатие не обрабатываем. */
  const justDragged = () => Date.now() - (draggedAt.get(key) ?? 0) < 250;
  return { attach, style, onPointerDown, justDragged };
}
