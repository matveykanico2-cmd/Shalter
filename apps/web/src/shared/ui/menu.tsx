import { type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon, type IconName } from "./icon";
import styles from "./menu.module.css";

export type MenuItem = {
  label: string;
  icon?: IconName;
  danger?: boolean;
  /** Без onClick — строка-подпись (например, «Прочитано в 12:30»). */
  onClick?: () => void;
};

type Props = {
  /** Точка, где открыли меню (клик, правая кнопка, долгое нажатие). */
  at: { x: number; y: number };
  items?: readonly MenuItem[];
  /** Над пунктами — например, полоса реакций. */
  header?: ReactNode;
  label?: string;
  /** Панель шире обычного меню (эмодзи, стикеры, все реакции) — ширину задаёт она. */
  wide?: boolean;
  onClose: () => void;
};

const EDGE = 8;
const SHEET_QUERY = "(max-width: 560px)";

/**
 * Выпадающее меню у точки нажатия — как openDropdownMenu в public/js/components/dropdownMenu.js;
 * на узком экране — шторкой снизу.
 */
export function Menu({ at, items = [], header, label = "Меню", wide = false, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [sheet] = useState(() => typeof window.matchMedia === "function" && window.matchMedia(SHEET_QUERY).matches);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Меню не выходит за край окна: у правого и нижнего края открывается влево и вверх.
  // Содержимое выросло (раскрыли полный список реакций) — меняем место заново.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || sheet) return;
    const place = () => {
      const { width, height } = el.getBoundingClientRect();
      const left = Math.max(EDGE, Math.min(at.x, window.innerWidth - width - EDGE));
      const top = at.y + height + EDGE > window.innerHeight ? Math.max(EDGE, at.y - height) : at.y;
      setPos((p) => (p?.left === left && p.top === top ? p : { left, top }));
    };
    place();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(place);
    observer.observe(el);
    return () => observer.disconnect();
  }, [at.x, at.y, sheet]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Нажатие, открывшее меню, ещё летит — ловим только следующие.
    const t = setTimeout(() => document.addEventListener("pointerdown", onPointerDown), 0);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  // Стрелки ходят по пунктам.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const list = [...(ref.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    const i = list.indexOf(document.activeElement as HTMLElement);
    list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
  };

  const style = sheet ? undefined : pos ? { left: pos.left, top: pos.top } : { left: at.x, top: at.y, visibility: "hidden" as const };

  return createPortal(
    <>
      {sheet ? <div className={styles.backdrop} /> : null}
      <div ref={ref} className={[styles.menu, sheet ? styles.sheet : "", wide ? styles.wide : ""].filter(Boolean).join(" ")} style={style} role="menu" aria-label={label} onKeyDown={onKeyDown}>
        {header}
        {items.length ? (
        <div className={styles.list}>
          {items.map((item) =>
            item.onClick ? (
              <button
                key={item.label}
                type="button"
                className={item.danger ? `${styles.item} ${styles.danger}` : styles.item}
                onClick={() => {
                  onClose();
                  item.onClick?.();
                }}
              >
                {item.icon ? <Icon name={item.icon} size={18} /> : null}
                <span>{item.label}</span>
              </button>
            ) : (
              <p key={item.label} className={styles.caption}>
                {item.icon ? <Icon name={item.icon} size={18} /> : null}
                <span>{item.label}</span>
              </p>
            )
          )}
        </div>
        ) : null}
      </div>
    </>,
    document.body
  );
}
