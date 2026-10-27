import { Injectable } from "@nestjs/common";
import { desc } from "drizzle-orm";
import { genId } from "../../common/lib/gen-id.js";
import { InjectDb, type Db } from "../db/db.module.js";
import { dataExports } from "../db/schema.js";

export type DataExportRow = typeof dataExports.$inferSelect;

// Журнал действий юридического отдела и модерации: выгрузки данных, удаления аккаунтов,
// сбросы паролей — таблица data_exports, как logExport и listExports в server/data/dataExport.js.
@Injectable()
export class DataExportsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public log(entry: { adminId: string; targetUserId: string; reason: string; messageCount: number }): DataExportRow {
    const row = { id: genId("exp"), ...entry, createdAt: new Date().toISOString() };
    this.db.insert(dataExports).values(row).run();
    return row;
  }

  /** Последние 200 записей, новые сверху. */
  public list(): DataExportRow[] {
    return this.db.select().from(dataExports).orderBy(desc(dataExports.createdAt)).limit(200).all();
  }
}
