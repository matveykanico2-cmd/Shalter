import { Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { passkeys } from "../db/schema.js";
import type { PasskeyPublicKey } from "../../legacy/legacy.js";
import type { Passkey, PasskeyRow } from "./model/domain.js";

function toPasskey(row: PasskeyRow): Passkey {
  return {
    id: row.id,
    userId: row.userId,
    publicKey: (() => {
      try {
        return JSON.parse(row.publicKey) as PasskeyPublicKey;
      } catch {
        return null;
      }
    })(),
    signCount: row.signCount,
    name: row.name ?? "Ключ доступа",
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt ?? undefined,
  };
}

// Ключи доступа (server/data/passkeys.js). Храним только открытый ключ — секрет
// остаётся на устройстве пользователя.
@Injectable()
export class PasskeysRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public get(id: string): Passkey | undefined {
    const row = this.db.select().from(passkeys).where(eq(passkeys.id, id)).get();
    return row && toPasskey(row);
  }

  public list(userId: string): Passkey[] {
    return this.db.select().from(passkeys).where(eq(passkeys.userId, userId)).orderBy(asc(passkeys.createdAt)).all().map(toPasskey);
  }

  // null — такой ключ уже есть.
  public add({ id, userId, publicKey, signCount, name }: { id: string; userId: string; publicKey: PasskeyPublicKey; signCount: number; name: string }): Passkey | null {
    if (this.get(id)) return null;
    this.db
      .insert(passkeys)
      .values({ id, userId, publicKey: JSON.stringify(publicKey), signCount: signCount ?? 0, name: name || null, createdAt: new Date().toISOString() })
      .run();
    return this.get(id)!;
  }

  public touch(id: string, signCount: number): void {
    this.db.update(passkeys).set({ signCount, lastUsedAt: new Date().toISOString() }).where(eq(passkeys.id, id)).run();
  }

  public delete(userId: string, id: string): boolean {
    return this.db.delete(passkeys).where(and(eq(passkeys.id, id), eq(passkeys.userId, userId))).run().changes > 0;
  }
}
