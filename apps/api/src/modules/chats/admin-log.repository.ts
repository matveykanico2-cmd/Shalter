import { Injectable } from "@nestjs/common";
import { and, desc, eq, lt } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { chatAdminLog } from "../db/schema.js";
import type { AdminLogRow } from "./model/domain.js";

// Журнал действий администраторов группы или канала (server/data/adminLog.js).
@Injectable()
export class AdminLogRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public insert(entry: Omit<AdminLogRow, "id">): void {
    this.db.insert(chatAdminLog).values(entry).run();
  }

  public deleteOlderThan(chatId: string, iso: string): void {
    this.db.delete(chatAdminLog).where(and(eq(chatAdminLog.chatId, chatId), lt(chatAdminLog.createdAt, iso))).run();
  }

  /** Новые сначала; beforeId — страница старше этой записи. */
  public list(chatId: string, limit: number, beforeId: number | null): AdminLogRow[] {
    const where = beforeId ? and(eq(chatAdminLog.chatId, chatId), lt(chatAdminLog.id, beforeId)) : eq(chatAdminLog.chatId, chatId);
    return this.db.select().from(chatAdminLog).where(where).orderBy(desc(chatAdminLog.id)).limit(limit).all();
  }
}
