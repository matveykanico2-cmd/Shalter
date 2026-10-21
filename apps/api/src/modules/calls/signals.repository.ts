import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gt, max, notInArray } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { signals } from "../db/schema.js";
import type { Signal, SignalInput } from "./model/domain.js";

// Хранится только последние 500 сигналов: они нужны лишь опросу после переподключения.
const KEEP_SIGNALS = 500;

// Сигналы WebRTC звонков — то же, что server/data/signals.js: seq сквозной по таблице,
// опрос забирает адресованные ему сигналы после последнего виденного seq.
@Injectable()
export class SignalsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public add(input: SignalInput): Signal {
    const seq = (this.db.select({ maxSeq: max(signals.seq) }).from(signals).get()?.maxSeq ?? 0) + 1;
    const signal: Signal = { ...input, id: `sig_${Date.now()}_${seq}`, seq, createdAt: new Date().toISOString() };
    this.db
      .insert(signals)
      .values({
        id: signal.id,
        seq,
        callId: signal.callId,
        fromUserId: signal.fromUserId,
        toUserId: signal.toUserId,
        kind: signal.kind,
        data: JSON.stringify(signal.data ?? null),
        createdAt: signal.createdAt,
      })
      .run();
    const recent = this.db.select({ id: signals.id }).from(signals).orderBy(desc(signals.seq)).limit(KEEP_SIGNALS);
    this.db.delete(signals).where(notInArray(signals.id, recent)).run();
    return signal;
  }

  public listFor(callId: string, toUserId: string, after: number): Signal[] {
    return this.db
      .select()
      .from(signals)
      .where(and(eq(signals.callId, callId), eq(signals.toUserId, toUserId), gt(signals.seq, after)))
      .orderBy(asc(signals.seq))
      .all()
      .map((r) => ({ ...r, data: parseData(r.data) }));
  }
}

function parseData(data: string | null): unknown {
  try {
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}
