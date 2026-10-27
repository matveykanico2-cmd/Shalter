import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../../../common/config/paths.js";
import type { BuiltinGift, Gift, GiftCatalogRow } from "../model/domain.js";

// Каталог подарков — как server/data/gifts.js: встроенные подарки из server/data/catalog/gifts.json,
// правки админа и выпущенные им подарки — в таблице gift_catalog. Список витрины —
// server/data/catalog/gifts-on-sale.json, его читают оба бэкенда.
const CATALOG_DIR = path.join(REPO_ROOT, "server", "data", "catalog");
const readJson = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, name), "utf8"));

export const BUILTIN_GIFTS: readonly BuiltinGift[] = readJson<BuiltinGift[]>("gifts.json");
export const BUILTIN_BY_ID = new Map(BUILTIN_GIFTS.map((g) => [g.id, g]));
export const ON_SALE_IDS: ReadonlySet<string> = new Set(readJson<string[]>("gifts-on-sale.json"));
/** Подарки витрины в порядке каталога. */
export const ON_SALE_BUILTINS = BUILTIN_GIFTS.filter((g) => ON_SALE_IDS.has(g.id));

export const SUPPLY_MIN = 1000;
export const SUPPLY_MAX = 1000000;
export const STARS_PER_RUB = 10;

export function starPrice(gift: { priceStars?: number | null; priceRub: number }): number {
  return Math.max(1, Math.round(gift.priceStars ?? gift.priceRub * STARS_PER_RUB));
}

/** Сколько звёзд дают за подарок на полке — полная цена. */
export const conversionValue = starPrice;

const parseScene = (scene: string | null): unknown => {
  try {
    return scene ? JSON.parse(scene) : undefined;
  } catch {
    return undefined;
  }
};

/** Подарок из строки gift_catalog (rowToGift). */
export function rowToGift(row: GiftCatalogRow): BuiltinGift {
  return {
    id: row.id,
    emoji: row.emoji!,
    name: row.name!,
    priceRub: row.priceRub!,
    priceStars: row.priceStars ?? undefined,
    premiumDays: row.premiumDays === null ? null : row.premiumDays,
    supply: row.supply ?? undefined,
    exclusive: row.exclusive ? true : undefined,
    mediaUrl: row.mediaUrl ?? undefined,
    scene: parseScene(row.scene),
    ownerId: row.ownerId ?? undefined,
    hidden: row.hidden ? true : undefined,
    custom: true,
  };
}

/** Встроенный подарок с правкой админа (тираж, скрытие, сцена). */
export function mergeOverride(g: BuiltinGift, row: GiftCatalogRow | undefined): BuiltinGift {
  if (!row) return g;
  const scene = parseScene(row.scene);
  return {
    ...g,
    supply: row.supply ?? g.supply,
    edited: true,
    ...(row.hidden ? { hidden: true as const } : {}),
    ...(row.scene && scene !== undefined ? { scene } : {}),
  };
}

export function withStars(g: BuiltinGift): Gift {
  return { ...g, priceStars: starPrice(g) };
}

/** Тираж эксклюзива из запроса (parseSupply). */
export function parseSupply(value: unknown): { value: number; error?: undefined } | { error: string } {
  const n = Number(value);
  if (!Number.isInteger(n)) return { error: "Тираж должен быть целым числом" };
  if (n < SUPPLY_MIN || n > SUPPLY_MAX) {
    return { error: `Тираж эксклюзива — от ${SUPPLY_MIN.toLocaleString("ru-RU")} до ${SUPPLY_MAX.toLocaleString("ru-RU")}` };
  }
  return { value: n };
}

/** id из названия подарка: латиница, кириллица и цифры, остальное — «_». */
export const giftSlug = (name: string, max: number): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "_")
    .replace(/^_|_$/g, "")
    .slice(0, max) || "gift";
