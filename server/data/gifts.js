// Встроенный каталог — данные, а не код: server/data/catalog/gifts.json, по записи
// на строку. Его пишут генераторы (scripts/generate-crab-gifts.js); правки админа
// хранятся поверх, в таблице gift_catalog.
const GIFTS = require("./catalog/gifts.json");
const BUILTIN_BY_ID = new Map(GIFTS.map((g) => [g.id, g]));

const db = require("../db");

const SUPPLY_MIN = 1000;
const SUPPLY_MAX = 1000000;

const STARS_PER_RUB = 10;

function starPrice(gift) {
  return Math.max(1, Math.round((gift.priceStars ?? gift.priceRub * STARS_PER_RUB)));
}

function conversionValue(gift) {
  return starPrice(gift);
}

function rowToGift(row) {
  return {
    id: row.id,
    emoji: row.emoji,
    name: row.name,
    priceRub: row.priceRub,
    priceStars: row.priceStars ?? undefined,
    premiumDays: row.premiumDays === null ? null : row.premiumDays,
    supply: row.supply ?? undefined,
    exclusive: !!row.exclusive || undefined,
    mediaUrl: row.mediaUrl ?? undefined,
    scene: (() => { try { return row.scene ? JSON.parse(row.scene) : undefined; } catch { return undefined; } })(),
    ownerId: row.ownerId ?? undefined,
    hidden: !!row.hidden || undefined,
    custom: true,
  };
}

function overrides() {
  const map = new Map();
  for (const row of db.prepare("SELECT * FROM gift_catalog").all()) map.set(row.id, row);
  return map;
}

function withStars(g) {
  return { ...g, priceStars: starPrice(g) };
}

// В витрине — только подарки с анимациями (public/tgs: из tweb и анимированные эмодзи). Остальные встроенные
// сняты с продажи: уже подаренные остаются у людей, админ видит их в каталоге (includeHidden).
// Список — catalog/gifts-on-sale.json (его же читает apps/api): подарки tweb, «Утёнок на отдыхе»
// (своей анимации в tweb нет — рисуется встроенной сценой public/gift-scenes/<id>.json, см.
// scripts/gift-scenes.js), анимированные эмодзи (public/tgs/emoji) и подарки с крабом для дней рождения.
const TWEB_GIFT_IDS = new Set(require("./catalog/gifts-on-sale.json"));

// Подарки витрины в порядке каталога — считается один раз, а не на каждый запрос.
const ON_SALE_BUILTINS = GIFTS.filter((g) => TWEB_GIFT_IDS.has(g.id));

function mergeOverride(g, row) {
  if (!row) return g;
  return {
    ...g,
    supply: row.supply ?? g.supply,
    edited: true,
    ...(row.hidden ? { hidden: true } : {}),
    ...(row.scene ? (() => { try { return { scene: JSON.parse(row.scene) }; } catch { return {}; } })() : {}),
  };
}

function listGifts({ includeHidden = false } = {}) {
  const rows = overrides();
  const merged = [];
  for (const g of includeHidden ? GIFTS : ON_SALE_BUILTINS) {
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

function catalogRow(id) {
  return db.prepare("SELECT * FROM gift_catalog WHERE id = ?").get(id);
}

// То же, что поиск в listGifts(): встроенный подарок с правкой админа или подарок,
// выпущенный админом (подарки пользователей сюда не входят).
function findGift(id, { includeHidden }) {
  if (typeof id !== "string") return undefined;
  const row = catalogRow(id);
  const builtin = BUILTIN_BY_ID.get(id);
  if (builtin) {
    if (!includeHidden && (!TWEB_GIFT_IDS.has(id) || row?.hidden)) return undefined;
    return withStars(mergeOverride(builtin, row));
  }
  if (!row?.custom || row.ownerId || (row.hidden && !includeHidden)) return undefined;
  return withStars(rowToGift(row));
}

function isOnSale(id) {
  return !!findGift(id, { includeHidden: false });
}

function getGift(id) {
  return findGift(id, { includeHidden: true });
}

function listUserGifts(ownerId) {
  return db
    .prepare("SELECT * FROM gift_catalog WHERE ownerId = ? AND hidden = 0 ORDER BY createdAt DESC")
    .all(ownerId)
    .map((row) => withStars(rowToGift(row)));
}

function getUserGift(id, ownerId) {
  const row = db.prepare("SELECT * FROM gift_catalog WHERE id = ? AND ownerId = ? AND hidden = 0").get(id, ownerId);
  return row ? withStars(rowToGift(row)) : undefined;
}

function setSupply(id, supply) {
  const builtin = BUILTIN_BY_ID.get(id);
  const existing = db.prepare("SELECT * FROM gift_catalog WHERE id = ?").get(id);
  if (!builtin && !existing) return undefined;
  if (existing) {
    db.prepare("UPDATE gift_catalog SET supply = ? WHERE id = ?").run(supply, id);
  } else {
    db.prepare(
      `INSERT INTO gift_catalog (id, emoji, name, priceRub, premiumDays, supply, exclusive, custom, createdAt)
       VALUES (@id, NULL, NULL, NULL, NULL, @supply, 0, 0, @createdAt)`
    ).run({ id, supply, createdAt: new Date().toISOString() });
  }
  return getGift(id);
}

function setGiftScene(id, scene) {
  const builtin = BUILTIN_BY_ID.get(id);
  const existing = db.prepare("SELECT * FROM gift_catalog WHERE id = ?").get(id);
  if (!builtin && !existing) return undefined;
  const sceneJson = scene ? JSON.stringify(scene) : null;
  if (existing) {
    db.prepare("UPDATE gift_catalog SET scene = ? WHERE id = ?").run(sceneJson, id);
  } else {
    db.prepare(
      `INSERT INTO gift_catalog (id, emoji, name, priceRub, premiumDays, supply, exclusive, custom, scene, createdAt)
       VALUES (@id, NULL, NULL, NULL, NULL, NULL, 0, 0, @scene, @createdAt)`
    ).run({ id, scene: sceneJson, createdAt: new Date().toISOString() });
  }
  return getGift(id);
}

function createGift({ id, emoji, name, priceStars, premiumDays, supply, exclusive, mediaUrl, scene = null, ownerId = null }) {
  db.prepare(
    `INSERT INTO gift_catalog (id, emoji, name, priceRub, priceStars, premiumDays, supply, exclusive, mediaUrl, scene, ownerId, custom, createdAt)
     VALUES (@id, @emoji, @name, @priceRub, @priceStars, @premiumDays, @supply, @exclusive, @mediaUrl, @scene, @ownerId, 1, @createdAt)`
  ).run({
    id,
    emoji,
    name,
    priceRub: Math.max(1, Math.round(priceStars / STARS_PER_RUB)),
    priceStars,
    premiumDays: premiumDays === null ? null : premiumDays,
    supply: supply ?? null,
    exclusive: exclusive ? 1 : 0,
    mediaUrl: mediaUrl ?? null,
    scene: scene ? JSON.stringify(scene) : null,
    ownerId: ownerId ?? null,
    createdAt: new Date().toISOString(),
  });
  return ownerId ? getUserGift(id, ownerId) : getGift(id);
}

function createUserGift({ id, ownerId, name, scene, emoji }) {
  return createGift({
    id,
    ownerId,
    emoji,
    name,
    priceStars: 0,
    premiumDays: 0,
    supply: null,
    exclusive: false,
    scene,
  });
}

function updateUserGift(id, ownerId, { name, scene, emoji }) {
  const existing = db.prepare("SELECT * FROM gift_catalog WHERE id = ? AND ownerId = ?").get(id, ownerId);
  if (!existing) return undefined;
  db.prepare("UPDATE gift_catalog SET name = ?, scene = ?, emoji = ? WHERE id = ?").run(
    name === undefined ? existing.name : String(name).trim().slice(0, 60) || existing.name,
    scene === undefined ? existing.scene : JSON.stringify(scene),
    emoji === undefined ? existing.emoji : emoji,
    id
  );
  return getUserGift(id, ownerId);
}

function deleteUserGift(id, ownerId) {
  const res = db.prepare("DELETE FROM gift_catalog WHERE id = ? AND ownerId = ?").run(id, ownerId);
  return res.changes > 0;
}

function deleteCustomGift(id) {
  const row = db.prepare("SELECT * FROM gift_catalog WHERE id = ? AND custom = 1 AND ownerId IS NULL").get(id);
  if (!row) return false;
  db.prepare("DELETE FROM gift_catalog WHERE id = ?").run(id);
  return true;
}

function hideBuiltin(id) {
  const builtin = BUILTIN_BY_ID.get(id);
  if (!builtin) return false;
  const existing = db.prepare("SELECT * FROM gift_catalog WHERE id = ?").get(id);
  if (existing) db.prepare("UPDATE gift_catalog SET hidden = 1 WHERE id = ?").run(id);
  else
    db.prepare(
      `INSERT INTO gift_catalog (id, emoji, name, priceRub, premiumDays, supply, exclusive, custom, hidden, createdAt)
       VALUES (@id, NULL, NULL, NULL, NULL, NULL, 0, 0, 1, @createdAt)`
    ).run({ id, createdAt: new Date().toISOString() });
  return true;
}

function restoreBuiltin(id) {
  const res = db.prepare("UPDATE gift_catalog SET hidden = 0 WHERE id = ?").run(id);
  return res.changes > 0;
}

module.exports = {
  listGifts,
  isOnSale,
  getGift,
  listUserGifts,
  getUserGift,
  setSupply,
  setGiftScene,
  createGift,
  createUserGift,
  updateUserGift,
  deleteUserGift,
  deleteCustomGift,
  hideBuiltin,
  restoreBuiltin,
  starPrice,
  conversionValue,
  SUPPLY_MIN,
  SUPPLY_MAX,
  STARS_PER_RUB,
};
