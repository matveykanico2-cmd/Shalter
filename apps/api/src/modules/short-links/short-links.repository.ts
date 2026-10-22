import { Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { shortLinks } from "../db/schema.js";

// Короткие ссылки — как server/data/shortLinks.js. Создаёт их бот-помощник в server/.
@Injectable()
export class ShortLinksRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public find(code: string): typeof shortLinks.$inferSelect | undefined {
    return this.db.select().from(shortLinks).where(eq(shortLinks.code, code)).get();
  }

  public registerClick(code: string): void {
    this.db.update(shortLinks).set({ clicks: sql`${shortLinks.clicks} + 1` }).where(eq(shortLinks.code, code)).run();
  }

  /** Всего ссылок и созданных за последние 30 дней. */
  public count(): { total: number; thisMonth: number } {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const row = this.db
      .select({ total: sql<number>`COUNT(*)`, thisMonth: sql<number | null>`SUM(CASE WHEN ${shortLinks.createdAt} >= ${since} THEN 1 ELSE 0 END)` })
      .from(shortLinks)
      .get()!;
    return { total: Number(row.total) || 0, thisMonth: Number(row.thisMonth) || 0 };
  }
}
