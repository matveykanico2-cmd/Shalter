// Повторы отложенного сообщения — как REPEAT_OPTIONS в public/js/components/scheduleSendDialog.js.
import type { RepeatId } from "../api/send-message";

export const REPEAT_OPTIONS: readonly [RepeatId | "", string][] = [
  ["", "Не повторять"],
  ["day", "Каждый день"],
  ["week", "Каждую неделю"],
  ["2weeks", "Каждые 2 недели"],
  ["month", "Каждый месяц"],
  ["3months", "Каждые 3 месяца"],
  ["6months", "Каждые 6 месяцев"],
  ["year", "Каждый год"],
];

export const repeatLabel = (repeat: string | null) => REPEAT_OPTIONS.find(([id]) => id === repeat)?.[1] ?? "";
