import { Injectable } from "@nestjs/common";
import { and, eq, gte, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { users } from "../db/schema.js";

// Страховка от ошибок в маршрутах: отрицательная или дробная сумма превратила бы списание в начисление.
const isAmount = (n: number) => Number.isSafeInteger(n) && n > 0;

// Звёзды на балансе (users.stars) и цена входящих сообщений — то же, что server/data/stars.js.
@Injectable()
export class StarsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public balanceOf(userId: string): number {
    return this.db.select({ stars: users.stars }).from(users).where(eq(users.id, userId)).get()?.stars ?? 0;
  }

  /** Начисление (или списание при amount < 0) без проверки баланса; новый баланс. */
  public add(userId: string, amount: number): number {
    if (!Number.isSafeInteger(amount)) throw new Error("bad stars amount");
    return this.db.transaction((tx) => {
      tx.update(users).set({ stars: sql`${users.stars} + ${amount}` }).where(eq(users.id, userId)).run();
      return tx.select({ stars: users.stars }).from(users).where(eq(users.id, userId)).get()?.stars ?? 0;
    });
  }

  /** false — не хватает звёзд, ничего не списано. */
  public spend(userId: string, amount: number): boolean {
    if (!isAmount(amount)) return false;
    return (
      this.db
        .update(users)
        .set({ stars: sql`${users.stars} - ${amount}` })
        .where(and(eq(users.id, userId), gte(users.stars, amount)))
        .run().changes > 0
    );
  }

  /** false — не хватает звёзд (или сумма/получатель некорректны), ничего не списано. */
  public transfer(fromId: string, toId: string, amount: number): boolean {
    if (!isAmount(amount) || fromId === toId) return false;
    return this.db.transaction((tx) => {
      const taken = tx
        .update(users)
        .set({ stars: sql`${users.stars} - ${amount}` })
        .where(and(eq(users.id, fromId), gte(users.stars, amount)))
        .run().changes;
      if (!taken) return false;
      tx.update(users).set({ stars: sql`${users.stars} + ${amount}` }).where(eq(users.id, toId)).run();
      return true;
    });
  }

  public setMessagePrice(userId: string, stars: number): void {
    this.db.update(users).set({ messagePriceStars: stars }).where(eq(users.id, userId)).run();
  }
}
