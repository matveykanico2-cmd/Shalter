import { Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { stickerPacks } from "../db/schema.js";
import type { StickerPack, StickerPackRow } from "./model/domain.js";

// Свои стикерпаки — как server/data/stickerPacks.js. Стикеры — JSON-список в строке пака.
@Injectable()
export class StickerPacksRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public listForOwner(ownerId: string): StickerPack[] {
    return this.db.select().from(stickerPacks).where(eq(stickerPacks.ownerId, ownerId)).orderBy(asc(stickerPacks.createdAt)).all().map(toPack);
  }

  public find(id: string): StickerPack | undefined {
    const row = this.db.select().from(stickerPacks).where(eq(stickerPacks.id, id)).get();
    return row && toPack(row);
  }

  /** Строка пака как есть: стикеры остаются JSON-строкой. */
  public findOwnedRow(id: string, ownerId: string): StickerPackRow | undefined {
    return this.db.select().from(stickerPacks).where(and(eq(stickerPacks.id, id), eq(stickerPacks.ownerId, ownerId))).get();
  }

  public create(row: StickerPackRow): StickerPack {
    this.db.insert(stickerPacks).values(row).run();
    return this.find(row.id)!;
  }

  public update(id: string, set: Pick<StickerPackRow, "name" | "stickers">): StickerPack {
    this.db.update(stickerPacks).set(set).where(eq(stickerPacks.id, id)).run();
    return this.find(id)!;
  }

  public delete(id: string, ownerId: string): boolean {
    return this.db.delete(stickerPacks).where(and(eq(stickerPacks.id, id), eq(stickerPacks.ownerId, ownerId))).run().changes > 0;
  }
}

function toPack(row: StickerPackRow): StickerPack {
  let stickers: unknown[];
  try {
    stickers = JSON.parse(row.stickers ?? "[]");
  } catch {
    stickers = [];
  }
  return { id: row.id, ownerId: row.ownerId, name: row.name, stickers, createdAt: row.createdAt };
}
