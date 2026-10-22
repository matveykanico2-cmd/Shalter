import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { profileStatuses } from "../db/schema.js";

// Каталог статусов (server/data/profileStatuses.js): здесь только чтение, правит его админка в server/.
@Injectable()
export class ProfileStatusesRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public findById(id: string): typeof profileStatuses.$inferSelect | undefined {
    return this.db.select().from(profileStatuses).where(eq(profileStatuses.id, id)).get();
  }
}
