/** Сроки «Запретить писать» — как RESTRICT_DURATIONS в public/js/components/infoPanel.js. */
export const RESTRICT_DURATIONS = [
  { label: "На 1 час", hours: 1 },
  { label: "На 1 день", hours: 24 },
  { label: "На 1 неделю", hours: 24 * 7 },
  { label: "Навсегда", hours: null },
] as const;

export const restrictUntil = (hours: number | null, now = Date.now()) => (hours == null ? "forever" : new Date(now + hours * 3600_000).toISOString());
