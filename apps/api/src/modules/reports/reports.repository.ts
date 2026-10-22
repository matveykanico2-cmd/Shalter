import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { reports } from "../db/schema.js";
import type { NewReport, Report } from "./model/domain.js";

// Жалобы — то же, что server/data/reports.js (списки для админки остаются там).
@Injectable()
export class ReportsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public findById(id: string): Report | undefined {
    return this.db.select().from(reports).where(eq(reports.id, id)).get();
  }

  public create(report: NewReport): NewReport {
    this.db.insert(reports).values(report).run();
    return report;
  }

  public setStatus(id: string, status: string): void {
    this.db.update(reports).set({ status }).where(eq(reports.id, id)).run();
  }
}
