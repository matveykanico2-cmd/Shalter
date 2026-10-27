import { Injectable } from "@nestjs/common";
import { GiftsRepository } from "./gifts.repository.js";
import { BUILTIN_BY_ID, BUILTIN_GIFTS, mergeOverride, ON_SALE_BUILTINS, ON_SALE_IDS, rowToGift, STARS_PER_RUB, withStars } from "./lib/gift-catalog.js";
import type { Gift } from "./model/domain.js";

export interface NewCatalogGift {
  id: string;
  emoji: string;
  name: string;
  priceStars: number;
  premiumDays: number | null;
  supply: number | null;
  exclusive: boolean;
  mediaUrl?: string;
  scene?: unknown;
  ownerId?: string | null;
}

// Каталог подарков: встроенные с правками админа, подарки админа и нарисованные
// пользователями — то же, что server/data/gifts.js и remaining() из giftIssues.js.
@Injectable()
export class GiftCatalogService {
  public constructor(private readonly gifts: GiftsRepository) {}

  /** Витрина; includeHidden — весь каталог для админа, со снятыми с продажи. */
  public list(includeHidden = false): Gift[] {
    const rows = new Map(this.gifts.listCatalogRows().map((row) => [row.id, row]));
    const merged = [];
    for (const g of includeHidden ? BUILTIN_GIFTS : ON_SALE_BUILTINS) {
      const row = rows.get(g.id);
      if (row?.hidden && !includeHidden) continue;
      merged.push(mergeOverride(g, row));
    }
    for (const row of rows.values()) {
      if (!row.custom || row.ownerId) continue;
      if (row.hidden && !includeHidden) continue;
      merged.push(rowToGift(row));
    }
    return merged.map(withStars);
  }

  /** Подарок каталога (с правкой админа) или выпущенный админом; нарисованные пользователями сюда не входят. */
  private find(id: unknown, includeHidden: boolean): Gift | undefined {
    if (typeof id !== "string") return undefined;
    const row = this.gifts.findCatalogRow(id);
    const builtin = BUILTIN_BY_ID.get(id);
    if (builtin) {
      if (!includeHidden && (!ON_SALE_IDS.has(id) || row?.hidden)) return undefined;
      return withStars(mergeOverride(builtin, row));
    }
    if (!row?.custom || row.ownerId || (row.hidden && !includeHidden)) return undefined;
    return withStars(rowToGift(row));
  }

  public isOnSale(id: unknown): boolean {
    return !!this.find(id, false);
  }

  /** Любой подарок каталога, и снятый с продажи. */
  public get(id: unknown): Gift | undefined {
    return this.find(id, true);
  }

  public listUserGifts(ownerId: string): Gift[] {
    return this.gifts.listUserGiftRows(ownerId).map((row) => withStars(rowToGift(row)));
  }

  public getUserGift(id: unknown, ownerId: string): Gift | undefined {
    if (typeof id !== "string") return undefined;
    const row = this.gifts.findUserGiftRow(id, ownerId);
    return row ? withStars(rowToGift(row)) : undefined;
  }

  /** Сколько экземпляров тиражного подарка осталось; у безлимитного — null. */
  public remaining(gift: Gift): number | null {
    if (!gift.supply) return null;
    return Math.max(0, gift.supply - this.gifts.issuedCount(gift.id));
  }

  public issuedCount(giftId: string): number {
    return this.gifts.issuedCount(giftId);
  }

  private exists(id: string): boolean {
    return BUILTIN_BY_ID.has(id) || !!this.gifts.findCatalogRow(id);
  }

  public setSupply(id: string, supply: number): Gift | undefined {
    if (!this.exists(id)) return undefined;
    this.gifts.upsertOverride(id, { supply });
    return this.get(id);
  }

  public setScene(id: string, scene: unknown): Gift | undefined {
    if (!this.exists(id)) return undefined;
    this.gifts.upsertOverride(id, { scene: scene ? JSON.stringify(scene) : null });
    return this.get(id);
  }

  public create(gift: NewCatalogGift): Gift | undefined {
    const ownerId = gift.ownerId ?? null;
    this.gifts.insert({
      id: gift.id,
      emoji: gift.emoji,
      name: gift.name,
      priceRub: Math.max(1, Math.round(gift.priceStars / STARS_PER_RUB)),
      priceStars: gift.priceStars,
      premiumDays: gift.premiumDays,
      supply: gift.supply ?? null,
      exclusive: gift.exclusive ? 1 : 0,
      mediaUrl: gift.mediaUrl ?? null,
      scene: gift.scene ? JSON.stringify(gift.scene) : null,
      ownerId,
      custom: 1,
      createdAt: new Date().toISOString(),
    });
    return ownerId ? this.getUserGift(gift.id, ownerId) : this.get(gift.id);
  }

  /** Нарисованный пользователем подарок: бесплатный, без Premium и тиража. */
  public createUserGift(gift: { id: string; ownerId: string; name: string; scene: unknown; emoji: string }): Gift | undefined {
    return this.create({ ...gift, priceStars: 0, premiumDays: 0, supply: null, exclusive: false });
  }

  public updateUserGift(id: string, ownerId: string, patch: { name?: string; scene?: unknown; emoji?: string }): Gift | undefined {
    const existing = this.gifts.findOwnedRow(id, ownerId);
    if (!existing) return undefined;
    this.gifts.update(id, {
      name: patch.name === undefined ? existing.name : patch.name.trim().slice(0, 60) || existing.name,
      scene: patch.scene === undefined ? existing.scene : JSON.stringify(patch.scene),
      emoji: patch.emoji === undefined ? existing.emoji : patch.emoji,
    });
    return this.getUserGift(id, ownerId);
  }

  public deleteUserGift(id: string, ownerId: string): boolean {
    return this.gifts.deleteOwned(id, ownerId);
  }

  public deleteCustom(id: string): boolean {
    return this.gifts.deleteCustom(id);
  }

  /** Снять встроенный подарок с продажи; не встроенный — false. */
  public hideBuiltin(id: string): boolean {
    if (!BUILTIN_BY_ID.has(id)) return false;
    this.gifts.upsertOverride(id, { hidden: 1 });
    return true;
  }

  public restore(id: string): boolean {
    return this.gifts.restore(id);
  }
}
