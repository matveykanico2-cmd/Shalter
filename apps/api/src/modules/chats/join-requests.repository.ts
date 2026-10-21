import { Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { joinRequests } from "../db/schema.js";

// Заявки на вступление в чаты с одобрением (server/data/joinRequests.js). Подаёт и решает
// их пока server/lib/joinApproval.js — он же нужен боту-админу.
@Injectable()
export class JoinRequestsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public list(chatId: string) {
    return this.db.select().from(joinRequests).where(eq(joinRequests.chatId, chatId)).orderBy(asc(joinRequests.createdAt)).all();
  }

  public has(chatId: string, userId: string): boolean {
    return !!this.db
      .select({ userId: joinRequests.userId })
      .from(joinRequests)
      .where(and(eq(joinRequests.chatId, chatId), eq(joinRequests.userId, userId)))
      .get();
  }

  public remove(chatId: string, userId: string): void {
    this.db.delete(joinRequests).where(and(eq(joinRequests.chatId, chatId), eq(joinRequests.userId, userId))).run();
  }
}
