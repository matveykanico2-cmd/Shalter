import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { genId } from "../../common/lib/gen-id.js";
import { InjectDb, type Db } from "../db/db.module.js";
import { exchangeBalances, exchangeCoins, exchangeCreators, exchangeRates, exchangeTransactions, users } from "../db/schema.js";

const rounded = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;

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

  public wallet(userId: string) {
    return this.db
      .select({ amount: exchangeBalances.amount, coin: exchangeCoins })
      .from(exchangeBalances)
      .innerJoin(exchangeCoins, eq(exchangeCoins.id, exchangeBalances.coinId))
      .where(eq(exchangeBalances.userId, userId))
      .orderBy(asc(exchangeCoins.symbol))
      .all()
      .filter((row) => row.amount > 0)
      .map((row) => ({ amount: rounded(row.amount), coin: row.coin }));
  }

  public mint(coinId: string, userId: string, amount: number) {
    return this.db.transaction((tx) => {
      this.changeBalance(tx, userId, coinId, amount);
      const transaction = { id: genId("xt"), kind: "mint", coinId, targetCoinId: null, fromUserId: null, toUserId: userId, amount: rounded(amount), targetAmount: null, chatId: null, createdAt: new Date().toISOString() };
      tx.insert(exchangeTransactions).values(transaction).run();
      return transaction;
    });
  }

  public transfer(fromUserId: string, toUserId: string, coinId: string, amount: number, chatId: string) {
    return this.db.transaction((tx) => {
      const balance = tx.select({ amount: exchangeBalances.amount }).from(exchangeBalances).where(and(eq(exchangeBalances.userId, fromUserId), eq(exchangeBalances.coinId, coinId))).get()?.amount ?? 0;
      if (balance + 1e-9 < amount) return null;
      this.changeBalance(tx, fromUserId, coinId, -amount);
      this.changeBalance(tx, toUserId, coinId, amount);
      const transaction = { id: genId("xt"), kind: "transfer", coinId, targetCoinId: null, fromUserId, toUserId, amount: rounded(amount), targetAmount: null, chatId, createdAt: new Date().toISOString() };
      tx.insert(exchangeTransactions).values(transaction).run();
      return transaction;
    });
  }

  public convert(userId: string, fromCoinId: string, toCoinId: string, amount: number, targetAmount: number) {
    return this.db.transaction((tx) => {
      const balance = tx.select({ amount: exchangeBalances.amount }).from(exchangeBalances).where(and(eq(exchangeBalances.userId, userId), eq(exchangeBalances.coinId, fromCoinId))).get()?.amount ?? 0;
      if (balance + 1e-9 < amount) return null;
      this.changeBalance(tx, userId, fromCoinId, -amount);
      this.changeBalance(tx, userId, toCoinId, targetAmount);
      const transaction = { id: genId("xt"), kind: "convert", coinId: fromCoinId, targetCoinId: toCoinId, fromUserId: userId, toUserId: userId, amount: rounded(amount), targetAmount: rounded(targetAmount), chatId: null, createdAt: new Date().toISOString() };
      tx.insert(exchangeTransactions).values(transaction).run();
      return transaction;
    });
  }

  private changeBalance(tx: Pick<Db, "select" | "insert" | "update">, userId: string, coinId: string, delta: number): void {
    const current = tx.select({ amount: exchangeBalances.amount }).from(exchangeBalances).where(and(eq(exchangeBalances.userId, userId), eq(exchangeBalances.coinId, coinId))).get()?.amount ?? 0;
    const next = rounded(current + delta);
    const now = new Date().toISOString();
    tx.insert(exchangeBalances).values({ userId, coinId, amount: next, updatedAt: now }).onConflictDoUpdate({ target: [exchangeBalances.userId, exchangeBalances.coinId], set: { amount: next, updatedAt: now } }).run();
  }
}
