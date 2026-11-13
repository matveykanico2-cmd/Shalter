/** Таймер разговора: 00:42, 12:05. */
export const formatElapsed = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

type StatusInput = { phase: "ringing" | "connecting" | "connected" | "ended"; elapsed: number; reconnecting?: boolean };

/** Строка под названием звонка: вызов → соединение → таймер разговора (или «восстанавливаем»). */
export function callStatusText({ phase, elapsed, reconnecting }: StatusInput) {
  if (phase === "ringing") return "Вызов…";
  if (phase === "connecting") return "Соединение…";
  if (phase === "ended") return "Звонок завершён";
  return reconnecting ? "Восстанавливаем связь…" : formatElapsed(elapsed);
}

/** Подпись качества связи: хорошая — ничего не пишем. */
export const qualityText = (q: "good" | "fair" | "poor" | null) => (q === "poor" ? "Плохая связь" : q === "fair" ? "Связь неустойчивая" : null);
