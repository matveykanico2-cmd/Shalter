import { useEffect, useRef } from "react";

import { countPostView } from "../api/post-views";

// Один просмотр поста за сессию вкладки, как countedViews в chatView.js.
const counted = new Set<string>();

/** Невидимая метка под постом: увидели его на 60 % — просмотр уходит на сервер. */
export function PostView({ postId }: { postId: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || counted.has(postId) || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || counted.has(postId)) return;
        counted.add(postId);
        observer.disconnect();
        countPostView(postId).catch(() => {});
      },
      { threshold: 0.6 }
    );
    // Метка нулевой высоты — смотрим на сам ряд с пузырём.
    observer.observe(el.previousElementSibling ?? el);
    return () => observer.disconnect();
  }, [postId]);
  return <span ref={ref} hidden />;
}
