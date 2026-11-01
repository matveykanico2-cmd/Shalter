import { Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { messages, starReactions, starReactionRequests, users } from "../db/schema.js";
import type { StarReactionEntry } from "./model/domain.js";

/** Платные реакции «звезда» на сообщениях — 별도의 таблицы, чтобы суммы были точными. */
@Injectable()
export class StarReactionsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  /** Сколько звёзд пользователь потратил на реакцию этого сообщения (0 — не ставил). */
  public amount(messageId: string, userId: string): number {
    const row = this.db
      .select({ amount: starReactions.amount })
      .from(starReactions)
      .where(and(eq(starReactions.messageId, messageId), eq(starReactions.userId, userId)))
      .get();
    return row?.amount ?? 0;
  }

  /** Все звёздные реакции сообщения: { userId, amount } от сортировке по убыванию amount. */
  public byMessage(messageId: string): StarReactionEntry[] {
    return this.db
      .select({ userId: starReactions.userId, amount: starReactions.amount })
      .from(starReactions)
      .where(eq(starReactions.messageId, messageId))
      .orderBy(desc(starReactions.amount))
      .all();
  }

  /** Уже обрабатывался ли запрос с таким requestId (идемпотентность). */
  public isProcessed(requestId: string): boolean {
    return !!this.db.select({ id: starReactionRequests.requestId }).from(starReactionRequests).where(eq(starReactionRequests.requestId, requestId)).get();
  }

  /** Пометить запрос обработанным. */
  public markProcessed(requestId: string, messageId: string, userId: string, amount: number): void {
    this.db
      .insert(starReactionRequests)
      .values({ requestId, messageId, userId, amount, createdAt: new Date().toISOString() })
      .run();
  }

  /** Списать 1 звезду, записать реакцию, зачислить автору — в одной транзакции. */
  public react(messageId: string, userId: string, authorId: string): { balance: number; total: number } {
    return this.db.transaction((tx) => {
      const userRow = tx.select({ stars: users.stars }).from(users).where(eq(users.id, userId)).get();
      if (!userRow || userRow.stars < 1) throw new Error("not enough stars");

      const meAmount = tx.select({ amount: starReactions.amount }).from(starReactions).where(and(eq(starReactions.messageId, messageId), eq(starReactions.userId, userId))).get()?.amount ?? 0;
      const maxPerUser = 100;
      if (meAmount >= maxPerUser) throw new Error("max stars per message");

      tx.update(users).set({ stars: sql`${users.stars} - 1` }).where(eq(users.id, userId)).run();
      tx.update(users).set({ stars: sql`${users.stars} + 1` }).where(eq(users.id, authorId)).run();

      const existing = tx.select({ amount: starReactions.amount }).from(starReactions).where(and(eq(starReactions.messageId, messageId), eq(starReactions.userId, userId))).get();
      if (existing) {
        tx.update(starReactions).set({ amount: sql`${starReactions.amount} + 1` }).where(and(eq(starReactions.messageId, messageId), eq(starReactions.userId, userId))).run();
      } else {
        tx.insert(starReactions).values({ messageId, userId, amount: 1, createdAt: new Date().toISOString() }).run();
      }

      const newBalance = tx.select({ stars: users.stars }).from(users).where(eq(users.id, userId)).get()!.stars;
      const total = meAmount + 1;
      return { balance: newBalance, total };
    });
  }

  /** Убедиться, что сообщение существует и пользователь в чате (проверка прав — в сервисе). */
  public findMessage(messageId: string) {
    return this.db.select({ id: messages.id, chatId: messages.chatId, senderId: messages.senderId }).from(messages).where(eq(messages.id, messageId)).get();
  }
}
