import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, asc, eq, getTableColumns, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { newSecretChatKey } from "../../legacy/legacy.js";
import { InjectDb, type Db } from "../db/db.module.js";
import { chatMembers, chats } from "../db/schema.js";
import { toChat, type ChatMember } from "./lib/chat.mapper.js";
import type { Chat, ChatPatch, ChatRow, NewChat, NewChatRow } from "./model/domain.js";

const MEMBER_COLUMNS = {
  userId: chatMembers.userId,
  isAdmin: chatMembers.isAdmin,
  isModerator: chatMembers.isModerator,
  isOwner: chatMembers.isOwner,
};

// Простые поля, которые меняет update (PATCHABLE_FIELDS в server/data/chats.js).
const SCALAR_FIELDS = [
  "title", "description", "username", "isPublic", "avatarColor", "avatarImage", "ownerId",
  "linkedDiscussionChatId", "points", "autoDeleteSeconds", "inviteCode", "slowModeSeconds",
  "commentPriceStars", "approveJoins", "signMessages", "commentsOff", "anonymousAdmins", "topicsEnabled", "welcomeText", "isVerified",
] as const satisfies readonly (keyof ChatPatch & keyof NewChatRow)[];

const MEMBERS_CHUNK = 500;

// Привязка секретного чата к устройству хранится хешем device_id: утечка таблицы не даёт
// подделать вход.
export function deviceHash(deviceId: string): string {
  return createHash("sha256").update(`secret-chat-device:${deviceId}`).digest("hex").slice(0, 32);
}

function parseDevices(json: string | null): Record<string, string> {
  try {
    return JSON.parse(json || "{}");
  } catch {
    return {};
  }
}

// Чаты — то же, что server/data/chats.js, на тех же таблицах: chats и участники с ролями
// в chat_members.
@Injectable()
export class ChatsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public findById(id: string): Chat | undefined {
    return this.toChat(this.db.select().from(chats).where(eq(chats.id, id)).get());
  }

  public findByInviteCode(code: string): Chat | undefined {
    const c = code.trim();
    if (!c) return undefined;
    return this.toChat(this.db.select().from(chats).where(eq(chats.inviteCode, c)).get());
  }

  public findByUsername(username: string): Chat | undefined {
    const normalized = username.trim().toLowerCase();
    if (!normalized) return undefined;
    return this.toChat(
      this.db
        .select()
        .from(chats)
        .where(and(sql`lower(${chats.username}) = ${normalized}`, sql`${chats.username} IS NOT NULL`))
        .get()
    );
  }

  public findChannelByDiscussion(discussionChatId: string): Chat | undefined {
    return this.toChat(
      this.db
        .select()
        .from(chats)
        .where(and(eq(chats.linkedDiscussionChatId, discussionChatId), eq(chats.type, "channel")))
        .get()
    );
  }

  /** Другой чат, у которого эта группа — обсуждение. */
  public findLinkedTo(discussionChatId: string, exceptChatId: string): Chat | undefined {
    return this.toChat(
      this.db
        .select()
        .from(chats)
        .where(and(eq(chats.linkedDiscussionChatId, discussionChatId), ne(chats.id, exceptChatId)))
        .get()
    );
  }

  /** Личка двоих (не секретная); с самим собой — «Избранное». */
  public findDmBetween(userIdA: string, userIdB: string): Chat | undefined {
    if (userIdA === userIdB) {
      const row = this.db
        .select(getTableColumns(chats))
        .from(chats)
        .innerJoin(chatMembers, and(eq(chatMembers.chatId, chats.id), eq(chatMembers.userId, userIdA)))
        .where(
          and(
            eq(chats.type, "dm"),
            eq(chats.secret, 0),
            sql`(SELECT COUNT(*) FROM ${chatMembers} x WHERE x.chatId = ${chats.id}) = 1`
          )
        )
        .get();
      return this.toChat(row);
    }
    const a = alias(chatMembers, "a");
    const b = alias(chatMembers, "b");
    const row = this.db
      .select(getTableColumns(chats))
      .from(chats)
      .innerJoin(a, and(eq(a.chatId, chats.id), eq(a.userId, userIdA)))
      .innerJoin(b, and(eq(b.chatId, chats.id), eq(b.userId, userIdB)))
      .where(and(eq(chats.type, "dm"), eq(chats.secret, 0)))
      .get();
    return this.toChat(row);
  }

  /** Все чаты (listChats в server/data/chats.js) — для каталога модерации. */
  public findAll(): Chat[] {
    const rows = this.db.select().from(chats).all();
    const byChat = this.membersByChat(rows.map((r) => r.id));
    return rows.map((r) => toChat(r, byChat.get(r.id) ?? []));
  }

  /**
   * Чаты пользователя. С deviceId — без секретных чатов, привязанных у него к другому
   * устройству (deviceId null — к любому).
   */
  public findForUser(userId: string, deviceId?: string | null): Chat[] {
    const rows = this.db
      .select(getTableColumns(chats))
      .from(chats)
      .innerJoin(chatMembers, eq(chatMembers.chatId, chats.id))
      .where(eq(chatMembers.userId, userId))
      .all();
    const visible =
      deviceId === undefined
        ? rows
        : rows.filter((r) => {
            const bound = r.secret ? (parseDevices(r.secretDevices)[userId] ?? null) : null;
            return !bound || bound === (deviceId ? deviceHash(deviceId) : null);
          });
    const byChat = this.membersByChat(visible.map((r) => r.id));
    return visible.map((r) => toChat(r, byChat.get(r.id) ?? []));
  }

  /**
   * Публичные каналы и группы по названию или нику (без «@»), по алфавиту, не больше 50;
   * channelsOnly — только каналы (каталог каналов).
   */
  public searchPublic(query: string, { channelsOnly = false } = {}): Chat[] {
    const q = (query ?? "").trim().toLowerCase();
    const handle = q.replace(/^@/, "");
    const rows = this.db
      .select()
      .from(chats)
      .where(and(inArray(chats.type, channelsOnly ? ["channel"] : ["channel", "group"]), eq(chats.isPublic, 1)))
      .orderBy(asc(chats.title))
      .all()
      .filter((r) => !q || (r.title ?? "").toLowerCase().includes(q) || (r.username ?? "").toLowerCase().includes(handle))
      .slice(0, 50);
    const byChat = this.membersByChat(rows.map((r) => r.id));
    return rows.map((r) => toChat(r, byChat.get(r.id) ?? []));
  }

  /**
   * Похожие публичные каналы (similarChannels в server/data/chats.js): сначала с общей
   * аудиторией, недостающие — самые многолюдные.
   */
  public similarChannels(chatId: string, limit = 10): Chat[] {
    const ids = this.db
      .all<{ id: string }>(sql`
        SELECT m2.chatId AS id, COUNT(*) AS overlap
        FROM (SELECT userId FROM chat_members WHERE chatId = ${chatId} LIMIT 5000) m1
        JOIN chat_members m2 ON m2.userId = m1.userId AND m2.chatId != ${chatId}
        JOIN chats c ON c.id = m2.chatId AND c.type = 'channel' AND c.isPublic = 1
        GROUP BY m2.chatId
        ORDER BY overlap DESC
        LIMIT ${limit}`)
      .map((r) => r.id);
    if (ids.length < limit) {
      const popular = this.db.all<{ id: string }>(sql`
        SELECT c.id AS id, (SELECT COUNT(*) FROM chat_members m WHERE m.chatId = c.id) AS members
        FROM chats c
        WHERE c.type = 'channel' AND c.isPublic = 1 AND c.id != ${chatId}
        ORDER BY members DESC
        LIMIT ${limit * 2}`);
      for (const r of popular) {
        if (ids.length >= limit) break;
        if (!ids.includes(r.id)) ids.push(r.id);
      }
    }
    return ids.map((id) => this.findById(id)).filter((c): c is Chat => !!c);
  }

  /** С кем у пользователя есть личная переписка (dmPartnerIds в server/data/chats.js). */
  public dmPartnerIds(userId: string): string[] {
    return this.db
      .all<{ id: string }>(sql`
        SELECT DISTINCT m2.userId AS id FROM chat_members m1
          JOIN chats c ON c.id = m1.chatId AND c.type = 'dm'
          JOIN chat_members m2 ON m2.chatId = c.id AND m2.userId != m1.userId
         WHERE m1.userId = ${userId}`)
      .map((r) => r.id);
  }

  public isSecret(chatId: string): boolean {
    return !!this.db.select({ secret: chats.secret }).from(chats).where(eq(chats.id, chatId)).get()?.secret;
  }

  /** Привязки секретного чата: участник → хеш устройства; null — чат не секретный. */
  public secretDevices(chatId: string): Record<string, string> | null {
    const row = this.db.select({ secret: chats.secret, secretDevices: chats.secretDevices }).from(chats).where(eq(chats.id, chatId)).get();
    return row?.secret ? parseDevices(row.secretDevices) : null;
  }

  /**
   * Привязывает секретный чат к устройству участника, если ещё не привязан. true — чат
   * доступен с этого устройства (или он не секретный).
   */
  public claimSecretDevice(chatId: string, userId: string, deviceId: string | undefined): boolean {
    return this.db.transaction((tx) => {
      const row = tx.select({ secret: chats.secret, secretDevices: chats.secretDevices }).from(chats).where(eq(chats.id, chatId)).get();
      if (!row?.secret) return true;
      if (!deviceId) return false;
      const devices = parseDevices(row.secretDevices);
      const hash = deviceHash(deviceId);
      if (devices[userId]) return devices[userId] === hash;
      devices[userId] = hash;
      tx.update(chats).set({ secretDevices: JSON.stringify(devices) }).where(eq(chats.id, chatId)).run();
      return true;
    });
  }

  public create(chat: NewChat): Chat {
    this.db
      .insert(chats)
      .values({
        id: chat.id,
        type: chat.type,
        title: chat.title ?? "",
        description: chat.description ?? null,
        username: chat.username ?? null,
        isPublic: chat.isPublic ? 1 : 0,
        avatarColor: chat.avatarColor ?? null,
        avatarImage: chat.avatarImage ?? null,
        ownerId: chat.ownerId ?? null,
        pinned: chat.pinned ? 1 : 0,
        muted: chat.muted ? 1 : 0,
        archived: chat.archived ? 1 : 0,
        createdAt: chat.createdAt,
        linkedDiscussionChatId: chat.linkedDiscussionChatId ?? null,
        restrictions: null,
        points: 0,
        votes: null,
      })
      .run();
    this.setMembers(chat.id, chat.memberIds, chat.adminIds ?? [], [], chat.ownerId ? [chat.ownerId] : []);
    if (chat.secret) {
      const devices = Object.fromEntries(Object.entries(chat.secretDevices ?? {}).map(([uid, dev]) => [uid, deviceHash(dev)]));
      this.db
        .update(chats)
        .set({ secret: 1, secretKey: newSecretChatKey(chat.id), secretDevices: JSON.stringify(devices) })
        .where(eq(chats.id, chat.id))
        .run();
    }
    return this.findById(chat.id)!;
  }

  public update(id: string, patch: ChatPatch): Chat | undefined {
    if (!this.db.select({ id: chats.id }).from(chats).where(eq(chats.id, id)).get()) return undefined;

    const set: Partial<NewChatRow> = {};
    const assign = set as Record<string, unknown>;
    for (const field of SCALAR_FIELDS) {
      if (!(field in patch)) continue;
      const v = patch[field];
      assign[field] = typeof v === "boolean" ? (v ? 1 : 0) : (v ?? null);
    }
    if ("permissions" in patch) set.permissions = patch.permissions ? JSON.stringify(patch.permissions) : null;
    if ("memberTitles" in patch) set.memberTitles = JSON.stringify(patch.memberTitles ?? {});
    if ("restrictions" in patch) set.restrictions = JSON.stringify(patch.restrictions ?? {});
    if ("votes" in patch) set.votes = JSON.stringify(patch.votes ?? {});
    if ("protectedBy" in patch) set.protectedBy = patch.protectedBy?.length ? JSON.stringify(patch.protectedBy) : null;
    if ("bannedIds" in patch) set.bannedIds = JSON.stringify(patch.bannedIds ?? []);
    if ("wallpaper" in patch) set.wallpaper = patch.wallpaper ? JSON.stringify(patch.wallpaper) : null;
    if ("allowedReactions" in patch) set.allowedReactions = Array.isArray(patch.allowedReactions) ? JSON.stringify(patch.allowedReactions) : null;
    if (Object.keys(set).length > 0) this.db.update(chats).set(set).where(eq(chats.id, id)).run();

    if ("memberIds" in patch || "adminIds" in patch || "moderatorIds" in patch || "ownerIds" in patch) {
      const current = this.findById(id)!;
      this.setMembers(
        id,
        patch.memberIds ?? current.memberIds,
        patch.adminIds ?? current.adminIds,
        patch.moderatorIds ?? current.moderatorIds,
        patch.ownerIds ?? current.ownerIds
      );
    }
    return this.findById(id);
  }

  public delete(id: string): void {
    this.db.delete(chats).where(eq(chats.id, id)).run();
  }

  private setMembers(chatId: string, memberIds: string[], adminIds: string[], moderatorIds: string[], ownerIds: string[]): void {
    this.db.transaction((tx) => {
      tx.delete(chatMembers).where(eq(chatMembers.chatId, chatId)).run();
      for (const userId of new Set(memberIds.filter(Boolean))) {
        tx.insert(chatMembers)
          .values({
            chatId,
            userId,
            isAdmin: adminIds.includes(userId) ? 1 : 0,
            isModerator: moderatorIds.includes(userId) ? 1 : 0,
            isOwner: ownerIds.includes(userId) ? 1 : 0,
          })
          .run();
      }
    });
  }

  // Участники всех чатов одним запросом на 500 чатов, а не запросом на каждый.
  private membersByChat(ids: string[]): Map<string, ChatMember[]> {
    const byChat = new Map<string, ChatMember[]>();
    for (let i = 0; i < ids.length; i += MEMBERS_CHUNK) {
      const rows = this.db
        .select({ chatId: chatMembers.chatId, ...MEMBER_COLUMNS })
        .from(chatMembers)
        .where(inArray(chatMembers.chatId, ids.slice(i, i + MEMBERS_CHUNK)))
        .all();
      for (const { chatId, ...m } of rows) {
        let list = byChat.get(chatId);
        if (!list) byChat.set(chatId, (list = []));
        list.push(m);
      }
    }
    return byChat;
  }

  private toChat(row: ChatRow | undefined): Chat | undefined {
    if (!row) return undefined;
    const members = this.db.select(MEMBER_COLUMNS).from(chatMembers).where(eq(chatMembers.chatId, row.id)).all();
    return toChat(row, members);
  }
}
