import { Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { sessions } from "../db/schema.js";
import type { Session } from "./model/domain.js";
import { genId } from "../../common/lib/gen-id.js";
import { emitAccessRevoked } from "../../legacy/legacy.js";

// Сеансы (устройства) — то же, что server/data/sessions.js, на той же таблице. Каждое
// завершение сообщает об отзыве доступа: сокеты этого пользователя сверяются сразу.
@Injectable()
export class SessionsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public list(userId: string): Session[] {
    return this.db.select().from(sessions).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt))).orderBy(desc(sessions.lastActive)).all();
  }

  public get(userId: string, deviceId: string | undefined): Session | undefined {
    if (deviceId === undefined) return undefined;
    return this.db.select().from(sessions).where(and(eq(sessions.userId, userId), eq(sessions.deviceId, deviceId))).get();
  }

  public getById(userId: string, id: string): Session | undefined {
    return this.db.select().from(sessions).where(and(eq(sessions.userId, userId), eq(sessions.id, id))).get();
  }

  public upsert({ userId, deviceId, device, location }: { userId: string; deviceId: string; device: string | null; location: string | null }): { session: Session; isNewDevice: boolean } {
    const lastActive = new Date().toISOString();
    const existing = this.get(userId, deviceId);
    this.db
      .insert(sessions)
      .values({ id: existing?.id ?? genId("sess"), userId, deviceId, device, location, lastActive, revokedAt: null })
      .onConflictDoUpdate({ target: [sessions.userId, sessions.deviceId], set: { device, location, lastActive, revokedAt: null } })
      .run();
    return { session: this.get(userId, deviceId)!, isNewDevice: !existing };
  }

  // Синхронно и на каждый запрос: по нему решается, чей это cookie.
  public isActive(userId: string | null | undefined, deviceId: string | null | undefined): boolean {
    if (!userId || !deviceId) return false;
    const row = this.db
      .select({ one: sql`1` })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.deviceId, deviceId), isNull(sessions.revokedAt)))
      .get();
    return !!row;
  }

  // Пустой адрес не затирает прежний.
  public touch(userId: string, deviceId: string, location: string): void {
    this.db
      .update(sessions)
      .set({ lastActive: new Date().toISOString(), location: sql`COALESCE(NULLIF(${location}, ''), ${sessions.location})` })
      .where(and(eq(sessions.userId, userId), eq(sessions.deviceId, deviceId), isNull(sessions.revokedAt)))
      .run();
  }

  public revoke(userId: string, deviceId: string): void {
    this.db.update(sessions).set({ revokedAt: new Date().toISOString() }).where(and(eq(sessions.userId, userId), eq(sessions.deviceId, deviceId))).run();
    emitAccessRevoked(userId);
  }

  public revokeById(userId: string, id: string): boolean {
    const { changes } = this.db.update(sessions).set({ revokedAt: new Date().toISOString() }).where(and(eq(sessions.userId, userId), eq(sessions.id, id))).run();
    if (changes > 0) emitAccessRevoked(userId);
    return changes > 0;
  }

  // Без своего device_id (null) не завершается ни один: «<> NULL» в SQL ложно, как в server/.
  public revokeOthers(userId: string, exceptDeviceId: string | null): void {
    this.db.update(sessions).set({ revokedAt: new Date().toISOString() }).where(and(eq(sessions.userId, userId), sql`${sessions.deviceId} <> ${exceptDeviceId}`)).run();
    emitAccessRevoked(userId);
  }

  public revokeAll(userId: string): void {
    this.db.update(sessions).set({ revokedAt: new Date().toISOString() }).where(eq(sessions.userId, userId)).run();
    emitAccessRevoked(userId);
  }
}
