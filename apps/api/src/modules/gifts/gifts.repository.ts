import { Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, max } from "drizzle-orm";
import { InjectDb, type Db } from "../db/db.module.js";
import { giftCatalog, giftIssues } from "../db/schema.js";
import type { GiftCatalogRow, NewGiftCatalogRow } from "./model/domain.js";

// Таблицы gift_catalog (правки админа поверх встроенного каталога, подарки админа и
// нарисованные пользователями) и gift_issues (выданные экземпляры тиражных подарков) —
// как server/data/gifts.js и giftIssues.js.
@Injectable()
export class GiftsRepository {
  public constructor(@InjectDb() private readonly db: Db) {}

  public listCatalogRows(): GiftCatalogRow[] {
    return this.db.select().from(giftCatalog).all();
  }

  public findCatalogRow(id: string): GiftCatalogRow | undefined {
    return this.db.select().from(giftCatalog).where(eq(giftCatalog.id, id)).get();
  }

  /** Нарисованные подарки пользователя, новые сверху. */
  public listUserGiftRows(ownerId: string): GiftCatalogRow[] {
    return this.db
      .select()
      .from(giftCatalog)
      .where(and(eq(giftCatalog.ownerId, ownerId), eq(giftCatalog.hidden, 0)))
      .orderBy(desc(giftCatalog.createdAt))
      .all();
  }

  public findUserGiftRow(id: string, ownerId: string): GiftCatalogRow | undefined {
    return this.db
      .select()
      .from(giftCatalog)
      .where(and(eq(giftCatalog.id, id), eq(giftCatalog.ownerId, ownerId), eq(giftCatalog.hidden, 0)))
      .get();
  }

  public insert(row: NewGiftCatalogRow): void {
    this.db.insert(giftCatalog).values(row).run();
  }

  public update(id: string, patch: Partial<NewGiftCatalogRow>): void {
    this.db.update(giftCatalog).set(patch).where(eq(giftCatalog.id, id)).run();
  }

  /** Правка встроенного подарка: строка-заглушка создаётся при первой правке. */
  public upsertOverride(id: string, patch: Pick<NewGiftCatalogRow, "supply" | "scene" | "hidden">): void {
    if (this.findCatalogRow(id)) {
      this.update(id, patch);
      return;
    }
    this.insert({
      id,
      emoji: null,
      name: null,
      priceRub: null,
      premiumDays: null,
      supply: null,
      exclusive: 0,
      custom: 0,
      createdAt: new Date().toISOString(),
      ...patch,
    });
  }

  public findOwnedRow(id: string, ownerId: string): GiftCatalogRow | undefined {
    return this.db
      .select()
      .from(giftCatalog)
      .where(and(eq(giftCatalog.id, id), eq(giftCatalog.ownerId, ownerId)))
      .get();
  }

  public deleteOwned(id: string, ownerId: string): boolean {
    return this.db.delete(giftCatalog).where(and(eq(giftCatalog.id, id), eq(giftCatalog.ownerId, ownerId))).run().changes > 0;
  }

  /** Подарок, выпущенный админом (не пользователем). */
  public deleteCustom(id: string): boolean {
    const row = this.db
      .select({ id: giftCatalog.id })
      .from(giftCatalog)
      .where(and(eq(giftCatalog.id, id), eq(giftCatalog.custom, 1), isNull(giftCatalog.ownerId)))
      .get();
    if (!row) return false;
    this.db.delete(giftCatalog).where(eq(giftCatalog.id, id)).run();
    return true;
  }

  public restore(id: string): boolean {
    return this.db.update(giftCatalog).set({ hidden: 0 }).where(eq(giftCatalog.id, id)).run().changes > 0;
  }

  /** Сколько экземпляров выдано: наибольший номер. */
  public issuedCount(giftId: string): number {
    return this.db.select({ maxSerial: max(giftIssues.serial) }).from(giftIssues).where(eq(giftIssues.giftId, giftId)).get()?.maxSerial ?? 0;
  }

  /** Следующий номер тиража; null — тираж разобран. Атомарно, как claimSerial. */
  public claimSerial(gift: { id: string; supply: number }, recipientId: string, fromId: string | null): number | null {
    return this.db.transaction((tx) => {
      const issued = tx.select({ maxSerial: max(giftIssues.serial) }).from(giftIssues).where(eq(giftIssues.giftId, gift.id)).get()?.maxSerial ?? 0;
      if (issued >= gift.supply) return null;
      const serial = issued + 1;
      tx.insert(giftIssues)
        .values({
          id: `gi_${Date.now()}_${gift.id}_${serial}`,
          giftId: gift.id,
          serial,
          recipientId,
          fromId,
          issuedAt: new Date().toISOString(),
        })
        .run();
      return serial;
    });
  }
}
