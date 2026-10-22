import { Injectable } from "@nestjs/common";
import { count, desc, eq } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { customEmoji } from "../db/schema.js";
import type { CustomEmoji, CustomEmojiRow } from "./model/domain.js";

// Каталог своих эмодзи — как server/data/customEmoji.js. Сцена — JSON в строке.
@Injectable()
export class CustomEmojiRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  /** Новые — первыми. */
  public listAll(): CustomEmoji[] {
    return this.db.select().from(customEmoji).orderBy(desc(customEmoji.createdAt)).all().map(toEmoji);
  }

  public count(): number {
    return this.db.select({ c: count() }).from(customEmoji).get()!.c;
  }

  public findRow(id: string): CustomEmojiRow | undefined {
    return this.db.select().from(customEmoji).where(eq(customEmoji.id, id)).get();
  }

  public create(row: CustomEmojiRow): CustomEmoji {
    this.db.insert(customEmoji).values(row).run();
    return toEmoji(this.findRow(row.id)!);
  }

  public update(id: string, set: Pick<CustomEmojiRow, "name" | "scene">): CustomEmoji {
    this.db.update(customEmoji).set(set).where(eq(customEmoji.id, id)).run();
    return toEmoji(this.findRow(id)!);
  }

  public delete(id: string): boolean {
    return this.db.delete(customEmoji).where(eq(customEmoji.id, id)).run().changes > 0;
  }
}

function toEmoji(row: CustomEmojiRow): CustomEmoji {
  let scene: unknown;
  try {
    scene = JSON.parse(row.scene);
  } catch {
    scene = null;
  }
  return { id: row.id, name: row.name, scene, createdAt: row.createdAt };
}
