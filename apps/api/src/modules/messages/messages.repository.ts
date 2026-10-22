import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { textCrypto } from "../../legacy/legacy.js";
import { InjectDb, type Db } from "../db/db.module.js";
import { chatReads, chats, messages } from "../db/schema.js";
import { sealAttachments, sealText, toMessage } from "./lib/message.mapper.js";
import type { DeletedMessageRefs, Message, MessageRow, MessagesPage, NewMessage, ReadMark } from "./model/domain.js";

/** topic: undefined — весь чат; null — тема «Общее» (без topicId); строка — одна тема. */
export interface PageQuery {
  limit: number;
  before: string | null;
  beforeId: string | null;
  topic?: string | null;
}

/** В JSON-массиве id есть этот (как `.includes(id)` после JSON.parse в server/). */
const listsId = (column: typeof messages.deletedForIds, id: string): SQL => sql`instr(${column}, ${JSON.stringify(id)}) > 0`;

function parseJson<T>(json: string | null, fallback: T): T {
  try {
    return json ? (JSON.parse(json) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Сообщения — то же, что server/data/messages.js, на тех же таблицах: текст и расшифровки
// голосовых зашифрованы (lib/message.mapper.ts), отметки прочтения — в readByIds/readTimes
// и в chat_reads. Поисковый указатель messages_search ведут триггеры server/db.js.
@Injectable()
export class MessagesRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  private readonly secretKeyOf = (chatId: string): string | null => {
    const row = this.db.select({ secret: chats.secret, secretKey: chats.secretKey }).from(chats).where(eq(chats.id, chatId)).get();
    return row?.secret ? row.secretKey : null;
  };

  private toMessage(row: MessageRow | undefined): Message | undefined {
    return row ? toMessage(row, this.secretKeyOf) : undefined;
  }

  private toMessages(rows: MessageRow[]): Message[] {
    return rows.map((row) => toMessage(row, this.secretKeyOf));
  }

  public findById(id: string): Message | undefined {
    return this.toMessage(this.db.select().from(messages).where(eq(messages.id, id)).get());
  }

  /** Страница ленты (без ответов в ветках), скрытое у viewerId и очищенное до clearedBefore не входит. */
  public findPage(chatId: string, viewerId: string, clearedBefore: string | undefined, query: PageQuery): MessagesPage {
    const { limit, before, beforeId, topic } = query;
    const where: (SQL | undefined)[] = [eq(messages.chatId, chatId), isNull(messages.threadRootId)];
    if (topic === null) where.push(isNull(messages.topicId));
    else if (topic !== undefined) where.push(eq(messages.topicId, topic));
    if (clearedBefore) where.push(gt(messages.createdAt, clearedBefore));
    if (before) {
      where.push(
        beforeId
          ? or(lt(messages.createdAt, before), and(eq(messages.createdAt, before), lt(messages.id, beforeId)))
          : lt(messages.createdAt, before)
      );
    }
    let rows = this.toMessages(
      this.db
        .select()
        .from(messages)
        .where(and(...where))
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(limit + 1)
        .all()
    );
    if (viewerId) rows = rows.filter((m) => !m.deletedForIds?.includes(viewerId));
    const hasMore = rows.length > limit;
    if (hasMore) rows = rows.slice(0, limit);
    rows.reverse();
    return { messages: rows, hasMore };
  }

  /** Вся лента чата по времени (без ответов в ветках и скрытого у viewerId) — listMessages в server/. */
  public listFeed(chatId: string, viewerId: string): Message[] {
    return this.toMessages(
      this.db.select().from(messages).where(and(eq(messages.chatId, chatId), isNull(messages.threadRootId))).orderBy(asc(messages.createdAt)).all()
    ).filter((m) => !m.deletedForIds?.includes(viewerId));
  }

  public listThreadReplies(rootId: string): Message[] {
    return this.toMessages(this.db.select().from(messages).where(eq(messages.threadRootId, rootId)).orderBy(asc(messages.createdAt)).all());
  }

  /**
   * Время последнего сообщения userId в ленте чата, которое он у себя не скрыл (медленный
   * режим). В server/ — последнее из listMessages(chatId, userId) от него.
   */
  public lastSentAt(chatId: string, userId: string): string | undefined {
    return this.ownInFeed(chatId, userId)
      .orderBy(desc(messages.createdAt))
      .limit(1)
      .get()?.createdAt;
  }

  /** userId писал в ленту чата и не скрыл это у себя (в server/ — listMessages(chatId, userId).some(…)). */
  public hasSentIn(chatId: string, userId: string): boolean {
    return !!this.ownInFeed(chatId, userId).limit(1).get();
  }

  private ownInFeed(chatId: string, userId: string) {
    return this.db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(
        and(
          eq(messages.chatId, chatId),
          eq(messages.senderId, userId),
          isNull(messages.threadRootId),
          sql`not ${listsId(messages.deletedForIds, userId)}`
        )
      );
  }

  /**
   * Поиск по указателю: match — FTS-запрос из textCrypto.searchQuery. Берутся limit самых
   * новых совпадений из этих чатов, отдаются от старых к новым. Неверный запрос — пусто.
   */
  public search(chatIds: string[], match: string, limit: number): Message[] {
    if (!chatIds.length) return [];
    let rows: MessageRow[];
    try {
      rows = this.db.all<MessageRow>(sql`
        SELECT m.* FROM messages_search f
          JOIN messages m ON m.rowid = f.rowid
         WHERE messages_search MATCH ${match} AND m.chatId IN ${chatIds}
         ORDER BY f.rowid DESC LIMIT ${limit}`);
    } catch {
      return [];
    }
    return this.toMessages(rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)));
  }

  public create(message: NewMessage): Message {
    const { chatId, id } = message;
    this.db
      .insert(messages)
      .values({
        id,
        chatId,
        senderId: message.senderId,
        paidStars: message.paidStars ?? 0,
        type: message.type ?? "text",
        text: sealText(chatId, id, message.text, this.secretKeyOf),
        hasLink: textCrypto().hasLink(message.text),
        createdAt: message.createdAt,
        editedAt: message.editedAt ?? null,
        pinned: message.pinned ? 1 : 0,
        replyToId: message.replyToId ?? null,
        forwardedFrom: message.forwardedFrom ? JSON.stringify(message.forwardedFrom) : null,
        attachments: sealAttachments(chatId, id, message.attachments, this.secretKeyOf),
        keyboard: message.keyboard ? JSON.stringify(message.keyboard) : null,
        gift: message.gift ? JSON.stringify(message.gift) : null,
        sticker: message.sticker ? JSON.stringify(message.sticker) : null,
        customEmoji: message.customEmoji ? JSON.stringify(message.customEmoji) : null,
        report: message.report ? JSON.stringify(message.report) : null,
        reactions: JSON.stringify(message.reactions ?? []),
        readByIds: JSON.stringify(message.readByIds ?? []),
        deletedForIds: JSON.stringify(message.deletedForIds ?? []),
        mentionedUserIds: JSON.stringify(message.mentionedUserIds ?? []),
        threadRootId: message.threadRootId ?? null,
        topicId: message.topicId ?? null,
        storyReply: message.storyReply ? JSON.stringify(message.storyReply) : null,
        anchorForPostId: message.anchorForPostId ?? null,
        discussionAnchorId: message.discussionAnchorId ?? null,
        signedBy: message.signedBy ?? null,
        views: message.views ?? 0,
        commentCount: message.commentCount ?? 0,
        anonymous: message.anonymous ? 1 : 0,
        effect: message.effect ?? null,
        visibleToId: message.visibleToId ?? null,
      })
      .run();
    return this.findById(id)!;
  }

  /**
   * Правка сообщения: fn получает его и возвращает новое (mutate в server/data/messages.js).
   * Текст без изменений не перешифровывается — шифротекст в базе остаётся прежним.
   */
  public mutate(id: string, fn: (message: Message) => Message): Message | undefined {
    const row = this.db.select().from(messages).where(eq(messages.id, id)).get();
    const existing = this.toMessage(row);
    if (!row || !existing) return undefined;
    const updated = fn(existing);
    this.db
      .update(messages)
      .set({
        text: (updated.text ?? "") === existing.text ? row.text : sealText(existing.chatId, id, updated.text, this.secretKeyOf),
        hasLink: textCrypto().hasLink(updated.text),
        editedAt: updated.editedAt ?? null,
        pinned: updated.pinned ? 1 : 0,
        forwardedFrom: updated.forwardedFrom ? JSON.stringify(updated.forwardedFrom) : null,
        attachments: sealAttachments(existing.chatId, id, updated.attachments, this.secretKeyOf),
        keyboard: updated.keyboard ? JSON.stringify(updated.keyboard) : null,
        reactions: JSON.stringify(updated.reactions ?? []),
        readByIds: JSON.stringify(updated.readByIds ?? []),
        deletedForIds: JSON.stringify(updated.deletedForIds ?? []),
        anchorForPostId: updated.anchorForPostId ?? null,
        discussionAnchorId: updated.discussionAnchorId ?? null,
        views: updated.views ?? 0,
        commentCount: updated.commentCount ?? 0,
        linkPreview: updated.linkPreview ? JSON.stringify(updated.linkPreview) : null,
        report: updated.report ? JSON.stringify(updated.report) : null,
      })
      .where(eq(messages.id, id))
      .run();
    return this.findById(id);
  }

  /** Буст за звёзды: сообщение выделено до until. */
  public setBoost(id: string, until: string, byId: string): Message | undefined {
    this.db.update(messages).set({ boostedUntil: until, boostedById: byId }).where(eq(messages.id, id)).run();
    return this.findById(id);
  }

  /** Удаляет сообщение; возвращает, на какие файлы оно ссылалось. */
  public delete(id: string): DeletedMessageRefs | undefined {
    const refs = this.db
      .select({ chatId: messages.chatId, attachments: messages.attachments, sticker: messages.sticker })
      .from(messages)
      .where(eq(messages.id, id))
      .get();
    this.db.delete(messages).where(eq(messages.id, id)).run();
    return refs;
  }

  /**
   * Отмечает прочитанными чужие сообщения чата (и ответы в ветках); возвращает их id.
   * recordTime — записать readAt (личка, если читатель не скрывает время захода).
   */
  public markChatRead(chatId: string, viewerId: string, recordTime: boolean): string[] {
    const rows = this.db
      .select({ id: messages.id, senderId: messages.senderId, readByIds: messages.readByIds, readTimes: messages.readTimes })
      .from(messages)
      .where(and(eq(messages.chatId, chatId), ne(messages.senderId, viewerId), sql`${messages.readByIds} NOT LIKE ${`%"${viewerId}"%`}`))
      .all();
    const changedIds: string[] = [];
    const readNow = new Date().toISOString();
    const now = recordTime ? readNow : null;
    this.db.transaction((tx) => {
      for (const row of rows) {
        const readByIds = parseJson<string[]>(row.readByIds, []);
        if (readByIds.includes(viewerId)) continue;
        readByIds.push(viewerId);
        const readTimes = parseJson<Record<string, string>>(row.readTimes, {});
        readTimes[viewerId] = readNow;
        tx.update(messages)
          .set({ readByIds: JSON.stringify(readByIds), readAt: sql`COALESCE(${messages.readAt}, ${now})`, readTimes: JSON.stringify(readTimes) })
          .where(eq(messages.id, row.id))
          .run();
        changedIds.push(row.id);
      }
    });
    const newest = this.db.select({ at: sql<string | null>`MAX(${messages.createdAt})` }).from(messages).where(eq(messages.chatId, chatId)).get()?.at;
    if (newest) {
      this.db
        .insert(chatReads)
        .values({ chatId, userId: viewerId, lastReadAt: newest })
        .onConflictDoUpdate({
          target: [chatReads.chatId, chatReads.userId],
          set: { lastReadAt: sql`excluded.lastReadAt` },
          setWhere: sql`excluded.lastReadAt > ${chatReads.lastReadAt}`,
        })
        .run();
    }
    return changedIds;
  }

  public readersOf(messageId: string): ReadMark[] {
    const row = this.db.select({ readByIds: messages.readByIds, readTimes: messages.readTimes }).from(messages).where(eq(messages.id, messageId)).get();
    if (!row) return [];
    const times = parseJson<Record<string, string>>(row.readTimes, {});
    return parseJson<string[]>(row.readByIds, []).map((userId) => ({ userId, readAt: times[userId] ?? null }));
  }

  /**
   * Сообщения ленты с вложениями или ссылками, старые первыми: последние limit, кроме удалённых
   * у зрителя (listMediaMessages в server/data/messages.js).
   */
  public listMedia(chatId: string, viewerId: string, limit = 300): Message[] {
    const rows = this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.chatId, chatId),
          sql`NOT ${listsId(messages.deletedForIds, viewerId)}`,
          isNull(messages.threadRootId),
          or(sql`${messages.attachments} IS NOT NULL`, sql`${messages.linkPreview} IS NOT NULL`, eq(messages.hasLink, 1))
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .all();
    return this.toMessages(rows).reverse();
  }

  /** Дни месяца (ГГГГ-ММ) со сообщениями ленты; tz — сдвиг в минутах. */
  public listDays(chatId: string, month: string, tz: number): string[] {
    return this.db
      .all<{ day: string }>(sql`
        SELECT DISTINCT substr(datetime(createdAt, (${tz} || ' minutes')), 1, 10) AS day
          FROM messages
         WHERE chatId = ${chatId} AND threadRootId IS NULL
           AND substr(datetime(createdAt, (${tz} || ' minutes')), 1, 7) = ${month}
         ORDER BY day`)
      .map((r) => r.day);
  }

  /** Первое сообщение ленты с этой даты (ГГГГ-ММ-ДД) и позже; tz — сдвиг в минутах. */
  public firstOfDay(chatId: string, day: string, tz: number): { id: string; createdAt: string } | null {
    return (
      this.db.get<{ id: string; createdAt: string }>(sql`
        SELECT id, createdAt
          FROM messages
         WHERE chatId = ${chatId} AND threadRootId IS NULL
           AND substr(datetime(createdAt, (${tz} || ' minutes')), 1, 10) >= ${day}
         ORDER BY createdAt ASC
         LIMIT 1`) ?? null
    );
  }

  /** Байты вложений по видам (image, video, …) во всех сообщениях этих чатов: size или длина data-URL. */
  public attachmentBytesByKind(chatIds: string[]): Record<string, number> {
    if (!chatIds.length) return {};
    const rows = this.db.all<{ kind: string | null; bytes: number | null }>(sql`
      SELECT json_extract(a.value, '$.kind') AS kind,
             sum(
               CASE
                 WHEN json_extract(a.value, '$.size') IS NOT NULL THEN json_extract(a.value, '$.size')
                 WHEN json_extract(a.value, '$.url') LIKE 'data:%' THEN
                   (length(json_extract(a.value, '$.url')) - instr(json_extract(a.value, '$.url'), ',')) * 3 / 4
                 ELSE 0
               END
             ) AS bytes
        FROM messages m, json_each(m.attachments) a
       WHERE ${inArray(sql`m.chatId`, chatIds)} AND m.attachments IS NOT NULL AND m.attachments <> '[]'
       GROUP BY kind`);
    return Object.fromEntries(rows.filter((r) => r.kind).map((r) => [r.kind, r.bytes ?? 0]));
  }
}
