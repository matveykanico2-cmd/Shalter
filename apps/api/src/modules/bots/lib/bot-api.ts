import type { Bot } from "../model/domain.js";

// Мелочи Bot API из server/routes/botApi.js.

/** Строка из поля запроса; нет поля — пустая (вместо undefined в запросе к базе). */
export const str = (value: unknown): string => (value == null ? "" : String(value));

/**
 * Кому рассылать событие о сообщении: скрытый ответ (visibleToId) — только адресату и самому
 * боту, иначе всем участникам чата.
 */
export function audienceOf(chat: { memberIds: string[] }, message: { visibleToId?: string | null; senderId: string }): string[] {
  return message.visibleToId ? [...new Set([message.visibleToId, message.senderId])] : chat.memberIds;
}

/** Приложение бота: своя страница на /app/<ник> или внешний адрес; null — нет приложения. */
export function botApp(origin: string, bot: Bot, botUser: { username?: string | null } | undefined) {
  if (bot.appCode) return { url: `${origin}/app/${botUser?.username || ""}`, name: bot.appName, hosted: true };
  return bot.appUrl ? { url: bot.appUrl, name: bot.appName, hosted: false } : null;
}

/** Временный id в духе server/routes/botApi.js: m_<время>_<случайное>. */
export const timedId = (prefix: string): string => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
