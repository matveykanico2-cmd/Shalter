// Сроки «Отключить уведомления» — как public/js/lib/muteDurations.js.
export const MUTE_DURATIONS: readonly { label: string; hours: number }[] = [
  { label: "На 1 час", hours: 1 },
  { label: "На 8 часов", hours: 8 },
  { label: "На 16 часов", hours: 16 },
  { label: "На 24 часа", hours: 24 },
  { label: "На неделю", hours: 24 * 7 },
  { label: "На месяц", hours: 24 * 30 },
];
