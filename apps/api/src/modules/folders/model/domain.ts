import type { folders } from "../../db/schema.js";
import type { toFolder } from "../lib/folder.mapper.js";

export type FolderRow = typeof folders.$inferSelect;

/** Папка чатов, как её отдаёт server/data/folders.js (rowToFolder). */
export type Folder = ReturnType<typeof toFolder>;

export interface NewFolder {
  id: string;
  ownerId: string;
  name: string;
  order: number;
  chatIds: string[];
}

export type FolderPatch = Partial<Pick<NewFolder, "name" | "order" | "chatIds">>;
