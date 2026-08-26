const db = require("../db");
const { spendStars, addStars } = require("./stars");

// Маркет: магазины, товары, заказы. Правила — в server/routes/market.js, здесь
// хранение и деньги.
//
// Деньги живут тут, а не в маршруте, ровно по той же причине, что и в stars.js:
// заказ, списание звёзд и уменьшение остатка — это одно изменение, и оно должно
// либо произойти целиком, либо не произойти вовсе. Разложенное по трём запросам
// из обработчика, оно ломается посередине и оставляет заказ, за который никто
// не заплатил (или списанные звёзды без заказа).

const MAX_TITLE = 80;
const MAX_ABOUT = 600;
const MAX_DESC = 1000;

function rowToShop(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    about: row.about,
    imageUrl: row.imageUrl ?? null,
    city: row.city,
    isOpen: !!row.isOpen,
    createdAt: row.createdAt,
    productCount: row.productCount ?? undefined,
  };
}

function rowToProduct(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    shopId: row.shopId,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl ?? null,
    payKind: row.payKind,
    priceStars: row.priceStars,
    priceRub: row.priceRub,
    stock: row.stock,
    isActive: !!row.isActive,
    createdAt: row.createdAt,
    // «Осталось 0» и «сколько угодно» — разные вещи, и решать это должен один
    // и тот же код, а не каждый экран по-своему.
    inStock: row.stock < 0 || row.stock > 0,
    shopTitle: row.shopTitle ?? undefined,
    shopOwnerId: row.shopOwnerId ?? undefined,
  };
}

function rowToOrder(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    shopId: row.shopId,
    productId: row.productId,
    productTitle: row.productTitle,
    buyerId: row.buyerId,
    sellerId: row.sellerId,
    qty: row.qty,
    payKind: row.payKind,
    amountStars: row.amountStars,
    amountRub: row.amountRub,
    status: row.status,
    note: row.note,
    chatId: row.chatId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? null,
    shopTitle: row.shopTitle ?? undefined,
  };
}

// ── Магазины ────────────────────────────────────────────────────────────────

function getShop(id) {
  return rowToShop(db.prepare("SELECT * FROM shops WHERE id = ?").get(id));
}

function getShopByOwner(ownerId) {
  return rowToShop(db.prepare("SELECT * FROM shops WHERE ownerId = ?").get(ownerId));
}

// Витрина каталога. Магазины без единого товара не показываются: пустая
// вывеска в списке — это разочарование в один клик, а не выбор.
function listShops(query = "", limit = 60) {
  const q = `%${query.trim().toLowerCase()}%`;
  return db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM shop_products p WHERE p.shopId = s.id AND p.isActive = 1) AS productCount
         FROM shops s
        WHERE s.isOpen = 1
          AND (? = '%%' OR lower(s.title) LIKE ? OR lower(s.about) LIKE ? OR lower(s.city) LIKE ?)
        ORDER BY productCount DESC, s.createdAt DESC
        LIMIT ?`
    )
    .all(q, q, q, q, limit)
    .filter((r) => r.productCount > 0)
    .map(rowToShop);
}

function createShop({ ownerId, title, about, imageUrl, city }) {
  const id = `sh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(
    `INSERT INTO shops (id, ownerId, title, about, imageUrl, city, createdAt)
     VALUES (@id, @ownerId, @title, @about, @imageUrl, @city, @createdAt)`
  ).run({
    id,
    ownerId,
    title: String(title || "").slice(0, MAX_TITLE) || "Магазин",
    about: String(about || "").slice(0, MAX_ABOUT),
    imageUrl: imageUrl || null,
    city: String(city || "").slice(0, 80),
    createdAt: new Date().toISOString(),
  });
  return getShop(id);
}

function updateShop(id, patch) {
  const allowed = ["title", "about", "imageUrl", "city", "isOpen"];
  const fields = Object.keys(patch).filter((k) => allowed.includes(k));
  if (!fields.length) return getShop(id);
  const set = fields.map((f) => `${f} = @${f}`).join(", ");
  db.prepare(`UPDATE shops SET ${set}, updatedAt = @updatedAt WHERE id = @id`).run({
    ...Object.fromEntries(fields.map((f) => [f, typeof patch[f] === "boolean" ? (patch[f] ? 1 : 0) : patch[f]])),
    id,
    updatedAt: new Date().toISOString(),
  });
  return getShop(id);
}

// ── Товары ──────────────────────────────────────────────────────────────────

function getProduct(id) {
  return rowToProduct(
    db
      .prepare(
        `SELECT p.*, s.title AS shopTitle, s.ownerId AS shopOwnerId
           FROM shop_products p JOIN shops s ON s.id = p.shopId WHERE p.id = ?`
      )
      .get(id)
  );
}

function listProducts(shopId, { activeOnly = false } = {}) {
  return db
    .prepare(
      `SELECT * FROM shop_products WHERE shopId = ?${activeOnly ? " AND isActive = 1" : ""} ORDER BY createdAt DESC`
    )
    .all(shopId)
    .map(rowToProduct);
}

// Общая витрина: свежие товары всех открытых магазинов. Каталог начинается с
// товаров, а не со списка вывесок, — человек ищет вещь, а не магазин.
function listAllProducts(query = "", limit = 60) {
  const q = `%${query.trim().toLowerCase()}%`;
  return db
    .prepare(
      `SELECT p.*, s.title AS shopTitle, s.ownerId AS shopOwnerId
         FROM shop_products p JOIN shops s ON s.id = p.shopId
        WHERE p.isActive = 1 AND s.isOpen = 1
          AND (? = '%%' OR lower(p.title) LIKE ? OR lower(p.description) LIKE ? OR lower(s.title) LIKE ?)
        ORDER BY p.createdAt DESC LIMIT ?`
    )
    .all(q, q, q, q, limit)
    .map(rowToProduct);
}

function createProduct({ shopId, title, description, imageUrl, payKind, priceStars, priceRub, stock }) {
  const id = `pr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(
    `INSERT INTO shop_products (id, shopId, title, description, imageUrl, payKind, priceStars, priceRub, stock, createdAt)
     VALUES (@id, @shopId, @title, @description, @imageUrl, @payKind, @priceStars, @priceRub, @stock, @createdAt)`
  ).run({
    id,
    shopId,
    title: String(title || "").slice(0, MAX_TITLE) || "Товар",
    description: String(description || "").slice(0, MAX_DESC),
    imageUrl: imageUrl || null,
    payKind: payKind === "cash" ? "cash" : "stars",
    priceStars: Math.max(0, Math.floor(Number(priceStars) || 0)),
    priceRub: Math.max(0, Math.floor(Number(priceRub) || 0)),
    stock: Number.isFinite(Number(stock)) ? Math.floor(Number(stock)) : -1,
    createdAt: new Date().toISOString(),
  });
  return getProduct(id);
}

function updateProduct(id, patch) {
  const allowed = ["title", "description", "imageUrl", "payKind", "priceStars", "priceRub", "stock", "isActive"];
  const fields = Object.keys(patch).filter((k) => allowed.includes(k));
  if (!fields.length) return getProduct(id);
  const set = fields.map((f) => `${f} = @${f}`).join(", ");
  db.prepare(`UPDATE shop_products SET ${set}, updatedAt = @updatedAt WHERE id = @id`).run({
    ...Object.fromEntries(fields.map((f) => [f, typeof patch[f] === "boolean" ? (patch[f] ? 1 : 0) : patch[f]])),
    id,
    updatedAt: new Date().toISOString(),
  });
  return getProduct(id);
}

// Товар не удаляется вместе с заказами на него: заказ хранит своё название и
// цену и продолжает читаться. Поэтому здесь настоящий DELETE, а не «скрыть».
function removeProduct(id) {
  db.prepare("DELETE FROM shop_products WHERE id = ?").run(id);
}

// ── Заказы ──────────────────────────────────────────────────────────────────

function getOrder(id) {
  return rowToOrder(
    db.prepare("SELECT o.*, s.title AS shopTitle FROM shop_orders o LEFT JOIN shops s ON s.id = o.shopId WHERE o.id = ?").get(id)
  );
}

function listOrdersForBuyer(buyerId) {
  return db
    .prepare(
      `SELECT o.*, s.title AS shopTitle FROM shop_orders o LEFT JOIN shops s ON s.id = o.shopId
        WHERE o.buyerId = ? ORDER BY o.createdAt DESC LIMIT 100`
    )
    .all(buyerId)
    .map(rowToOrder);
}

function listOrdersForShop(shopId) {
  return db
    .prepare(
      `SELECT o.*, s.title AS shopTitle FROM shop_orders o LEFT JOIN shops s ON s.id = o.shopId
        WHERE o.shopId = ? ORDER BY o.createdAt DESC LIMIT 200`
    )
    .all(shopId)
    .map(rowToOrder);
}

// Заказ целиком: проверка остатка, списание звёзд и сама запись — в одной
// транзакции. Возвращает { error } вместо исключения, потому что каждая
// причина отказа рассказывается человеку по-своему.
const createOrder = db.transaction(({ product, buyerId, qty, note }) => {
  const row = db.prepare("SELECT * FROM shop_products WHERE id = ?").get(product.id);
  if (!row || !row.isActive) return { error: "gone" };
  // Остаток перечитывается внутри транзакции: два одновременных заказа
  // последней вещи иначе оба увидели бы «1 шт.» и оба прошли.
  if (row.stock >= 0 && row.stock < qty) return { error: "stock" };

  const amountStars = row.payKind === "stars" ? row.priceStars * qty : 0;
  const amountRub = row.payKind === "cash" ? row.priceRub * qty : 0;
  if (amountStars > 0 && !spendStars(buyerId, amountStars)) return { error: "stars" };

  if (row.stock >= 0) db.prepare("UPDATE shop_products SET stock = stock - ? WHERE id = ?").run(qty, row.id);

  const id = `or_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(
    `INSERT INTO shop_orders (id, shopId, productId, productTitle, buyerId, sellerId, qty, payKind, amountStars, amountRub, status, note, createdAt)
     VALUES (@id, @shopId, @productId, @productTitle, @buyerId, @sellerId, @qty, @payKind, @amountStars, @amountRub, 'new', @note, @createdAt)`
  ).run({
    id,
    shopId: row.shopId,
    productId: row.id,
    productTitle: row.title,
    buyerId,
    sellerId: product.shopOwnerId,
    qty,
    payKind: row.payKind,
    amountStars,
    amountRub,
    note: String(note || "").slice(0, 500),
    createdAt: new Date().toISOString(),
  });
  return { order: getOrder(id) };
});

function attachChat(orderId, chatId) {
  db.prepare("UPDATE shop_orders SET chatId = ? WHERE id = ?").run(chatId, orderId);
}

// Смена состояния — тоже транзакция: здесь либо звёзды уходят продавцу, либо
// возвращаются покупателю, и оба раза заодно чинится остаток товара.
//
// Звёзды всё время между заказом и выдачей лежат «в заказе»: с баланса
// покупателя они уже списаны, продавцу ещё не зачислены. Так продавец не
// получает деньги за то, чего не отдал, а покупатель не может передумать уже
// после того, как товар ушёл.
const setOrderStatus = db.transaction((orderId, status) => {
  const row = db.prepare("SELECT * FROM shop_orders WHERE id = ?").get(orderId);
  if (!row) return { error: "gone" };
  if (row.status === "done" || row.status === "cancelled") return { error: "final" };
  if (status === row.status) return { order: getOrder(orderId) };

  if (status === "done" && row.amountStars > 0) addStars(row.sellerId, row.amountStars);
  if (status === "cancelled") {
    if (row.amountStars > 0) addStars(row.buyerId, row.amountStars);
    // Отменённый заказ возвращает вещь на витрину — но только если у товара
    // вообще есть счётчик остатка и сам товар ещё существует.
    db.prepare("UPDATE shop_products SET stock = stock + ? WHERE id = ? AND stock >= 0").run(row.qty, row.productId);
  }

  db.prepare("UPDATE shop_orders SET status = ?, updatedAt = ? WHERE id = ?").run(status, new Date().toISOString(), orderId);
  return { order: getOrder(orderId) };
});

module.exports = {
  MAX_TITLE,
  MAX_ABOUT,
  MAX_DESC,
  getShop,
  getShopByOwner,
  listShops,
  createShop,
  updateShop,
  getProduct,
  listProducts,
  listAllProducts,
  createProduct,
  updateProduct,
  removeProduct,
  getOrder,
  listOrdersForBuyer,
  listOrdersForShop,
  createOrder,
  attachChat,
  setOrderStatus,
};
