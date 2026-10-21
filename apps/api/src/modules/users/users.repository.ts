import { randomInt } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { users } from "../db/schema.js";
import { banActive, FOREVER, toUser } from "./lib/user.mapper.js";
import type { BanState, NewUserRow, User, UserPatch } from "./model/domain.js";

const REFERRAL_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

// Пользователи — то же, что server/data/users.js, на той же таблице. Пока в Nest только то,
// что нужно перенесённым модулям.
@Injectable()
export class UsersRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public findById(id: string): User | undefined {
    const row = this.db.select().from(users).where(eq(users.id, id)).get();
    return row && toUser(row);
  }

  /** Несколько пользователей; порядок — как у таблицы, не как у ids. */
  public findByIds(ids: (string | null | undefined)[]): User[] {
    const unique = [...new Set(ids)].filter((id): id is string => !!id);
    if (!unique.length) return [];
    return this.db.select().from(users).where(inArray(users.id, unique)).all().map(toUser);
  }

  /** id и ник тех, чей ник (без учёта регистра) есть в списке — для упоминаний @ник. */
  public findIdsByUsernames(usernames: string[]): { id: string; username: string | null }[] {
    const list = [...new Set(usernames.map((u) => String(u ?? "").trim().toLowerCase()).filter(Boolean))];
    if (!list.length) return [];
    return this.db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(and(inArray(sql`lower(${users.username})`, list), ne(users.username, "")))
      .all();
  }

  public findByEmail(email: string): User | undefined {
    const row = this.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
      .get();
    return row && toUser(row);
  }

  public findByPhone(phone: string | null | undefined): User | undefined {
    const row = this.db
      .select()
      .from(users)
      .where(and(eq(users.phone, (phone ?? "").trim()), ne(users.phone, "")))
      .get();
    return row && toUser(row);
  }

  public findByReferralCode(code: string): User | undefined {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return undefined;
    const row = this.db.select().from(users).where(eq(users.referralCode, normalized)).get();
    return row && toUser(row);
  }

  // Действующая блокировка или null.
  public activeBan(userId: string): BanState | null {
    const row = this.db
      .select({ isBanned: users.isBanned, banReason: users.banReason, bannedAt: users.bannedAt, bannedUntil: users.bannedUntil })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    if (!row || !banActive(row)) return null;
    return { banReason: row.banReason ?? null, bannedAt: row.bannedAt ?? null, bannedUntil: row.bannedUntil ?? null };
  }

  public create(user: Omit<NewUserRow, "referralCode">): User {
    this.db
      .insert(users)
      .values({ ...user, referralCode: this.generateReferralCode() })
      .run();
    return this.findById(user.id)!;
  }

  public update(id: string, patch: UserPatch): User | undefined {
    if (Object.keys(patch).length > 0) this.db.update(users).set(patch).where(eq(users.id, id)).run();
    return this.findById(id);
  }

  /** «В сети» (сокет открыт) или «не в сети» с временем выхода — как updateUser({ online, lastSeen }) в server/. */
  public setPresence(id: string, online: boolean, lastSeen?: string): User | undefined {
    this.db
      .update(users)
      .set({ online: online ? 1 : 0, ...(lastSeen === undefined ? {} : { lastSeen }) })
      .where(eq(users.id, id))
      .run();
    return this.findById(id);
  }

  /** После перезапуска сокетов нет ни у кого: все, кто остался «в сети», выходят (кроме ботов). */
  public resetStalePresence(): number {
    return this.db
      .update(users)
      .set({ online: 0, lastSeen: new Date().toISOString() })
      .where(and(eq(users.online, 1), eq(users.isBot, 0)))
      .run().changes;
  }

  // Premium на days дней сверх действующего (или с сегодняшнего дня); бессрочный не трогается.
  public grantPremiumDays(userId: string, days: number): User | undefined {
    const user = this.findById(userId);
    if (!user) return undefined;
    if (user.premiumForever) return this.update(userId, { premiumUntil: FOREVER });
    const base = user.isPremium && user.premiumUntil ? new Date(user.premiumUntil) : new Date();
    base.setUTCDate(base.getUTCDate() + days);
    return this.update(userId, { premiumUntil: base.toISOString() });
  }

  public startTotpSetup(userId: string, secret: string): void {
    this.db
      .update(users)
      .set({ totpSecret: secret, totpEnabledAt: null, totpRecoveryCodes: null, twoFactorMethod: "totp" })
      .where(eq(users.id, userId))
      .run();
  }

  public startChatTwoFactor(userId: string): void {
    this.db
      .update(users)
      .set({ totpSecret: null, totpEnabledAt: null, totpRecoveryCodes: null, twoFactorMethod: "chat" })
      .where(eq(users.id, userId))
      .run();
  }

  public enableTotp(userId: string, recoveryCodeHashes: string[]): void {
    this.db
      .update(users)
      .set({ totpEnabledAt: new Date().toISOString(), totpRecoveryCodes: JSON.stringify(recoveryCodeHashes) })
      .where(eq(users.id, userId))
      .run();
  }

  public disableTotp(userId: string): void {
    this.db
      .update(users)
      .set({ totpSecret: null, totpEnabledAt: null, totpRecoveryCodes: null, twoFactorMethod: null })
      .where(eq(users.id, userId))
      .run();
  }

  // Код восстановления одноразовый: принятый вычёркивается из списка.
  public consumeRecoveryCode(userId: string, hash: string): boolean {
    const user = this.findById(userId);
    if (!user) return false;
    const codes = user.totpRecoveryCodes ?? [];
    const idx = codes.indexOf(hash);
    if (idx === -1) return false;
    const remaining = codes.filter((_, i) => i !== idx);
    this.db.update(users).set({ totpRecoveryCodes: JSON.stringify(remaining) }).where(eq(users.id, userId)).run();
    return true;
  }

  public scheduleDeletion(userId: string, iso: string): void {
    this.db.update(users).set({ scheduledDeletionAt: iso }).where(eq(users.id, userId)).run();
  }

  public cancelDeletion(userId: string): boolean {
    const { changes } = this.db
      .update(users)
      .set({ scheduledDeletionAt: null })
      .where(and(eq(users.id, userId), sql`${users.scheduledDeletionAt} IS NOT NULL`))
      .run();
    return changes > 0;
  }

  private generateReferralCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < 6; i++) code += REFERRAL_ALPHABET[randomInt(REFERRAL_ALPHABET.length)];
      const exists = this.db.select({ id: users.id }).from(users).where(eq(users.referralCode, code)).get();
      if (!exists) return code;
    }
  }
}

