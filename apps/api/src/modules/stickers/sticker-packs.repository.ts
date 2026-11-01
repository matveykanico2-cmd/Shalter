import { Injectable } from "@nestjs/common";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { stickerPackInstalls, stickerPacks } from "../db/schema.js";
import type { StickerPack, StickerPackRow } from "./model/domain.js";

// Стикерпаки — как server/data/stickerPacks.js. Стикеры — JSON-список в строке пака.
// Чужие паки, добавленные себе, — в sticker_pack_installs.
@Injectable()
export class StickerPacksRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public listForOwner(ownerId: string): StickerPack[] {
    return this.db.select().from(stickerPacks).where(eq(stickerPacks.ownerId, ownerId)).orderBy(asc(stickerPacks.createdAt)).all().map(toPack);
  }

  /** Добавленные себе чужие паки — в порядке добавления. */
  public listInstalled(userId: string): StickerPack[] {
    const rows = this.db
      .select({ pack: stickerPacks })
      .from(stickerPackInstalls)
      .innerJoin(stickerPacks, eq(stickerPacks.id, stickerPackInstalls.packId))
      .where(eq(stickerPackInstalls.userId, userId))
      .orderBy(asc(stickerPackInstalls.addedAt))
      .all();
    return rows.map((r) => toPack(r.pack));
  }

  public isInstalled(userId: string, packId: string): boolean {
    return !!this.db
      .select({ packId: stickerPackInstalls.packId })
      .from(stickerPackInstalls)
      .where(and(eq(stickerPackInstalls.userId, userId), eq(stickerPackInstalls.packId, packId)))
      .get();
  }

  public countInstalled(userId: string): number {
    return this.db.select({ n: count() }).from(stickerPackInstalls).where(eq(stickerPackInstalls.userId, userId)).get()?.n ?? 0;
  }

  public install(userId: string, packId: string, addedAt: string): void {
    this.db.insert(stickerPackInstalls).values({ userId, packId, addedAt }).onConflictDoNothing().run();
  }

  public uninstall(userId: string, packId: string): void {
    this.db.delete(stickerPackInstalls).where(and(eq(stickerPackInstalls.userId, userId), eq(stickerPackInstalls.packId, packId))).run();
  }

  /** Паки по id (для проверки стикера в сообщении). */
  public findMany(ids: string[]): StickerPack[] {
    if (!ids.length) return [];
    return this.db.select().from(stickerPacks).where(inArray(stickerPacks.id, ids)).all().map(toPack);
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

  public update(id: string, set: Pick<StickerPackRow, "name" | "stickers" | "description">): StickerPack {
    this.db.update(stickerPacks).set(set).where(eq(stickerPacks.id, id)).run();
    return this.find(id)!;
  }

  public delete(id: string, ownerId: string): boolean {
    const deleted = this.db.delete(stickerPacks).where(and(eq(stickerPacks.id, id), eq(stickerPacks.ownerId, ownerId))).run().changes > 0;
    if (deleted) this.db.delete(stickerPackInstalls).where(eq(stickerPackInstalls.packId, id)).run();
    return deleted;
  }
}

function toPack(row: StickerPackRow): StickerPack {
  let stickers: unknown[];
  try {
    stickers = JSON.parse(row.stickers ?? "[]");
  } catch {
    stickers = [];
  }
  return { id: row.id, ownerId: row.ownerId, name: row.name, description: row.description ?? "", stickers, createdAt: row.createdAt };
}
