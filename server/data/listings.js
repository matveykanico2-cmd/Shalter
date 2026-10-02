const db = require("../db");

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

function listMyListings(sellerId) {
  return db
    .prepare("SELECT * FROM listings WHERE sellerId = ? ORDER BY createdAt DESC")
    .all(sellerId)
    .map(rowToListing);
}

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
