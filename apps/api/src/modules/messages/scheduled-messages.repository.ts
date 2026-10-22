import { Injectable } from "@nestjs/common";
import { and, asc, eq, lte } from "drizzle-orm";
import { textCrypto, type Attachment } from "../../legacy/legacy.js";
import { InjectDb, type Db } from "../db/db.module.js";
import { scheduledMessages } from "../db/schema.js";
import { isRepeat, WHEN_ONLINE } from "./lib/scheduled-repeat.js";
import type { ScheduledMessage } from "./model/domain.js";

type ScheduledRow = typeof scheduledMessages.$inferSelect;

export interface NewScheduled {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  attachments: Attachment[] | undefined;
  replyToId: string | null;
  topicId: string | null;
  repeat: unknown;
  sendAt: string;
  createdAt: string;
}

// Текст зашифрован тем же ключом, что и сообщения (server/lib/textCrypto.js).
const aad = (id: string): string => `sched:${id}`;

function toScheduled(row: ScheduledRow): ScheduledMessage {
  let attachments: Attachment[] | undefined;
  if (row.attachments) {
    try {
      attachments = JSON.parse(row.attachments);
    } catch {
      attachments = undefined;
    }
  }
  return {
    id: row.id,
    chatId: row.chatId,
    senderId: row.senderId,
    text: textCrypto().decryptText(aad(row.id), row.text),
    attachments,
    replyToId: row.replyToId ?? null,
    topicId: row.topicId ?? null,
    repeat: row.repeat ?? null,
    sendAt: row.sendAt,
    createdAt: row.createdAt,
  };
}

// Отложенные сообщения — то же, что server/data/scheduledMessages.js, на той же таблице.
@Injectable()
export class ScheduledMessagesRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public listFor(chatId: string, senderId: string): ScheduledMessage[] {
    return this.db
      .select()
      .from(scheduledMessages)
      .where(and(eq(scheduledMessages.chatId, chatId), eq(scheduledMessages.senderId, senderId)))
      .orderBy(asc(scheduledMessages.sendAt))
      .all()
      .map(toScheduled);
  }

  public find(id: string): ScheduledMessage | undefined {
    const row = this.db.select().from(scheduledMessages).where(eq(scheduledMessages.id, id)).get();
    return row ? toScheduled(row) : undefined;
  }

  /** Неизвестный повтор — без повтора. */
  public add(msg: NewScheduled): ScheduledMessage | undefined {
    this.db
      .insert(scheduledMessages)
      .values({
        id: msg.id,
        chatId: msg.chatId,
        senderId: msg.senderId,
        text: textCrypto().encryptText(aad(msg.id), msg.text ?? ""),
        attachments: msg.attachments ? JSON.stringify(msg.attachments) : null,
        replyToId: msg.replyToId ?? null,
        topicId: msg.topicId ?? null,
        repeat: isRepeat(msg.repeat) ? msg.repeat : null,
        sendAt: msg.sendAt,
        createdAt: msg.createdAt,
      })
      .run();
    return this.find(msg.id);
  }

  /** Не переданное поле остаётся; repeat: неизвестный — без повтора. */
  public edit(id: string, patch: { text?: string; sendAt?: string; repeat?: unknown }): ScheduledMessage | undefined {
    const existing = this.find(id);
    if (!existing) return undefined;
    const repeat = patch.repeat === undefined ? existing.repeat : isRepeat(patch.repeat) ? patch.repeat : null;
    this.db
      .update(scheduledMessages)
      .set({ text: textCrypto().encryptText(aad(id), patch.text ?? existing.text), sendAt: patch.sendAt ?? existing.sendAt, repeat })
      .where(eq(scheduledMessages.id, id))
      .run();
    return this.find(id);
  }

  public remove(id: string): void {
    this.db.delete(scheduledMessages).where(eq(scheduledMessages.id, id)).run();
  }

  public reschedule(id: string, sendAt: string): void {
    this.db.update(scheduledMessages).set({ sendAt }).where(eq(scheduledMessages.id, id)).run();
  }

  public listDue(nowIso: string): ScheduledMessage[] {
    return this.db.select().from(scheduledMessages).where(lte(scheduledMessages.sendAt, nowIso)).all().map(toScheduled);
  }

  public listWhenOnline(): ScheduledMessage[] {
    return this.db.select().from(scheduledMessages).where(eq(scheduledMessages.sendAt, WHEN_ONLINE)).all().map(toScheduled);
  }
}
