import type { bots } from "../../db/schema.js";
import type { toBot } from "../lib/bot.mapper.js";

export type BotRow = typeof bots.$inferSelect;

/** Бот, как его отдаёт server/data/bots.js (rowToBot). */
export type Bot = ReturnType<typeof toBot>;

/** Команда из меню бота. */
export interface BotCommand {
  command: string;
  description: string;
}
