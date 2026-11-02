import { Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, exists, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { stickerPacks, stickers, userStickerPacks } from "../db/schema.js";
import type { Sticker, StickerPack, StickerPackRow, StickerRow } from "./model/domain.js";

@Injectable()
export class StickerPacksRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  /** Паки, доступные пользователю: его собственные и добавленные в коллекцию. */
  public listForViewer(viewerId: string): StickerPack[] {
    const rows = this.db
      .select({
        id: stickerPacks.id,
        ownerId: stickerPacks.ownerId,
        name: stickerPacks.name,
        description: stickerPacks.description,
        coverStickerId: stickerPacks.coverStickerId,
        createdAt: stickerPacks.createdAt,
        addedUserId: userStickerPacks.userId,
      })
      .from(stickerPacks)
      .leftJoin(
        userStickerPacks,
        and(eq(userStickerPacks.packId, stickerPacks.id), eq(userStickerPacks.userId, viewerId))
      )
      .where(or(eq(stickerPacks.ownerId, viewerId), isNotNull(userStickerPacks.userId)))
      .orderBy(asc(stickerPacks.createdAt))
      .all();

    // Один пак — одна строка, даже если join вернул его дважды.
    const seen = new Set<string>();
    const unique = rows.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
    const packIds = unique.map((row) => row.id);
    const stickersByPack = packIds.length ? this.stickersFor(packIds) : {};

    return unique.map((row) => {
      const packStickers = stickersByPack[row.id] ?? [];
      return {
        id: row.id,
        ownerId: row.ownerId,
        name: row.name,
        description: row.description,
        createdAt: row.createdAt,
        stickers: packStickers.map(toSticker),
        stickerCount: packStickers.length,
        isAdded: row.addedUserId != null,
        isOwner: row.ownerId === viewerId,
        ...coverOf(row.coverStickerId, packStickers),
      };
    });
  }

  /** Один пак со стикерами и флагом коллекции для пользователя (viewerId может быть undefined). */
  public findPack(id: string, viewerId?: string): StickerPack | undefined {
    const row = this.db.select().from(stickerPacks).where(eq(stickerPacks.id, id)).get();
    if (!row) return undefined;
    const added = viewerId
      ? !!this.db
          .select()
          .from(userStickerPacks)
          .where(and(eq(userStickerPacks.packId, id), eq(userStickerPacks.userId, viewerId)))
          .get()
      : false;
    const packStickers = this.stickersFor([id])[id] ?? [];
    return {
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
      stickers: packStickers.map(toSticker),
      stickerCount: packStickers.length,
      isAdded: added,
      isOwner: row.ownerId === (viewerId ?? ""),
      ...coverOf(row.coverStickerId, packStickers),
    };
  }

  public createPack(row: StickerPackRow): StickerPack {
    this.db.insert(stickerPacks).values(row).run();
    const pack = this.findPack(row.id, row.ownerId);
    if (!pack) throw new Error(`Не удалось создать пак ${row.id}`);
    return pack;
  }

  /**
   * «Популярные»: чужие непустые паки по числу пользователей, добавивших их в коллекцию
   * (при равенстве — новее выше), не больше limit.
   */
  public popular(viewerId: string, limit: number): StickerPack[] {
    const added = count(userStickerPacks.userId);
    const rows = this.db
      .select({
        id: stickerPacks.id,
        ownerId: stickerPacks.ownerId,
        name: stickerPacks.name,
        description: stickerPacks.description,
        coverStickerId: stickerPacks.coverStickerId,
        createdAt: stickerPacks.createdAt,
        added,
      })
      .from(stickerPacks)
      .leftJoin(userStickerPacks, eq(userStickerPacks.packId, stickerPacks.id))
      // Пустые паки отсекаем в SQL и берём не больше limit — без прохода по всей таблице.
      .where(and(ne(stickerPacks.ownerId, viewerId), exists(this.db.select({ one: sql`1` }).from(stickers).where(eq(stickers.packId, stickerPacks.id)))))
      .groupBy(stickerPacks.id)
      .orderBy(desc(added), desc(stickerPacks.createdAt))
      .limit(limit)
      .all();
    if (!rows.length) return [];
    // Стикеры и «добавлен ли у меня» — одним запросом на все паки, а не по пакету на строку.
    const ids = rows.map((row) => row.id);
    const stickersByPack = this.stickersFor(ids);
    const mine = new Set(
      this.db
        .select({ packId: userStickerPacks.packId })
        .from(userStickerPacks)
        .where(and(eq(userStickerPacks.userId, viewerId), inArray(userStickerPacks.packId, ids)))
        .all()
        .map((r) => r.packId)
    );
    return rows.map((row) => {
      const packStickers = stickersByPack[row.id] ?? [];
      return {
        id: row.id,
        ownerId: row.ownerId,
        name: row.name,
        description: row.description,
        createdAt: row.createdAt,
        stickers: packStickers.map(toSticker),
        stickerCount: packStickers.length,
        isAdded: mine.has(row.id),
        isOwner: false,
        addedCount: row.added,
        ...coverOf(row.coverStickerId, packStickers),
      };
    });
  }

  public updatePack(id: string, set: { name?: string; description?: string | null; coverStickerId?: string | null }): StickerPack {
    const update: Record<string, unknown> = {};
    if (set.coverStickerId !== undefined) update.coverStickerId = set.coverStickerId;
    if (set.name !== undefined) update.name = set.name;
    if (set.description !== undefined) update.description = set.description;
    this.db.update(stickerPacks).set(update).where(eq(stickerPacks.id, id)).run();
    const pack = this.findPack(id);
    if (!pack) throw new Error(`Не удалось обновить пак ${id}`);
    return pack;
  }

  public deletePack(id: string, ownerId: string): boolean {
    return this.db.delete(stickerPacks).where(and(eq(stickerPacks.id, id), eq(stickerPacks.ownerId, ownerId))).run().changes > 0;
  }

  /** Добавить стикер в пак (только владелец). */
  public addSticker(row: StickerRow): Sticker {
    this.db.insert(stickers).values(row).run();
    return toSticker(row);
  }

  /** Изменить эмодзи и/или позицию стикера (только владелец пака). */
  public updateSticker(stickerId: string, packId: string, set: { emoji?: string; position?: number }): Sticker {
    const update: Record<string, unknown> = {};
    if (set.emoji !== undefined) update.emoji = set.emoji;
    if (set.position !== undefined) update.position = set.position;
    this.db.update(stickers).set(update).where(and(eq(stickers.id, stickerId), eq(stickers.packId, packId))).run();
    const row = this.db.select().from(stickers).where(eq(stickers.id, stickerId)).get();
    if (!row) throw new Error(`Стикер ${stickerId} не найден`);
    return toSticker(row);
  }

  /** Стикер пака с этим файлом, если он уже добавлен. */
  public findStickerByFile(packId: string, file: string): Sticker | undefined {
    const row = this.db.select().from(stickers).where(and(eq(stickers.packId, packId), eq(stickers.file, file))).get();
    return row ? toSticker(row) : undefined;
  }

  /** Файл лежит в каком-нибудь паке — значит, он и так открыт всем (uploadAccess, stickers.file). */
  public isStickerFile(file: string): boolean {
    return !!this.db.select({ id: stickers.id }).from(stickers).where(eq(stickers.file, file)).get();
  }

  /** Удалить стикер из пака (только владелец пака). */
  public deleteSticker(stickerId: string, packId: string): boolean {
    return this.db.delete(stickers).where(and(eq(stickers.id, stickerId), eq(stickers.packId, packId))).run().changes > 0;
  }

  /** Добавить пак в коллекцию пользователя. */
  public addToCollection(userId: string, packId: string): void {
    this.db.insert(userStickerPacks).values({ userId, packId, addedAt: new Date().toISOString() }).onConflictDoNothing().run();
  }

  /** Убрать пак из коллекции пользователя. */
  public removeFromCollection(userId: string, packId: string): boolean {
    return this.db.delete(userStickerPacks).where(and(eq(userStickerPacks.userId, userId), eq(userStickerPacks.packId, packId))).run().changes > 0;
  }

  /** В коллекции ли пак у пользователя. */
  public isAdded(userId: string, packId: string): boolean {
    return !!this.db.select().from(userStickerPacks).where(and(eq(userStickerPacks.userId, userId), eq(userStickerPacks.packId, packId))).get();
  }

  /** Стикеры нескольких паков, сгруппированные по packId. */
  private stickersFor(packIds: string[]): Record<string, StickerRow[]> {
    const rows = this.db
      .select()
      .from(stickers)
      .where(inArray(stickers.packId, packIds))
      .orderBy(asc(stickers.position))
      .all();
    const out: Record<string, StickerRow[]> = {};
    // Один и тот же файл в паке — один стикер (старые дубли не показываем).
    const files = new Set<string>();
    for (const row of rows) {
      const key = `${row.packId}\n${row.file}`;
      if (files.has(key)) continue;
      files.add(key);
      (out[row.packId] ??= []).push(row);
    }
    return out;
  }
}

/** Обложка пака: выбранный стикер (если он ещё в паке), иначе первый, иначе нет. */
function coverOf(coverStickerId: string | null, packStickers: StickerRow[]): { coverStickerId: string | null; cover: string | null } {
  const chosen = coverStickerId ? packStickers.find((st) => st.id === coverStickerId) : undefined;
  return { coverStickerId: chosen ? chosen.id : null, cover: (chosen ?? packStickers[0])?.file ?? null };
}

function toSticker(row: StickerRow): Sticker {
  return { id: row.id, packId: row.packId, url: row.file, emoji: row.emoji, position: row.position, createdAt: row.createdAt };
}
