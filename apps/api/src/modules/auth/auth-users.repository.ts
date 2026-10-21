import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { users } from "../db/schema.js";
import type { BanState } from "./model/domain.js";

// То, что нужно входу от пользователей, пока модуль users не перенесён.
@Injectable()
export class AuthUsersRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  // Действующая блокировка или null. Блокировка на срок снимается сама: после
  // bannedUntil аккаунт снова обычный (как banActive в server/data/users.js).
  public activeBan(userId: string): BanState | null {
    const row = this.db
      .select({ isBanned: users.isBanned, banReason: users.banReason, bannedAt: users.bannedAt, bannedUntil: users.bannedUntil })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    if (!row?.isBanned) return null;
    if (row.bannedUntil && row.bannedUntil <= new Date().toISOString()) return null;
    return { banReason: row.banReason ?? null, bannedAt: row.bannedAt ?? null, bannedUntil: row.bannedUntil ?? null };
  }
}
