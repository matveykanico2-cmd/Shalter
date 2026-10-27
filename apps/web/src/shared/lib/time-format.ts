import { useSyncExternalStore } from "react";

// Формат времени из настроек (timeFormat: 12 | 24) — для всех подписей «ЧЧ:ММ» в приложении:
// время сообщений, «был(а) в …», «Прочитано в …», время в списке чатов. Значение кладёт
// app (useAppearance) из настроек; компоненты, которым надо перерисоваться при смене, берут
// useTimeFormat().

export type TimeFormat = 12 | 24;

const H24 = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
// Как formatTime в public/js/lib/presence.js: toLocaleTimeString("ru-RU", { hour12: true, … }).
const H12 = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: true });

let current: TimeFormat = 24;
const listeners = new Set<() => void>();

export function setTimeFormat(format: TimeFormat) {
  if (format === current) return;
  current = format;
  for (const l of listeners) l();
}

export const getTimeFormat = () => current;

/** «14:05» или «02:05 PM» — по настройке. */
export const formatClock = (date: Date) => (current === 12 ? H12 : H24).format(date);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Текущий формат; компонент перерисуется, когда его сменят в настройках. */
export const useTimeFormat = () => useSyncExternalStore(subscribe, getTimeFormat, getTimeFormat);
