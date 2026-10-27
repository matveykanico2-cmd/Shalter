import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { birthdayGreetingsSent, holidayNotificationsSent } from "../db/schema.js";

// Кому уже ушли поздравления с днём рождения и праздником в этом году — то, что
// server/lib/birthdaySweep.js и holidaySweep.js пишут в свои таблицы.
@Injectable()
export class GreetingsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public birthdaySent(ownerId: string, birthdayUserId: string, year: number): boolean {
    const t = birthdayGreetingsSent;
    return !!this.db
      .select({ year: t.year })
      .from(t)
      .where(and(eq(t.ownerId, ownerId), eq(t.birthdayUserId, birthdayUserId), eq(t.year, year)))
      .get();
  }

  public markBirthdaySent(ownerId: string, birthdayUserId: string, year: number): void {
    this.db.insert(birthdayGreetingsSent).values({ ownerId, birthdayUserId, year, sentAt: new Date().toISOString() }).onConflictDoNothing().run();
  }

  public holidaySent(userId: string, holidayId: string, year: number): boolean {
    const t = holidayNotificationsSent;
    return !!this.db
      .select({ year: t.year })
      .from(t)
      .where(and(eq(t.userId, userId), eq(t.holidayId, holidayId), eq(t.year, year)))
      .get();
  }

  public markHolidaySent(userId: string, holidayId: string, year: number): void {
    this.db.insert(holidayNotificationsSent).values({ userId, holidayId, year, sentAt: new Date().toISOString() }).onConflictDoNothing().run();
  }
}
