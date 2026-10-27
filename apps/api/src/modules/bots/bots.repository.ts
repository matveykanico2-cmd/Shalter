import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { desc, eq, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { bots } from "../db/schema.js";
import { toBot } from "./lib/bot.mapper.js";
import type { Bot, BotCommand } from "./model/domain.js";

// Боты — то же, что server/data/bots.js, на той же таблице.
@Injectable()
export class BotsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  /** Боты владельца, новые первыми. */
  public listByOwner(ownerId: string): Bot[] {
    return this.db.select().from(bots).where(eq(bots.ownerId, ownerId)).orderBy(desc(bots.createdAt)).all().map(toBot);
  }

  public findById(id: string): Bot | undefined {
    const row = this.db.select().from(bots).where(eq(bots.id, id)).get();
    return row && toBot(row);
  }

  public findByUserId(userId: string): Bot | undefined {
    const row = this.db.select().from(bots).where(eq(bots.userId, userId)).get();
    return row && toBot(row);
  }

  public findByToken(token: string): Bot | undefined {
    const row = this.db.select().from(bots).where(eq(bots.token, token)).get();
    return row && toBot(row);
  }

  public token(id: string): string | null {
    return this.db.select({ token: bots.token }).from(bots).where(eq(bots.id, id)).get()?.token ?? null;
  }

  /** Сколько разных людей в чатах с ботом. */
  public audienceCount(botUserId: string): number {
    const row = this.db.get<{ n: number } | undefined>(sql`
      SELECT COUNT(DISTINCT m.userId) AS n
        FROM chat_members m
       WHERE m.userId <> ${botUserId}
         AND m.chatId IN (SELECT chatId FROM chat_members WHERE userId = ${botUserId})`);
    return row?.n ?? 0;
  }

  /** Все, кто запустил бота: личные чаты, где есть кто-то кроме него. */
  public dmChatIds(botUserId: string): string[] {
    return this.db
      .all<{ id: string }>(sql`
        SELECT c.id FROM chats c
          JOIN chat_members m ON m.chatId = c.id AND m.userId = ${botUserId}
         WHERE c.type = 'dm'
           AND EXISTS (SELECT 1 FROM chat_members o WHERE o.chatId = c.id AND o.userId <> ${botUserId})`)
      .map((r) => r.id);
  }

  /** Бот с id = id его пользователя и новым токеном. */
  public create(fields: { userId: string; ownerId: string; description: string }): { bot: Bot; token: string } {
    const token = this.generateToken();
    this.db
      .insert(bots)
      .values({ id: fields.userId, userId: fields.userId, ownerId: fields.ownerId, token, description: fields.description, commands: "[]", createdAt: new Date().toISOString() })
      .run();
    return { bot: this.findById(fields.userId)!, token };
  }

  public regenerateToken(id: string): string {
    const token = this.generateToken();
    this.db.update(bots).set({ token }).where(eq(bots.id, id)).run();
    return token;
  }

  public delete(id: string): void {
    this.db.delete(bots).where(eq(bots.id, id)).run();
  }

  public setDescription(id: string, description: string): Bot | undefined {
    this.db.update(bots).set({ description }).where(eq(bots.id, id)).run();
    return this.findById(id);
  }

  public setCommands(id: string, commands: BotCommand[]): Bot | undefined {
    this.db.update(bots).set({ commands: JSON.stringify(commands) }).where(eq(bots.id, id)).run();
    return this.findById(id);
  }

  /** Приложение по внешнему адресу; своя страница сбрасывается. */
  public setApp(id: string, appUrl: string | null, appName: string): Bot | undefined {
    this.db.update(bots).set({ appUrl: appUrl || null, appCode: null, appName: appName || null }).where(eq(bots.id, id)).run();
    return this.findById(id);
  }

  /** Своя страница приложения; внешний адрес сбрасывается. */
  public setAppCode(id: string, appCode: string | null, appName: string): Bot | undefined {
    this.db.update(bots).set({ appCode: appCode || null, appUrl: null, appName: appName || null }).where(eq(bots.id, id)).run();
    return this.findById(id);
  }

  private generateToken(): string {
    return randomBytes(24).toString("hex");
  }
}
