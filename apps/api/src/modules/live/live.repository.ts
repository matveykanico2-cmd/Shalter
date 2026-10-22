import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { liveMessages, liveParticipants, liveStreams } from "../db/schema.js";
import { toParticipant, toStream } from "./lib/live.mapper.js";
import type { LiveMessageRow, LiveParticipant, LiveStream, ParticipantPatch } from "./model/domain.js";

// Прямые эфиры, их участники и чат — таблицы live_streams, live_participants, live_messages,
// как server/data/liveStreams.js (им же пользуется приём из OBS в server/rtmp.js).
@Injectable()
export class LiveRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public findStream(id: string): LiveStream | undefined {
    const row = this.db.select().from(liveStreams).where(eq(liveStreams.id, id)).get();
    return row && toStream(row);
  }

  /** Идущий эфир чата (последний начатый). */
  public findLiveForChat(chatId: string): LiveStream | undefined {
    const row = this.db
      .select()
      .from(liveStreams)
      .where(and(eq(liveStreams.chatId, chatId), eq(liveStreams.status, "live")))
      .orderBy(desc(liveStreams.startedAt))
      .limit(1)
      .get();
    return row && toStream(row);
  }

  /** Новый эфир; ведущий эфира из приложения сразу в участниках (из OBS — нет). */
  public createStream(s: { chatId: string; hostId: string; title: string; withVideo: boolean; source: string; streamKey: string | null }): LiveStream {
    const id = `live_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.db
      .insert(liveStreams)
      .values({
        id,
        chatId: s.chatId,
        hostId: s.hostId,
        title: s.title ?? "",
        withVideo: s.withVideo ? 1 : 0,
        status: "live",
        startedAt: new Date().toISOString(),
        source: s.source,
        streamKey: s.streamKey,
      })
      .run();
    if (s.source !== "rtmp") this.setParticipant(id, s.hostId, { role: "host" });
    return this.findStream(id)!;
  }

  public streamKey(id: string): string | null {
    return this.db.select({ streamKey: liveStreams.streamKey }).from(liveStreams).where(eq(liveStreams.id, id)).get()?.streamKey ?? null;
  }

  /** Завершённый эфир никто не смотрит — участники уходят вместе со сменой статуса. */
  public endStream(id: string): LiveStream {
    this.db.transaction((tx) => {
      tx.update(liveStreams).set({ status: "ended", endedAt: new Date().toISOString() }).where(eq(liveStreams.id, id)).run();
      tx.delete(liveParticipants).where(eq(liveParticipants.streamId, id)).run();
    });
    return this.findStream(id)!;
  }

  public listParticipants(streamId: string): LiveParticipant[] {
    return this.db.select().from(liveParticipants).where(eq(liveParticipants.streamId, streamId)).orderBy(asc(liveParticipants.joinedAt)).all().map(toParticipant);
  }

  public findParticipant(streamId: string, userId: string): LiveParticipant | undefined {
    const row = this.db
      .select()
      .from(liveParticipants)
      .where(and(eq(liveParticipants.streamId, streamId), eq(liveParticipants.userId, userId)))
      .get();
    return row && toParticipant(row);
  }

  /** Участник с правкой; чего нет в patch — как было (новому — зритель без руки и без запрета). */
  public setParticipant(streamId: string, userId: string, patch: ParticipantPatch = {}): LiveParticipant {
    const existing = this.findParticipant(streamId, userId);
    const next = {
      role: patch.role ?? existing?.role ?? "viewer",
      handRaised: (patch.handRaised ?? existing?.handRaised ?? false) ? 1 : 0,
      mutedByHost: (patch.mutedByHost ?? existing?.mutedByHost ?? false) ? 1 : 0,
    };
    this.db
      .insert(liveParticipants)
      .values({ streamId, userId, ...next, joinedAt: existing?.joinedAt ?? new Date().toISOString() })
      .onConflictDoUpdate({ target: [liveParticipants.streamId, liveParticipants.userId], set: next })
      .run();
    return this.findParticipant(streamId, userId)!;
  }

  public removeParticipant(streamId: string, userId: string): void {
    this.db.delete(liveParticipants).where(and(eq(liveParticipants.streamId, streamId), eq(liveParticipants.userId, userId))).run();
  }

  public addMessage(streamId: string, userId: string, text: string): LiveMessageRow {
    const message = {
      id: `lm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      streamId,
      userId,
      text,
      createdAt: new Date().toISOString(),
    };
    this.db.insert(liveMessages).values(message).run();
    return { ...message, editedAt: null };
  }

  public findMessage(id: string): LiveMessageRow | undefined {
    return this.db.select().from(liveMessages).where(eq(liveMessages.id, id)).get();
  }

  public editMessage(id: string, text: string): LiveMessageRow {
    this.db.update(liveMessages).set({ text, editedAt: new Date().toISOString() }).where(eq(liveMessages.id, id)).run();
    return this.findMessage(id)!;
  }

  public deleteMessage(id: string): void {
    this.db.delete(liveMessages).where(eq(liveMessages.id, id)).run();
  }

  /** Последние limit сообщений чата эфира, по возрастанию времени. */
  public listMessages(streamId: string, limit = 100): LiveMessageRow[] {
    return this.db.select().from(liveMessages).where(eq(liveMessages.streamId, streamId)).orderBy(desc(liveMessages.createdAt)).limit(limit).all().reverse();
  }
}
