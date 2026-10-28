import { Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { communities, communityBans, communityChats, communityMembers, communityRequests } from "../db/schema.js";
import { ADD_MODES, cleanRights, parseRights } from "./lib/community-rights.js";
import type { Community, CommunityBan, CommunityMemberRow, CommunityPatch, CommunityRequest, CommunityRights, CommunityRow } from "./model/domain.js";

// Сообщества: сама вывеска, её чаты, участники с ролями и личными настройками, удалённые
// участники и заявки на добавление чатов — как server/data/communities.js.
@Injectable()
export class CommunitiesRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public findById(id: string): Community | undefined {
    const row = this.db.select().from(communities).where(eq(communities.id, id)).get();
    return row && this.toCommunity(row);
  }

  /** Сообщество, в которое входит чат. */
  public findByChat(chatId: string): Community | undefined {
    const row = this.db.select({ communityId: communityChats.communityId }).from(communityChats).where(eq(communityChats.chatId, chatId)).get();
    return row ? this.findById(row.communityId) : undefined;
  }

  /** Новое сообщество; владелец — первый участник. */
  public create(c: { id: string; ownerId: string; title: string; description: string; avatarColor: string | null; avatarImage: string | null; addMode: string }): Community {
    const now = new Date().toISOString();
    this.db.transaction((tx) => {
      tx.insert(communities)
        .values({
          id: c.id,
          ownerId: c.ownerId,
          title: c.title,
          description: c.description || null,
          avatarColor: c.avatarColor ?? null,
          avatarImage: c.avatarImage ?? null,
          addMode: ADD_MODES.has(c.addMode) ? c.addMode : "all",
          createdAt: now,
        })
        .run();
      tx.insert(communityMembers).values({ communityId: c.id, userId: c.ownerId, role: "owner", joinedAt: now }).run();
    });
    return this.findById(c.id)!;
  }

  public update(id: string, patch: CommunityPatch): Community | undefined {
    const existing = this.findById(id);
    if (!existing) return undefined;
    const { title, description, avatarImage, addMode } = patch;
    this.db
      .update(communities)
      .set({
        title: title ?? existing.title,
        description: description === undefined ? (existing.description ?? null) : description || null,
        avatarImage: avatarImage === undefined ? (existing.avatarImage ?? null) : avatarImage || null,
        addMode: addMode === undefined ? existing.addMode : ADD_MODES.has(addMode) ? addMode : existing.addMode,
      })
      .where(eq(communities.id, id))
      .run();
    return this.findById(id);
  }

  public delete(id: string): void {
    this.db.delete(communities).where(eq(communities.id, id)).run();
  }

  // ---------- чаты ----------

  /** Чат в сообщество; false — он уже в другом. Заявки на этот чат во все сообщества снимаются. */
  public addChat(communityId: string, chatId: string, { visible = true, addedBy = null }: { visible?: boolean; addedBy?: string | null } = {}): boolean {
    const taken = this.db.select({ communityId: communityChats.communityId }).from(communityChats).where(eq(communityChats.chatId, chatId)).get();
    if (taken) return taken.communityId === communityId;
    this.db.transaction((tx) => {
      tx.insert(communityChats).values({ chatId, communityId, visible: visible ? 1 : 0, addedBy, addedAt: new Date().toISOString() }).run();
      tx.delete(communityRequests).where(eq(communityRequests.chatId, chatId)).run();
    });
    return true;
  }

  public removeChat(communityId: string, chatId: string): boolean {
    return this.db.delete(communityChats).where(and(eq(communityChats.communityId, communityId), eq(communityChats.chatId, chatId))).run().changes > 0;
  }

  public setChatVisible(communityId: string, chatId: string, visible: boolean): void {
    this.db
      .update(communityChats)
      .set({ visible: visible ? 1 : 0 })
      .where(and(eq(communityChats.communityId, communityId), eq(communityChats.chatId, chatId)))
      .run();
  }

  // ---------- участники ----------

  public memberRow(communityId: string, userId: string): CommunityMemberRow | undefined {
    return this.db
      .select()
      .from(communityMembers)
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)))
      .get();
  }

  private ensureMemberRow(communityId: string, userId: string): void {
    this.db.insert(communityMembers).values({ communityId, userId, joinedAt: new Date().toISOString() }).onConflictDoNothing().run();
  }

  public isBanned(communityId: string, userId: string): boolean {
    return !!this.db
      .select({ one: sql`1` })
      .from(communityBans)
      .where(and(eq(communityBans.communityId, communityId), eq(communityBans.userId, userId)))
      .get();
  }

  /** Состоит ли пользователь хоть в одном чате сообщества. */
  public inLinkedChat(communityId: string, userId: string): boolean {
    return !!this.db.get(sql`
      SELECT 1 FROM community_chats cc JOIN chat_members m ON m.chatId = cc.chatId
       WHERE cc.communityId = ${communityId} AND m.userId = ${userId} LIMIT 1`);
  }

  /** Закрепить строку, показывать одной строкой; undefined — не менять. */
  public setPrefs(communityId: string, userId: string, { pinned, collapsed }: { pinned?: boolean; collapsed?: boolean }): void {
    this.ensureMemberRow(communityId, userId);
    const set: Partial<CommunityMemberRow> = {};
    if (pinned !== undefined) set.pinned = pinned ? 1 : 0;
    if (collapsed !== undefined) set.collapsed = collapsed ? 1 : 0;
    if (Object.keys(set).length) this.updateMember(communityId, userId, set);
  }

  public join(communityId: string, userId: string): void {
    this.ensureMemberRow(communityId, userId);
    this.updateMember(communityId, userId, { left: 0 });
  }

  /** Выход — только из сообщества: чаты остаются, роль админа снимается. */
  public leave(communityId: string, userId: string): void {
    this.ensureMemberRow(communityId, userId);
    this.updateMember(communityId, userId, { left: 1, role: "member", rights: null, pinned: 0 });
  }

  private updateMember(communityId: string, userId: string, set: Partial<CommunityMemberRow>): void {
    this.db
      .update(communityMembers)
      .set(set)
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)))
      .run();
  }

  /** Сообщества, где пользователь участвует: владелец, своя строка (не вышел) или член чата сообщества; кроме удалённых из них. */
  public listForUser(uid: string): Community[] {
    const rows = this.db.all<CommunityRow>(sql`
      SELECT DISTINCT c.* FROM communities c
        LEFT JOIN community_members cm ON cm.communityId = c.id AND cm.userId = ${uid}
        LEFT JOIN community_chats cc ON cc.communityId = c.id
        LEFT JOIN chat_members m ON m.chatId = cc.chatId AND m.userId = ${uid}
       WHERE (c.ownerId = ${uid} OR cm.userId IS NOT NULL OR m.userId IS NOT NULL)
         AND (c.ownerId = ${uid} OR cm.left IS NULL OR cm.left = 0)
         AND NOT EXISTS (SELECT 1 FROM community_bans b WHERE b.communityId = c.id AND b.userId = ${uid} AND c.ownerId <> ${uid})
       ORDER BY c.createdAt DESC`);
    return rows.map((row) => this.toCommunity(row));
  }

  /** Все участники: свои строки и члены чатов сообщества, кроме вышедших и удалённых (владелец — всегда). */
  public listMemberIds(communityId: string): string[] {
    const community = this.db.select({ ownerId: communities.ownerId }).from(communities).where(eq(communities.id, communityId)).get();
    if (!community) return [];
    const ids = new Set([community.ownerId]);
    const rows = this.db.select({ userId: communityMembers.userId, left: communityMembers.left }).from(communityMembers).where(eq(communityMembers.communityId, communityId)).all();
    for (const r of rows) if (!r.left) ids.add(r.userId);
    for (const r of this.db.all<{ userId: string }>(sql`
      SELECT DISTINCT m.userId FROM community_chats cc JOIN chat_members m ON m.chatId = cc.chatId WHERE cc.communityId = ${communityId}`)) {
      ids.add(r.userId);
    }
    const left = new Set(rows.filter((r) => r.left === 1).map((r) => r.userId));
    const banned = new Set(this.listBans(communityId).map((b) => b.userId));
    return [...ids].filter((id) => id === community.ownerId || (!left.has(id) && !banned.has(id)));
  }

  // ---------- администраторы ----------

  public listAdmins(communityId: string): { userId: string; rights: CommunityRights; badge: string | null; title: string | null }[] {
    return this.db
      .select({ userId: communityMembers.userId, rights: communityMembers.rights, badge: communityMembers.badge, title: communityMembers.title })
      .from(communityMembers)
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.role, "admin"), eq(communityMembers.left, 0)))
      .orderBy(asc(communityMembers.joinedAt))
      .all()
      .map((r) => ({ userId: r.userId, rights: parseRights(r.rights), badge: r.badge, title: r.title }));
  }

  public setAdmin(communityId: string, userId: string, rights: CommunityRights): void {
    this.ensureMemberRow(communityId, userId);
    this.updateMember(communityId, userId, { role: "admin", rights: JSON.stringify(cleanRights(rights)), left: 0 });
  }

  public removeAdmin(communityId: string, userId: string): void {
    this.db
      .update(communityMembers)
      .set({ role: "member", rights: null })
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId), eq(communityMembers.role, "admin")))
      .run();
  }

  public setBadgeTitle(communityId: string, userId: string, badge: string | null, title: string | null): void {
    this.ensureMemberRow(communityId, userId);
    this.updateMember(communityId, userId, { badge, title });
  }

  // ---------- удалённые участники ----------

  public listBans(communityId: string): CommunityBan[] {
    return this.db
      .select({ userId: communityBans.userId, bannedBy: communityBans.bannedBy, bannedAt: communityBans.bannedAt })
      .from(communityBans)
      .where(eq(communityBans.communityId, communityId))
      .orderBy(desc(communityBans.bannedAt))
      .all();
  }

  /** Удалить из сообщества: строка участника и его заявки уходят. */
  public ban(communityId: string, userId: string, bannedBy: string): void {
    this.db.transaction((tx) => {
      const bannedAt = new Date().toISOString();
      tx.insert(communityBans)
        .values({ communityId, userId, bannedBy, bannedAt })
        .onConflictDoUpdate({ target: [communityBans.communityId, communityBans.userId], set: { bannedBy, bannedAt } })
        .run();
      tx.delete(communityMembers).where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId))).run();
      tx.delete(communityRequests).where(and(eq(communityRequests.communityId, communityId), eq(communityRequests.suggestedBy, userId))).run();
    });
  }

  public unban(communityId: string, userId: string): boolean {
    return this.db.delete(communityBans).where(and(eq(communityBans.communityId, communityId), eq(communityBans.userId, userId))).run().changes > 0;
  }

  // ---------- заявки на добавление чатов ----------

  public listRequests(communityId: string): CommunityRequest[] {
    return this.db
      .select()
      .from(communityRequests)
      .where(eq(communityRequests.communityId, communityId))
      .orderBy(asc(communityRequests.createdAt))
      .all()
      .map((r) => ({ ...r, visible: !!r.visible }));
  }

  public countRequests(communityId: string): number {
    return this.db.select({ n: count() }).from(communityRequests).where(eq(communityRequests.communityId, communityId)).get()?.n ?? 0;
  }

  public findRequest(id: string): CommunityRequest | undefined {
    const r = this.db.select().from(communityRequests).where(eq(communityRequests.id, id)).get();
    return r && { ...r, visible: !!r.visible };
  }

  /** false — на этот чат уже есть заявка в это сообщество. */
  public addRequest(r: { id: string; communityId: string; chatId: string; suggestedBy: string; visible: boolean }): boolean {
    return (
      this.db
        .insert(communityRequests)
        .values({ ...r, visible: r.visible ? 1 : 0, createdAt: new Date().toISOString() })
        .onConflictDoNothing()
        .run().changes > 0
    );
  }

  public deleteRequest(id: string): void {
    this.db.delete(communityRequests).where(eq(communityRequests.id, id)).run();
  }

  private toCommunity(row: CommunityRow): Community {
    const chats = this.db
      .select({ chatId: communityChats.chatId, visible: communityChats.visible, addedBy: communityChats.addedBy })
      .from(communityChats)
      .where(eq(communityChats.communityId, row.id))
      .orderBy(asc(communityChats.addedAt))
      .all();
    return {
      id: row.id,
      ownerId: row.ownerId,
      title: row.title,
      description: row.description ?? undefined,
      avatarColor: row.avatarColor ?? undefined,
      avatarImage: row.avatarImage ?? undefined,
      addMode: ADD_MODES.has(row.addMode) ? (row.addMode as Community["addMode"]) : "all",
      createdAt: row.createdAt,
      chatIds: chats.map((c) => c.chatId),
      hiddenChatIds: chats.filter((c) => !c.visible).map((c) => c.chatId),
      addedBy: Object.fromEntries(chats.filter((c) => c.addedBy).map((c) => [c.chatId, c.addedBy!])),
    };
  }
}
