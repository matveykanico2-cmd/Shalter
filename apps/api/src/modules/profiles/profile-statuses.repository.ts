import { Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { profileStatuses } from "../db/schema.js";

export type ProfileStatusRow = typeof profileStatuses.$inferSelect;

// Каталог статусов (server/data/profileStatuses.js): его правит админка (modules/admin).
@Injectable()
export class ProfileStatusesRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public findById(id: string): ProfileStatusRow | undefined {
    return this.db.select().from(profileStatuses).where(eq(profileStatuses.id, id)).get();
  }

  public list(): ProfileStatusRow[] {
    return this.db.select().from(profileStatuses).orderBy(asc(profileStatuses.createdAt)).all();
  }

  public create(row: ProfileStatusRow): ProfileStatusRow {
    this.db.insert(profileStatuses).values(row).run();
    return row;
  }

  public delete(id: string): void {
    this.db.delete(profileStatuses).where(eq(profileStatuses.id, id)).run();
  }
}
