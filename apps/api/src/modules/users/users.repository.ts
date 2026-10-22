import { randomInt } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { emitAccessRevoked } from "../../legacy/legacy.js";
import { InjectDb, type Db } from "../db/db.module.js";
import { users } from "../db/schema.js";
import { banActive, FOREVER, toUser, type GiftEntry } from "./lib/user.mapper.js";
import type { AvatarEntry, BanState, NewUserRow, ProfilePatch, ProfileTrack, StatusEntry, StatusState, User, UserPatch } from "./model/domain.js";

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

  /** Только id, имя и ник — для подписей чатов в поиске. */
  public findNamesByIds(ids: (string | null | undefined)[]): { id: string; name: string; username: string | null }[] {
    const unique = [...new Set(ids)].filter((id): id is string => !!id);
    if (!unique.length) return [];
    return this.db.select({ id: users.id, name: users.name, username: users.username }).from(users).where(inArray(users.id, unique)).all();
  }

  /**
   * Поиск по имени (lower_ru из server/db.js — регистр и кириллица) и нику без «@»; без
   * заблокированных. Берёт limit * 3: вызывающий ещё отсеивает и сортирует.
   */
  public search(query: string, limit: number): User[] {
    const q = String(query ?? "").trim().toLowerCase().replace(/^@/, "");
    if (!q) return [];
    const like = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;
    const now = new Date().toISOString();
    return this.db
      .select()
      .from(users)
      .where(
        sql`(lower_ru(${users.name}) LIKE ${like} ESCAPE '\\' OR LOWER(${users.username}) LIKE ${like} ESCAPE '\\')
          AND NOT (COALESCE(${users.isBanned}, 0) = 1 AND (${users.bannedUntil} IS NULL OR ${users.bannedUntil} > ${now}))`
      )
      .limit(limit * 3)
      .all()
      .map(toUser);
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

  /** По нику без учёта регистра; пустой ник — никого. */
  public findByUsername(username: string): User | undefined {
    const normalized = username.trim().toLowerCase();
    if (!normalized) return undefined;
    const row = this.db
      .select()
      .from(users)
      .where(and(sql`lower(${users.username}) = ${normalized}`, ne(users.username, "")))
      .get();
    return row && toUser(row);
  }

  public findByEmail(email: string): User | undefined {
    const row = this.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
      .get();
    return row && toUser(row);
  }

  /** Все пользователи (поиск по номерам из записной книжки). */
  public findAll(): User[] {
    return this.db.select().from(users).all().map(toUser);
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

  /** Только строка пользователя (deleteUser в server/data/users.js), без чистки его данных. */
  public delete(id: string): void {
    this.db.delete(users).where(eq(users.id, id)).run();
  }

  public update(id: string, patch: UserPatch): User | undefined {
    if (Object.keys(patch).length > 0) this.db.update(users).set(patch).where(eq(users.id, id)).run();
    return this.findById(id);
  }

  /**
   * Правка профиля — как updateUser в server/data/users.js: смена ника снимает привязку к
   * аукциону, null пишется как NULL, баннер — JSON.
   */
  public updateProfile(id: string, patch: ProfilePatch): User | undefined {
    if (!this.db.select({ id: users.id }).from(users).where(eq(users.id, id)).get()) return undefined;
    const { profileBanner, businessLat, businessLng, ...columns } = patch;
    const set: Partial<NewUserRow> = { ...columns };
    if ("username" in patch) set.usernameAuctionId = null;
    if ("businessLat" in patch) set.businessLat = (businessLat ?? null) as number | null;
    if ("businessLng" in patch) set.businessLng = (businessLng ?? null) as number | null;
    if ("profileBanner" in patch) set.profileBanner = profileBanner ? JSON.stringify(profileBanner) : null;
    if (Object.keys(set).length > 0) this.db.update(users).set(set).where(eq(users.id, id)).run();
    return this.findById(id);
  }

  /**
   * Новый ник (пустая строка — без ника). auctionId — ник выигран на этом аукционе; без него
   * привязка к аукциону снимается, как в updateUser в server/data/users.js.
   */
  public setUsername(id: string, username: string, auctionId: string | null = null): User | undefined {
    if (!this.db.select({ id: users.id }).from(users).where(eq(users.id, id)).get()) return undefined;
    this.db.update(users).set({ username, usernameAuctionId: auctionId }).where(eq(users.id, id)).run();
    return this.findById(id);
  }

  /** Весь список аватарок; главная (avatarImage) — превью первой. */
  public setAvatars(id: string, list: AvatarEntry[]): User | undefined {
    if (!this.db.select({ id: users.id }).from(users).where(eq(users.id, id)).get()) return undefined;
    this.db
      .update(users)
      .set({ avatarImages: JSON.stringify(list), avatarImage: list[0]?.poster ?? null })
      .where(eq(users.id, id))
      .run();
    return this.findById(id);
  }

  /** Свои статусы и активный (getStatusState в server/data/users.js); нет пользователя — undefined. */
  public statusState(id: string): StatusState | undefined {
    const row = this.db.select({ statusItems: users.statusItems, activeStatusId: users.activeStatusId }).from(users).where(eq(users.id, id)).get();
    if (!row) return undefined;
    let items: StatusEntry[];
    try {
      items = JSON.parse(row.statusItems ?? "[]");
    } catch {
      items = [];
    }
    return { items, activeStatusId: row.activeStatusId ?? null };
  }

  public setStatusState(id: string, items: StatusEntry[], activeStatusId: string | null): User | undefined {
    if (!this.db.select({ id: users.id }).from(users).where(eq(users.id, id)).get()) return undefined;
    this.db.update(users).set({ statusItems: JSON.stringify(items), activeStatusId }).where(eq(users.id, id)).run();
    return this.findById(id);
  }

  /**
   * Правка полки подарков (giftsReceived) в одной транзакции, как addReceivedGift, setGiftPinned и
   * removeReceivedGift в server/data/users.js: fn меняет список на месте и возвращает false, если
   * менять нечего. false — нет пользователя или fn отказалась.
   */
  public mutateGiftsReceived(userId: string, fn: (gifts: GiftEntry[]) => boolean): boolean {
    return this.db.transaction((tx) => {
      const row = tx.select({ giftsReceived: users.giftsReceived }).from(users).where(eq(users.id, userId)).get();
      if (!row) return false;
      let gifts: GiftEntry[];
      try {
        const parsed = JSON.parse(row.giftsReceived ?? "[]");
        gifts = Array.isArray(parsed) ? parsed : [];
      } catch {
        gifts = [];
      }
      if (!fn(gifts)) return false;
      tx.update(users).set({ giftsReceived: JSON.stringify(gifts) }).where(eq(users.id, userId)).run();
      return true;
    });
  }

  /** Весь список треков профиля; пустой — NULL (setProfileTracks в server/data/users.js). */
  public setProfileTracks(id: string, tracks: ProfileTrack[]): User | undefined {
    if (!this.db.select({ id: users.id }).from(users).where(eq(users.id, id)).get()) return undefined;
    this.db.update(users).set({ profileTrack: tracks.length ? JSON.stringify(tracks) : null }).where(eq(users.id, id)).run();
    return this.findById(id);
  }

  /** Добавляет targetId в список блокировок пользователя или убирает из него. */
  /** Блокировка аккаунта (setBanned в server/data/users.js): сессии и сокеты отзываются сразу. */
  public ban(id: string, reason: string | null, until: string | null = null): User | undefined {
    this.db
      .update(users)
      .set({ isBanned: 1, banReason: (reason ?? "").trim() || null, bannedAt: new Date().toISOString(), bannedUntil: until })
      .where(eq(users.id, id))
      .run();
    emitAccessRevoked(id);
    return this.findById(id);
  }

  /** Метка «мошенник», «фейк» и т. п. в профиле; пустая — снять. */
  public setSafetyLabel(id: string, label: string | null): User | undefined {
    this.db
      .update(users)
      .set({ safetyLabel: label || null, safetyLabelAt: label ? new Date().toISOString() : null })
      .where(eq(users.id, id))
      .run();
    return this.findById(id);
  }

  /** Кому выдан раздел админки (listUsersWithAdminSection в server/data/users.js). */
  public findWithAdminSection(section: string): User[] {
    return this.db
      .select()
      .from(users)
      .where(sql`${users.adminSections} LIKE ${`%"${section}"%`}`)
      .all()
      .map(toUser)
      .filter((u) => u.adminSections.includes(section));
  }

  public setBlocked(id: string, targetId: string, blocked: boolean): User | undefined {
    const user = this.findById(id);
    if (!user) return undefined;
    const current = new Set(Array.isArray(user.blockedUserIds) ? user.blockedUserIds : []);
    if (blocked) current.add(targetId);
    else current.delete(targetId);
    this.db.update(users).set({ blockedUserIds: JSON.stringify([...current]) }).where(eq(users.id, id)).run();
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
  /** Продлевает Premium на days дней (от текущего срока, если он ещё идёт); null — навсегда. */
  public grantPremiumDays(userId: string, days: number | null): User | undefined {
    const user = this.findById(userId);
    if (!user) return undefined;
    if (days == null || user.premiumForever) return this.update(userId, { premiumUntil: FOREVER });
    const base = user.isPremium && user.premiumUntil ? new Date(user.premiumUntil) : new Date();
    base.setUTCDate(base.getUTCDate() + days);
    return this.update(userId, { premiumUntil: base.toISOString() });
  }

  public revokePremium(userId: string): User | undefined {
    return this.update(userId, { premiumUntil: null });
  }

  /** Как grantPremiumDays, для «Shalter для бизнеса». */
  public grantBusinessDays(userId: string, days: number | null): User | undefined {
    const user = this.findById(userId);
    if (!user) return undefined;
    if (days == null || user.businessForever) return this.update(userId, { businessUntil: FOREVER });
    const base = user.isBusiness && user.businessUntil ? new Date(user.businessUntil) : new Date();
    base.setUTCDate(base.getUTCDate() + days);
    return this.update(userId, { businessUntil: base.toISOString() });
  }

  public revokeBusiness(userId: string): User | undefined {
    return this.update(userId, { businessUntil: null });
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

