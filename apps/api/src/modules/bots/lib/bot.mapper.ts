import type { BotRow } from "../model/domain.js";

// Строка таблицы bots → бот, как rowToBot в server/data/bots.js.
export function toBot(row: BotRow) {
  let commands: unknown;
  try {
    commands = JSON.parse(row.commands);
  } catch {
    commands = [];
  }
  return {
    id: row.id,
    userId: row.userId,
    ownerId: row.ownerId ?? undefined,
    description: row.description ?? "",
    commands,
    createdAt: row.createdAt ?? undefined,
    code: row.code ?? undefined,
    appUrl: row.appUrl ?? null,
    appName: row.appName || null,
    appCode: row.appCode ?? null,
  };
}
