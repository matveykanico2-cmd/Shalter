import { Injectable } from "@nestjs/common";
import { InjectDb, type Db } from "../db/db.module.js";
import { postViews } from "../db/schema.js";

// Кто уже смотрел пост канала — server/data/postViews.js.
@Injectable()
export class PostViewsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  /** true — просмотр новый (этот человек пост ещё не смотрел). */
  public record(postId: string, userId: string): boolean {
    const res = this.db.insert(postViews).values({ postId, userId, viewedAt: new Date().toISOString() }).onConflictDoNothing().run();
    return res.changes > 0;
  }
}
