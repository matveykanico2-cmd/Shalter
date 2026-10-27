import type { FolderRow } from "../model/domain.js";

/** Строка таблицы folders → папка (rowToFolder в server/data/folders.js): битый chatIds — пустой список. */
export function toFolder(row: FolderRow) {
  let chatIds: string[];
  try {
    chatIds = JSON.parse(row.chatIds);
  } catch {
    chatIds = [];
  }
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    order: row.sortOrder,
    chatIds,
    inviteCode: row.inviteCode ?? undefined,
  };
}
