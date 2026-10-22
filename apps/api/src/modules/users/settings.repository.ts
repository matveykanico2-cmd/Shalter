import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { settings } from "../db/schema.js";

// Настройки пользователя — строка JSON в таблице settings, как в server/data/settings.js.
@Injectable()
export class SettingsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public findData(userId: string): string | undefined {
    return this.db.select({ data: settings.data }).from(settings).where(eq(settings.userId, userId)).get()?.data;
  }

  public save(userId: string, data: string): void {
    this.db.insert(settings).values({ userId, data }).onConflictDoUpdate({ target: settings.userId, set: { data } }).run();
  }
}
