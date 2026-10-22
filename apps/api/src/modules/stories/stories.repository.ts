import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { stories, storyComments } from "../db/schema.js";
import { toggleId, toStory, toStoryComment } from "./lib/story.mapper.js";
import type { NewStory, NewStoryComment, Story, StoryComment } from "./model/domain.js";

// Истории и комментарии к ним — то же, что server/data/stories.js, на тех же таблицах.
@Injectable()
export class StoriesRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  /** Неистёкшие истории этих авторов, в порядке таблицы (как listStoriesForUsers). */
  public listActiveFor(authorIds: string[]): Story[] {
    const authors = new Set(authorIds);
    return this.db
      .select()
      .from(stories)
      .where(gt(stories.expiresAt, new Date().toISOString()))
      .all()
      .map(toStory)
      .filter((s) => authors.has(s.userId));
  }

  /** История, если она ещё не истекла. */
  public findActive(id: string): Story | undefined {
    const story = this.findById(id);
    return story && story.expiresAt > new Date().toISOString() ? story : undefined;
  }

  /** Все истории автора, и истёкшие, новые первыми. */
  public listArchivedFor(userId: string): Story[] {
    return this.db.select().from(stories).where(eq(stories.userId, userId)).orderBy(desc(stories.createdAt)).all().map(toStory);
  }

  public findById(id: string): Story | undefined {
    const row = this.db.select().from(stories).where(eq(stories.id, id)).get();
    return row && toStory(row);
  }

  public create(story: NewStory): Story {
    this.db
      .insert(stories)
      .values({
        id: story.id,
        userId: story.userId,
        kind: story.items[0]!.kind,
        url: story.items[0]!.url,
        items: JSON.stringify(story.items),
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
        viewedByIds: "[]",
      })
      .run();
    return this.findById(story.id)!;
  }

  public markViewed(id: string, viewerId: string): Story | undefined {
    const story = this.findById(id);
    if (!story) return undefined;
    if (!story.viewedByIds.includes(viewerId)) {
      this.db
        .update(stories)
        .set({ viewedByIds: JSON.stringify([...story.viewedByIds, viewerId]) })
        .where(eq(stories.id, id))
        .run();
    }
    return this.findById(id);
  }

  /** Поля поверх одного элемента истории (обработанное видео из фонового процесса). */
  public updateItem(id: string, index: number, patch: Record<string, unknown>): Story | undefined {
    const story = this.findById(id);
    if (!story) return undefined;
    const items = story.items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    this.db.update(stories).set({ items: JSON.stringify(items) }).where(eq(stories.id, id)).run();
    return this.findById(id);
  }

  public toggleLike(id: string, userId: string): Story | undefined {
    const story = this.findById(id);
    if (!story) return undefined;
    this.db
      .update(stories)
      .set({ likedByIds: JSON.stringify(toggleId(story.likedByIds, userId)) })
      .where(eq(stories.id, id))
      .run();
    return this.findById(id);
  }

  /** false — истории нет (или она чужая). */
  public delete(id: string, userId: string): boolean {
    return this.db.delete(stories).where(and(eq(stories.id, id), eq(stories.userId, userId))).run().changes > 0;
  }

  public listComments(storyId: string): StoryComment[] {
    return this.db.select().from(storyComments).where(eq(storyComments.storyId, storyId)).orderBy(asc(storyComments.createdAt)).all().map(toStoryComment);
  }

  public findComment(id: string): StoryComment | undefined {
    const row = this.db.select().from(storyComments).where(eq(storyComments.id, id)).get();
    return row && toStoryComment(row);
  }

  public addComment(comment: NewStoryComment): StoryComment {
    this.db.insert(storyComments).values(comment).run();
    return this.findComment(comment.id)!;
  }

  public editComment(id: string, text: string): StoryComment | undefined {
    this.db.update(storyComments).set({ text, editedAt: new Date().toISOString() }).where(eq(storyComments.id, id)).run();
    return this.findComment(id);
  }

  public deleteComment(id: string): void {
    this.db.delete(storyComments).where(eq(storyComments.id, id)).run();
  }

  public toggleCommentLike(id: string, userId: string): StoryComment | undefined {
    const comment = this.findComment(id);
    if (!comment) return undefined;
    this.db
      .update(storyComments)
      .set({ likedByIds: JSON.stringify(toggleId(comment.likedByIds, userId)) })
      .where(eq(storyComments.id, id))
      .run();
    return this.findComment(id);
  }
}
