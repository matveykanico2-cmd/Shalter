import { useEffect, useRef } from "react";

type Props = {
  /** Строит узел (анимацию, сцену) — вызывается заново, когда меняется key. */
  create: () => Node | null;
  className?: string;
  label?: string;
};

/**
 * Узел, построенный вне React (движок анимаций shared/lib/anim), внутри React-дерева.
 * Пересоздаётся только по смене key у родителя: иначе каждая перерисовка ленты
 * перезапускала бы анимации.
 */
export function DomNode({ create, className, label }: Props) {
  const host = useRef<HTMLSpanElement>(null);
  const build = useRef(create);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const node = build.current();
    if (node) el.replaceChildren(node);
    return () => el.replaceChildren();
  }, []);
  return <span ref={host} className={className} role={label ? "img" : undefined} aria-label={label} />;
}
