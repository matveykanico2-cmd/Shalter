import { Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { folders } from "../db/schema.js";
import { toFolder } from "./lib/folder.mapper.js";
import type { Folder, FolderPatch, NewFolder } from "./model/domain.js";

// Папки чатов — то же, что server/data/folders.js, на той же таблице (её же читает /api/bootstrap).
@Injectable()
export class FoldersRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public findById(id: string): Folder | undefined {
    const row = this.db.select().from(folders).where(eq(folders.id, id)).get();
    return row && toFolder(row);
  }

  public findByInviteCode(code: string): Folder | undefined {
    const c = String(code ?? "").trim();
    if (!c) return undefined;
    const row = this.db.select().from(folders).where(eq(folders.inviteCode, c)).get();
    return row && toFolder(row);
  }

  public findForOwner(ownerId: string): Folder[] {
    return this.db.select().from(folders).where(eq(folders.ownerId, ownerId)).orderBy(asc(folders.sortOrder)).all().map(toFolder);
  }

  public create(folder: NewFolder): Folder {
    this.db
      .insert(folders)
      .values({ id: folder.id, ownerId: folder.ownerId, name: folder.name, sortOrder: folder.order, chatIds: JSON.stringify(folder.chatIds) })
      .run();
    return this.findById(folder.id)!;
  }

  public update(id: string, patch: FolderPatch): Folder | undefined {
    const set: Partial<typeof folders.$inferInsert> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.order !== undefined) set.sortOrder = patch.order;
    if (patch.chatIds !== undefined) set.chatIds = JSON.stringify(patch.chatIds);
    if (Object.keys(set).length) this.db.update(folders).set(set).where(eq(folders.id, id)).run();
    return this.findById(id);
  }

  public setInviteCode(id: string, code: string | null): Folder | undefined {
    this.db.update(folders).set({ inviteCode: code }).where(eq(folders.id, id)).run();
    return this.findById(id);
  }

  public delete(id: string): void {
    this.db.delete(folders).where(eq(folders.id, id)).run();
  }
}
