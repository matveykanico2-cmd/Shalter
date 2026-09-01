const db = require("../db");

// Доска объявлений: данные. Права и проверки — в server/routes/market.js.
//
// Устроено проще магазинов рядом: у объявления нет ни остатка, ни оплаты через
// сервис, ни эскроу. Оно живёт, пока продавец не отметит «продано» или не
// уберёт — а дальше люди договариваются в переписке.

// Набор категорий закрыт и лежит в коде, а не в базе: он меняется раз в год,
// а фильтр по нему должен одинаково пониматься и сервером, и экраном. Строкой
// хранится ключ, человеческое название — рядом, чтобы не расходились.
const CATEGORIES = [
  { id: "electronics", label: "Электроника" },
  { id: "home", label: "Для дома и дачи" },
  { id: "clothes", label: "Личные вещи" },
  { id: "transport", label: "Транспорт" },
  { id: "realty", label: "Недвижимость" },
  { id: "hobby", label: "Хобби и отдых" },
  { id: "animals", label: "Животные" },
  { id: "services", label: "Услуги" },
  { id: "work", label: "Работа" },
  { id: "other", label: "Другое" },
];
const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
const CONDITIONS = new Set(["new", "used"]);
const STATUSES = new Set(["active", "sold", "archived"]);

function rowToListing(row) {
  if (!row) return undefined;
  let photos = [];
  try {
    const parsed = JSON.parse(row.photos || "[]");
    if (Array.isArray(parsed)) photos = parsed.filter((p) => typeof p === "string");
  } catch {
    // Битый JSON не должен уносить объявление целиком — останется без фото.
  }
  return {
    id: row.id,
    sellerId: row.sellerId,
    title: row.title,
    description: row.description ?? "",
    category: row.category,
    condition: row.condition,
    priceRub: row.priceRub ?? 0,
    isNegotiable: !!row.isNegotiable,
    city: row.city ?? "",
    photos,
    // null означает «не отправляю, только самовывоз» — это не то же самое, что
    // «отправляю бесплатно», поэтому ноль и отсутствие различаются.
    cdekPriceRub: row.cdekPriceRub == null ? null : row.cdekPriceRub,
    status: row.status,
    views: row.views ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? null,
  };
}

function getListing(id) {
  return rowToListing(db.prepare("SELECT * FROM listings WHERE id = ?").get(id));
}

// Лента с фильтрами. Всё складывается в один запрос: отбирать в JavaScript
// значило бы вычитывать доску целиком ради десятка строк на экране.
function listListings({
  q = "",
  category = "",
  city = "",
  condition = "",
  priceMin = null,
  priceMax = null,
  sellerId = "",
  sort = "new",
  limit = 40,
  offset = 0,
} = {}) {
  const where = ["status = 'active'"];
  const params = {};
  if (q) {
    // По названию и описанию — этого хватает: доска не библиотека, точный
    // поиск здесь никому не нужен, а полнотекстовый индекс ради двух полей
    // стоил бы дороже, чем даёт.
    // lower_ru, а не lower: встроенная в SQLite понимает только латиницу,
    // и поиск по русским словам не находил ничего (см. server/db.js).
    where.push("(lower_ru(title) LIKE @q OR lower_ru(description) LIKE @q)");
    params.q = `%${String(q).toLowerCase()}%`;
  }
  if (CATEGORY_IDS.has(category)) {
    where.push("category = @category");
    params.category = category;
  }
  if (city) {
    where.push("lower_ru(city) = @city");
    params.city = String(city).toLowerCase();
  }
  if (CONDITIONS.has(condition)) {
    where.push("condition = @condition");
    params.condition = condition;
  }
  if (Number.isFinite(priceMin)) {
    where.push("priceRub >= @priceMin");
    params.priceMin = priceMin;
  }
  if (Number.isFinite(priceMax)) {
    where.push("priceRub <= @priceMax");
    params.priceMax = priceMax;
  }
  if (sellerId) {
    where.push("sellerId = @sellerId");
    params.sellerId = sellerId;
  }
  const order =
    sort === "cheap" ? "priceRub ASC, createdAt DESC" : sort === "expensive" ? "priceRub DESC, createdAt DESC" : "createdAt DESC";
  params.limit = Math.min(Math.max(limit, 1), 100);
  params.offset = Math.max(offset, 0);
  return db
    .prepare(`SELECT * FROM listings WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT @limit OFFSET @offset`)
    .all(params)
    .map(rowToListing);
}

// Свои объявления — включая проданные и снятые: продавцу нужен весь список,
// иначе «продано» выглядит как пропажа.
function listMyListings(sellerId) {
  return db
    .prepare("SELECT * FROM listings WHERE sellerId = ? ORDER BY createdAt DESC")
    .all(sellerId)
    .map(rowToListing);
}

// Города, в которых что-то продаётся, — для фильтра. Считает база: список
// коротких строк вместо всей доски в памяти.
function listCities() {
  return db
    .prepare("SELECT city, count(*) n FROM listings WHERE status = 'active' AND city <> '' GROUP BY lower_ru(city) ORDER BY n DESC LIMIT 50")
    .all()
    .map((r) => ({ city: r.city, count: r.n }));
}

function createListing(listing) {
  db.prepare(
    `INSERT INTO listings (id, sellerId, title, description, category, condition, priceRub, isNegotiable, city, photos, cdekPriceRub, status, views, createdAt)
     VALUES (@id, @sellerId, @title, @description, @category, @condition, @priceRub, @isNegotiable, @city, @photos, @cdekPriceRub, 'active', 0, @createdAt)`
  ).run({
    ...listing,
    photos: JSON.stringify(listing.photos ?? []),
    isNegotiable: listing.isNegotiable ? 1 : 0,
  });
  return getListing(listing.id);
}

const EDITABLE = ["title", "description", "category", "condition", "priceRub", "isNegotiable", "city", "photos", "cdekPriceRub", "status"];

function updateListing(id, patch) {
  const fields = [];
  const params = { id, updatedAt: new Date().toISOString() };
  for (const key of EDITABLE) {
    if (!(key in patch)) continue;
    fields.push(`${key} = @${key}`);
    params[key] =
      key === "photos" ? JSON.stringify(patch.photos ?? []) : key === "isNegotiable" ? (patch.isNegotiable ? 1 : 0) : patch[key];
  }
  if (!fields.length) return getListing(id);
  db.prepare(`UPDATE listings SET ${fields.join(", ")}, updatedAt = @updatedAt WHERE id = @id`).run(params);
  return getListing(id);
}

function deleteListing(id, sellerId) {
  return db.prepare("DELETE FROM listings WHERE id = ? AND sellerId = ?").run(id, sellerId).changes > 0;
}

// Счётчик просмотров. Отдельным запросом, а не чтением-записью объекта: два
// человека, открывшие объявление одновременно, иначе затрут показания друг
// друга.
function bumpViews(id) {
  db.prepare("UPDATE listings SET views = views + 1 WHERE id = ?").run(id);
}

function setFavorite(userId, listingId, on) {
  if (on) {
    db.prepare("INSERT OR IGNORE INTO listing_favorites (userId, listingId, createdAt) VALUES (?, ?, ?)").run(
      userId,
      listingId,
      new Date().toISOString()
    );
  } else {
    db.prepare("DELETE FROM listing_favorites WHERE userId = ? AND listingId = ?").run(userId, listingId);
  }
}

function listFavorites(userId) {
  return db
    .prepare(
      `SELECT l.* FROM listings l
         JOIN listing_favorites f ON f.listingId = l.id
        WHERE f.userId = ? ORDER BY f.createdAt DESC`
    )
    .all(userId)
    .map(rowToListing);
}

// Какие из этих объявлений человек отметил — одним запросом на всю страницу,
// а не по одному на карточку.
function favoriteIdsFor(userId, listingIds) {
  if (!listingIds?.length) return new Set();
  const holes = listingIds.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT listingId FROM listing_favorites WHERE userId = ? AND listingId IN (${holes})`)
    .all(userId, ...listingIds);
  return new Set(rows.map((r) => r.listingId));
}

module.exports = {
  CATEGORIES,
  CATEGORY_IDS,
  CONDITIONS,
  STATUSES,
  getListing,
  listListings,
  listMyListings,
  listCities,
  createListing,
  updateListing,
  deleteListing,
  bumpViews,
  setFavorite,
  listFavorites,
  favoriteIdsFor,
};
