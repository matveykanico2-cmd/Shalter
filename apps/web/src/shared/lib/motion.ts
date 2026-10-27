/**
 * Анимации выключены: системой (prefers-reduced-motion) или в настройках Shalter
 * («Отключить анимации» — use-appearance ставит data-reduce-motion на <html>).
 */
export function motionReduced() {
  if (typeof document !== "undefined" && document.documentElement.hasAttribute("data-reduce-motion")) return true;
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
