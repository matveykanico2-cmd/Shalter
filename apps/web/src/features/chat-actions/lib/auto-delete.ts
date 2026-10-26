// Сроки автоудаления — как AUTO_DELETE_DURATIONS в public/js/components/infoPanel.js.
export const AUTO_DELETE_DURATIONS: readonly { label: string; seconds: number | null }[] = [
  { label: "Выключено", seconds: null },
  { label: "1 день", seconds: 24 * 3600 },
  { label: "1 неделя", seconds: 7 * 24 * 3600 },
  { label: "1 месяц", seconds: 30 * 24 * 3600 },
];

export const autoDeleteLabel = (seconds: number | null | undefined) => AUTO_DELETE_DURATIONS.find((d) => d.seconds === (seconds ?? null))?.label ?? "Выключено";
