import { Injectable } from "@nestjs/common";
import { and, desc, eq, lt } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { callParticipants, calls } from "../db/schema.js";
import type { Call, CallPatch, CallRow, NewCall } from "./model/domain.js";

// Звонок, который никто не завершил (закрыли вкладку, упала сеть), через 6 часов — пропущенный.
const STALE_CALL_MS = 6 * 60 * 60 * 1000;

// Звонки — то же, что server/data/calls.js: участники в call_participants, ссылка-приглашение
// в joinToken.
@Injectable()
export class CallsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  /** Звонки, где пользователь участник, новые первыми. */
  public listFor(userId: string): Call[] {
    this.closeStale();
    return this.db
      .select({ call: calls })
      .from(calls)
      .innerJoin(callParticipants, eq(callParticipants.callId, calls.id))
      .where(eq(callParticipants.userId, userId))
      .orderBy(desc(calls.startedAt))
      .all()
      .map((r) => this.toCall(r.call)!);
  }

  public findById(id: string): Call | undefined {
    return this.toCall(this.db.select().from(calls).where(eq(calls.id, id)).get());
  }

  public findByJoinToken(token: string): Call | undefined {
    return this.toCall(this.db.select().from(calls).where(eq(calls.joinToken, token)).get());
  }

  /** Идущий голосовой чат группы. */
  public findActiveRoom(chatId: string): Call | undefined {
    return this.toCall(
      this.db
        .select()
        .from(calls)
        .where(and(eq(calls.chatId, chatId), eq(calls.kind, "voice-room"), eq(calls.status, "ongoing")))
        .orderBy(desc(calls.startedAt))
        .limit(1)
        .get()
    );
  }

  public create(call: NewCall): Call {
    this.db
      .insert(calls)
      .values({
        id: call.id,
        chatId: call.chatId,
        kind: call.kind,
        direction: call.direction ?? null,
        callerId: call.callerId,
        status: call.status,
        startedAt: call.startedAt,
        durationSec: call.durationSec ?? 0,
      })
      .run();
    for (const userId of call.participantIds) this.db.insert(callParticipants).values({ callId: call.id, userId }).run();
    return this.findById(call.id)!;
  }

  public update(id: string, patch: CallPatch): Call | undefined {
    if (!this.db.select({ id: calls.id }).from(calls).where(eq(calls.id, id)).get()) return undefined;
    if (Object.keys(patch).length) this.db.update(calls).set(patch).where(eq(calls.id, id)).run();
    return this.findById(id);
  }

  public addParticipant(id: string, userId: string): Call | undefined {
    this.db.insert(callParticipants).values({ callId: id, userId }).onConflictDoNothing().run();
    return this.findById(id);
  }

  public removeParticipant(id: string, userId: string): Call | undefined {
    this.db.delete(callParticipants).where(and(eq(callParticipants.callId, id), eq(callParticipants.userId, userId))).run();
    return this.findById(id);
  }

  public setJoinToken(id: string, token: string): void {
    this.db.update(calls).set({ joinToken: token }).where(eq(calls.id, id)).run();
  }

  private closeStale(): void {
    const cutoff = new Date(Date.now() - STALE_CALL_MS).toISOString();
    this.db
      .update(calls)
      .set({ status: "missed" })
      .where(and(eq(calls.status, "ongoing"), lt(calls.startedAt, cutoff)))
      .run();
  }

  private toCall(row: CallRow | undefined): Call | undefined {
    if (!row) return undefined;
    const participantIds = this.db
      .select({ userId: callParticipants.userId })
      .from(callParticipants)
      .where(eq(callParticipants.callId, row.id))
      .all()
      .map((r) => r.userId);
    return {
      id: row.id,
      chatId: row.chatId,
      kind: row.kind,
      direction: row.direction ?? undefined,
      callerId: row.callerId,
      status: row.status,
      startedAt: row.startedAt,
      durationSec: row.durationSec,
      participantIds,
      joinToken: row.joinToken ?? undefined,
    };
  }
}
