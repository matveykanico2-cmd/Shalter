import { Injectable } from "@nestjs/common";
import { eq, isNotNull, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { backgroundJobs } from "../db/schema.js";
import type { ClaimedJob } from "./model/domain.js";

// Очередь фоновой работы (background_jobs) — то же, что server/data/backgroundJobs.js.
// Разбирает её один исполнитель — фоновый процесс, поэтому «взятая» задача просто
// помечается lockedAt, а при его запуске все отметки снимаются.
@Injectable()
export class BackgroundJobsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  /** Следующая задача, которой пора, — помечается взятой, attempts + 1. */
  public claim(now = Date.now()): ClaimedJob | undefined {
    const row = this.db.get<{ id: number; kind: string; payload: string; attempts: number }>(sql`
      UPDATE background_jobs SET lockedAt = ${now}, attempts = attempts + 1
      WHERE id = (SELECT id FROM background_jobs WHERE lockedAt IS NULL AND runAt <= ${now} ORDER BY runAt, id LIMIT 1)
      RETURNING id, kind, payload, attempts`);
    return row ? { ...row, payload: JSON.parse(row.payload) as Record<string, unknown> } : undefined;
  }

  public finish(id: number): void {
    this.db.delete(backgroundJobs).where(eq(backgroundJobs.id, id)).run();
  }

  public retry(id: number, delayMs: number): void {
    this.db.update(backgroundJobs).set({ lockedAt: null, runAt: Date.now() + delayMs }).where(eq(backgroundJobs.id, id)).run();
  }

  public releaseAll(): void {
    this.db.update(backgroundJobs).set({ lockedAt: null }).where(isNotNull(backgroundJobs.lockedAt)).run();
  }
}
