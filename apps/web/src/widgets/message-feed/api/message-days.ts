import type { daysResult } from "@shalter/shared/schemas/messages";
import type { z } from "zod";

import { http } from "@/shared/api";

const tzOffset = () => -new Date().getTimezoneOffset();

/** Дни месяца (YYYY-MM), в которые в чате писали, — по часовому поясу человека. */
export const messageDays = (chatId: string, month: string) =>
  http.get<z.infer<typeof daysResult>>(`/api/chats/${encodeURIComponent(chatId)}/messages/days?month=${month}&tz=${tzOffset()}`);

/** Первое сообщение дня (YYYY-MM-DD) или позже; null — после этого дня сообщений нет. */
export const messageAt = (chatId: string, day: string) =>
  http.get<{ message: { id: string } | null }>(`/api/chats/${encodeURIComponent(chatId)}/messages/at?day=${day}&tz=${tzOffset()}`);
