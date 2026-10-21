import { Injectable } from "@nestjs/common";
import { and, asc, count, eq, isNotNull, isNull, max } from "drizzle-orm";
import { genId } from "../../common/lib/gen-id.js";
import { InjectDb, type Db } from "../db/db.module.js";
import { chatTopics, messages } from "../db/schema.js";
import type { Topic, TopicPatch, TopicRow, TopicWithStats } from "./model/domain.js";

export const MAX_TOPICS = 100;
export const TOPIC_COLORS = ["#6fb9f0", "#ffd67e", "#cb86db", "#8eee98", "#ff93b2", "#fb6f5f"];

const isTopicColor = (color: unknown): color is string => typeof color === "string" && TOPIC_COLORS.includes(color);

function toTopic(row: TopicRow | undefined): Topic | undefined {
  if (!row) return undefined;
  return {
    id: row.id,
    chatId: row.chatId,
    title: row.title,
    icon: row.icon ?? undefined,
    color: row.color ?? TOPIC_COLORS[0]!,
    closed: !!row.closed,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

// Темы групп — то же, что server/data/topics.js: у сообщения есть topicId, сообщения без
// него — тема «Общее», которая есть всегда и не удаляется.
@Injectable()
export class TopicsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public list(chatId: string): TopicWithStats[] {
    const rows = this.db.select().from(chatTopics).where(eq(chatTopics.chatId, chatId)).orderBy(asc(chatTopics.createdAt)).all();
    const stats = new Map(
      this.db
        .select({ topicId: messages.topicId, lastAt: max(messages.createdAt), n: count() })
        .from(messages)
        .where(and(eq(messages.chatId, chatId), isNotNull(messages.topicId), isNull(messages.threadRootId)))
        .groupBy(messages.topicId)
        .all()
        .map((r) => [r.topicId, r])
    );
    return rows.map((row) => {
      const t = toTopic(row)!;
      const s = stats.get(t.id);
      return { ...t, messageCount: s?.n ?? 0, lastMessageAt: s?.lastAt ?? t.createdAt };
    });
  }

  public findById(id: string): Topic | undefined {
    return toTopic(this.db.select().from(chatTopics).where(eq(chatTopics.id, id)).get());
  }

  public count(chatId: string): number {
    return this.db.select({ n: count() }).from(chatTopics).where(eq(chatTopics.chatId, chatId)).get()!.n;
  }

  /** Цвет не из палитры — следующий по кругу. */
  public create(chatId: string, input: { title: string; icon: string | null; color: unknown }, createdBy: string): Topic {
    const id = genId("topic");
    this.db
      .insert(chatTopics)
      .values({
        id,
        chatId,
        title: input.title,
        icon: input.icon ?? null,
        color: isTopicColor(input.color) ? input.color : TOPIC_COLORS[this.count(chatId) % TOPIC_COLORS.length]!,
        closed: 0,
        createdBy,
        createdAt: new Date().toISOString(),
      })
      .run();
    return this.findById(id)!;
  }

  /** Пустая иконка — убрать; цвет не из палитры — прежний. */
  public update(id: string, patch: TopicPatch): Topic | undefined {
    const current = this.findById(id);
    if (!current) return undefined;
    this.db
      .update(chatTopics)
      .set({
        title: patch.title ?? current.title,
        icon: patch.icon === undefined ? (current.icon ?? null) : patch.icon || null,
        color: isTopicColor(patch.color) ? patch.color : current.color,
        closed: patch.closed === undefined ? (current.closed ? 1 : 0) : patch.closed ? 1 : 0,
      })
      .where(eq(chatTopics.id, id))
      .run();
    return this.findById(id);
  }

  /** Удаляет тему вместе с её сообщениями — как в Telegram; возвращает id удалённых сообщений. */
  public delete(id: string): string[] {
    return this.db.transaction((tx) => {
      const ids = tx.select({ id: messages.id }).from(messages).where(eq(messages.topicId, id)).all().map((r) => r.id);
      tx.delete(messages).where(eq(messages.topicId, id)).run();
      tx.delete(chatTopics).where(eq(chatTopics.id, id)).run();
      return ids;
    });
  }
}
