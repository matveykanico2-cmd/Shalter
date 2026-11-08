import { Injectable } from "@nestjs/common";
import { asc, desc, eq } from "drizzle-orm";
import { genId } from "../../common/lib/gen-id.js";
import { InjectDb, type Db } from "../db/db.module.js";
import { exchangeCoins, exchangeCreators, exchangeRates, users } from "../db/schema.js";

@Injectable()
export class ExchangeRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public listCoins() {
    return this.db.select().from(exchangeCoins).orderBy(asc(exchangeCoins.symbol)).all();
  }

  public coin(id: string) {
    return this.db.select().from(exchangeCoins).where(eq(exchangeCoins.id, id)).get();
  }

  public history(coinId: string) {
    return this.db.select({ rate: exchangeRates.rate, at: exchangeRates.createdAt }).from(exchangeRates).where(eq(exchangeRates.coinId, coinId)).orderBy(desc(exchangeRates.createdAt)).limit(120).all().reverse();
  }

  public create(input: { symbol: string; name: string; description: string; color: string; rate: number; userId: string }) {
    const now = new Date().toISOString();
    const id = genId("coin");
    return this.db.transaction((tx) => {
      tx.insert(exchangeCoins).values({ id, symbol: input.symbol, name: input.name, description: input.description, color: input.color, currentRate: input.rate, createdBy: input.userId, createdAt: now, updatedAt: now }).run();
      tx.insert(exchangeRates).values({ id: genId("rate"), coinId: id, rate: input.rate, changedBy: input.userId, createdAt: now }).run();
      return tx.select().from(exchangeCoins).where(eq(exchangeCoins.id, id)).get()!;
    });
  }

  public setRate(coinId: string, rate: number, userId: string) {
    const now = new Date().toISOString();
    this.db.transaction((tx) => {
      tx.update(exchangeCoins).set({ currentRate: rate, updatedAt: now }).where(eq(exchangeCoins.id, coinId)).run();
      tx.insert(exchangeRates).values({ id: genId("rate"), coinId, rate, changedBy: userId, createdAt: now }).run();
    });
    return this.coin(coinId);
  }

  public isCreator(userId: string): boolean {
    return !!this.db.select({ userId: exchangeCreators.userId }).from(exchangeCreators).where(eq(exchangeCreators.userId, userId)).get();
  }

  public setCreator(userId: string, enabled: boolean, grantedBy: string): void {
    if (!enabled) return void this.db.delete(exchangeCreators).where(eq(exchangeCreators.userId, userId)).run();
    this.db.insert(exchangeCreators).values({ userId, grantedBy, createdAt: new Date().toISOString() }).onConflictDoUpdate({ target: exchangeCreators.userId, set: { grantedBy } }).run();
  }

  public creators() {
    return this.db.select({ userId: exchangeCreators.userId, name: users.name, username: users.username, createdAt: exchangeCreators.createdAt }).from(exchangeCreators).innerJoin(users, eq(users.id, exchangeCreators.userId)).orderBy(desc(exchangeCreators.createdAt)).all();
  }
}
