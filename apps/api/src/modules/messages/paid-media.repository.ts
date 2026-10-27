import { Injectable } from "@nestjs/common";
import { and, count, eq } from "drizzle-orm";
import type { Attachment } from "../../legacy/legacy.js";
import { InjectDb, type Db } from "../db/db.module.js";
import { paidMedia, paidMediaBuyers } from "../db/schema.js";
import type { PaidMediaRecord } from "./model/domain.js";

// Платные посты и их покупатели — то же, что server/data/paidMedia.js, на тех же таблицах.
@Injectable()
export class PaidMediaRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  /** Пост с тем же сообщением перезаписывается целиком. */
  public save(messageId: string, chatId: string, stars: number, attachments: Attachment[] | undefined): void {
    const row = { messageId, chatId, stars, attachments: JSON.stringify(attachments ?? []), createdAt: new Date().toISOString() };
    this.db.insert(paidMedia).values(row).onConflictDoUpdate({ target: paidMedia.messageId, set: row }).run();
  }

  /** Битый список вложений — пустой. */
  public find(messageId: string): PaidMediaRecord | null {
    const row = this.db.select().from(paidMedia).where(eq(paidMedia.messageId, messageId)).get();
    if (!row) return null;
    let attachments: Attachment[];
    try {
      attachments = JSON.parse(row.attachments || "[]");
    } catch {
      attachments = [];
    }
    return { ...row, attachments };
  }

  public hasBought(messageId: string, userId: string): boolean {
    return !!this.db
      .select({ one: paidMediaBuyers.messageId })
      .from(paidMediaBuyers)
      .where(and(eq(paidMediaBuyers.messageId, messageId), eq(paidMediaBuyers.userId, userId)))
      .get();
  }

  public recordPurchase(messageId: string, userId: string): void {
    this.db.insert(paidMediaBuyers).values({ messageId, userId, createdAt: new Date().toISOString() }).onConflictDoNothing().run();
  }

  public buyersCount(messageId: string): number {
    return this.db.select({ c: count() }).from(paidMediaBuyers).where(eq(paidMediaBuyers.messageId, messageId)).get()?.c ?? 0;
  }
}
