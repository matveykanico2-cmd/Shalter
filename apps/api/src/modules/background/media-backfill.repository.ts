import { Injectable } from "@nestjs/common";
import { inArray, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { mediaBackfill } from "../db/schema.js";

export interface BackfillCandidate {
  rowid: number;
  id: string;
  attachments: string;
}

// Старые сообщения с файлами — для обхода media-backfill: от новых к старым, по rowid.
@Injectable()
export class MediaBackfillRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  /** Сообщения с загрузками старше createdBefore и с rowid меньше before (null — с самого нового). */
  public candidates(before: number | null, createdBefore: string, limit: number): BackfillCandidate[] {
    return this.db.all<BackfillCandidate>(sql`
      SELECT rowid AS rowid, id, attachments FROM messages
      WHERE ${before === null ? sql`1 = 1` : sql`rowid < ${before}`}
        AND createdAt < ${createdBefore}
        AND attachments IS NOT NULL AND instr(attachments, '/uploads/') > 0
      ORDER BY rowid DESC LIMIT ${limit}`);
  }

  public queuedOf(ids: string[]): Set<string> {
    if (!ids.length) return new Set();
    return new Set(this.db.select({ id: mediaBackfill.messageId }).from(mediaBackfill).where(inArray(mediaBackfill.messageId, ids)).all().map((r) => r.id));
  }

  public markQueued(id: string, at: string): void {
    this.db.insert(mediaBackfill).values({ messageId: id, queuedAt: at }).onConflictDoNothing().run();
  }
}
