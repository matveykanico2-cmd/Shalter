// Подписи и признаки пузыря — как в public/js/components/messageBubble.js.
import { formatClock } from "@/shared/lib/time-format";

import type { Message } from "../model/types";

// Один форматтер на всё (shared/lib/time-format): 12 или 24 часа — по настройке.
export const timeLabel = (iso: string) => formatClock(new Date(iso));

// Цвет имени (Premium) — peer colors из Telegram, как public/js/lib/nameColors.js.
export const NAME_COLORS: Record<string, { light: string; dark: string }> = {
  red: { light: "#cc5049", dark: "#ff8e86" },
  orange: { light: "#d67722", dark: "#ffa357" },
  violet: { light: "#955cdb", dark: "#b18fff" },
  green: { light: "#40a920", dark: "#68d64f" },
  cyan: { light: "#309eba", dark: "#40d8d0" },
  blue: { light: "#368ad1", dark: "#52bfff" },
  pink: { light: "#c7508b", dark: "#ff7dbb" },
};

// Записи о звонках старше типа "call" — обычный текст; узнаём их по словам, но только
// до перехода, чтобы не поймать набранное руками.
const CALL_LOG_RE = /^📞 (Звонок|Видеозвонок|Пропущенный звонок|Звонок отклонён)/;
export function isCallLogMessage(m: Pick<Message, "type" | "createdAt" | "attachments" | "text">) {
  if (m.type === "call") return true;
  return m.type === "text" && m.createdAt < "2026-10-03" && !m.attachments?.length && CALL_LOG_RE.test(m.text ?? "");
}

/** Прочитано, если сообщение видел кто-то кроме отправителя. */
export const isReadByOthers = (m: Pick<Message, "readByIds" | "senderId">) => m.readByIds.some((id) => id !== m.senderId);
