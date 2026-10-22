import { Injectable } from "@nestjs/common";
import { and, eq, lte } from "drizzle-orm";
import { textCrypto } from "../../legacy/legacy.js";
import { InjectDb, type Db } from "../db/db.module.js";
import { reminders } from "../db/schema.js";

export interface DueReminder {
  id: string;
  userId: string;
  chatId: string;
  text: string;
}

const aad = (id: string) => `remind:${id}`;

// Напоминания помощника (/remind) — чтение и отметка из server/data/reminders.js. Ставит их
// помощник в server/ (lib/helperBot/utility.js); текст зашифрован, как там.
@Injectable()
export class RemindersRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public listDue(nowIso: string): DueReminder[] {
    return this.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.sent, 0), lte(reminders.dueAt, nowIso)))
      .all()
      .map((r) => ({ id: r.id, userId: r.userId, chatId: r.chatId, text: textCrypto().decryptText(aad(r.id), r.text) }));
  }

  public markSent(id: string): void {
    this.db.update(reminders).set({ sent: 1 }).where(eq(reminders.id, id)).run();
  }
}
