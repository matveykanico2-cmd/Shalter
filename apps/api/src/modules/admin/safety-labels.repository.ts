import { Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { safetyLabels } from "../db/schema.js";

export type SafetyLabelRow = typeof safetyLabels.$inferSelect;

// Метки безопасности в профиле («СКАМ», «Фейк»…) — таблица safety_labels, как server/data/safetyLabels.js.
@Injectable()
export class SafetyLabelsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public list(): SafetyLabelRow[] {
    return this.db.select().from(safetyLabels).orderBy(asc(safetyLabels.createdAt)).all();
  }

  public findById(id: string): SafetyLabelRow | undefined {
    return this.db.select().from(safetyLabels).where(eq(safetyLabels.id, id)).get();
  }

  public create(row: SafetyLabelRow): void {
    this.db.insert(safetyLabels).values(row).run();
  }

  public update(id: string, patch: Pick<SafetyLabelRow, "short" | "label" | "hint" | "color">): void {
    this.db.update(safetyLabels).set(patch).where(eq(safetyLabels.id, id)).run();
  }

  public delete(id: string): void {
    this.db.delete(safetyLabels).where(eq(safetyLabels.id, id)).run();
  }
}
