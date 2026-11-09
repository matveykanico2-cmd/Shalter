import { useEffect, useRef } from "react";

type Props = {
  /** Строит узел (анимацию, сцену) — вызывается заново, когда меняется key. */
  create: () => Node | null;
  className?: string;
  label?: string;
  /** Тяжёлый узел строится только рядом с viewport и ставится на паузу вне его. */
  viewport?: boolean;
};

/**
 * Узел, построенный вне React (движок анимаций shared/lib/anim), внутри React-дерева.
 * Пересоздаётся только по смене key у родителя: иначе каждая перерисовка ленты
 * перезапускала бы анимации.
 */
export function DomNode({ create, className, label, viewport = false }: Props) {
  const host = useRef<HTMLSpanElement>(null);
  const build = useRef(create);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let built = false;
    const mount = () => {
      if (built) return;
      built = true;
      const node = build.current();
      if (node) el.replaceChildren(node);
    };
    if (!viewport || typeof IntersectionObserver !== "function") {
      mount();
      return () => el.replaceChildren();
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        el.toggleAttribute("data-in-viewport", visible);
        if (visible) mount();
      },
      { rootMargin: "160px 0px" },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      el.replaceChildren();
    };
  }, [viewport]);
  return <span ref={host} className={className} role={label ? "img" : undefined} aria-label={label} data-viewport-node={viewport ? "" : undefined} />;
}
