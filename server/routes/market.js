const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getUser, findUserByUsername } = require("../data/users");
const { publicUser } = require("../data/sanitize");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { isSafeUrl } = require("../lib/sanitizeAttachments");
const { balanceOf } = require("../data/stars");
const market = require("../data/market");
const listings = require("../data/listings");
const { listUsersByIds } = require("../data/users");
const campaigns = require("../data/adCampaigns");
const { notifyAdminOfReview } = require("../lib/adReview");

// ── Маркет ──────────────────────────────────────────────────────────────────
//
// Что это и почему устроено так.
//
// Магазин здесь — это витрина внутри мессенджера, а не отдельный сервис: люди
// уже переписываются с продавцом, и заказ должен продолжаться там же. Поэтому
// каждый заказ открывает (или находит) диалог покупателя с продавцом и кладёт
// в него карточку заказа: дальше уточнения про размер, адрес и время идут
// обычной перепиской, а не в самодельном «чате заказа».
//
// Две оплаты, выбор за продавцом на каждый товар:
//   stars — звёздами внутри приложения. Списываются при заказе и лежат в
//           заказе, пока продавец не отметит выдачу; отмена возвращает их
//           покупателю. Это то, что делает возможной продажу цифрового товара
//           незнакомому человеку.
//   cash  — деньгами при встрече или доставке. Приложение денег не трогает
//           вовсе, заказ — это запись о договорённости. Для мешка картошки
//           внутренняя валюта не нужна и только мешает.
//
// Чего здесь намеренно нет: рейтингов продавцов, отзывов и споров. Всё это
// работает только с настоящей поддержкой, разбирающей конфликты, — рисовать
// звёздочки, за которыми никого нет, хуже, чем не рисовать их вовсе.

const router = express.Router();
router.use(requireUserId);

const MAX_QTY = 99;

function safeImage(url) {
  const v = String(url ?? "").trim();
  return v && isSafeUrl(v) ? v : null;
}

// Магазин продавца нужен почти каждому маршруту редактирования — и во всех
// случаях ответ на его отсутствие один и тот же.
async function ownShop(req, res) {
  const shop = market.getShopByOwner(req.uid);
  if (!shop) {
    res.status(404).json({ error: "У вас ещё нет магазина" });
    return null;
  }
  return shop;
}

function ownProduct(req, res, shop) {
  const p = market.getProduct(req.params.id);
  if (!p || p.shopId !== shop.id) {
    res.status(404).json({ error: "Товар не найден" });
    return null;
  }
  return p;
}

function priceLine(o) {
  return o.payKind === "stars" ? `⭐ ${o.amountStars}` : `${o.amountRub} ₽ при получении`;
}

// ── Витрина ─────────────────────────────────────────────────────────────────

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const q = String(req.query.q ?? "");
    res.json({
      products: market.listAllProducts(q),
      shops: market.listShops(q),
      myShopId: market.getShopByOwner(req.uid)?.id ?? null,
      // Баланс едет с витриной: окно заказа показывает «на балансе ⭐ N» до
      // нажатия, а не после отказа сервера.
      balanceStars: balanceOf(req.uid),
    });
  })
);

// Ссылка на магазин бывает двух видов: /market/shop/sh_… (короткий
// внутренний id) и /market/shop/@юзернейм владельца — вторую можно продиктовать
// вслух и написать на визитке, поэтому магазин ищется и по ней.
async function resolveShop(idOrHandle) {
  const raw = String(idOrHandle ?? "");
  if (!raw.startsWith("@")) return market.getShop(raw);
  const owner = await findUserByUsername(raw.slice(1));
  return owner ? market.getShopByOwner(owner.id) : undefined;
}

router.get(
  "/shops/:id",
  asyncRoute(async (req, res) => {
    const shop = await resolveShop(req.params.id);
    if (!shop) return res.status(404).json({ error: "Магазин не найден" });
    const isMine = shop.ownerId === req.uid;
    // Закрытый магазин видит только владелец — иначе ссылка из старой рекламы
    // вела бы на витрину, которую хозяин намеренно убрал.
    if (!shop.isOpen && !isMine) return res.status(404).json({ error: "Магазин закрыт" });
    const owner = await getUser(shop.ownerId);
    res.json({
      shop,
      isMine,
      owner: owner ? publicUser(owner) : null,
      products: market.listProducts(shop.id, { activeOnly: !isMine }),
      balanceStars: balanceOf(req.uid),
    });
  })
);

// ── Кабинет продавца ────────────────────────────────────────────────────────

router.get(
  "/my",
  asyncRoute(async (req, res) => {
    const shop = market.getShopByOwner(req.uid);
    res.json({
      shop: shop ?? null,
      products: shop ? market.listProducts(shop.id) : [],
      orders: shop ? market.listOrdersForShop(shop.id) : [],
      balanceStars: balanceOf(req.uid),
    });
  })
);

// Создание и правка магазина — один маршрут: у аккаунта магазин ровно один, и
// «создать» отличается от «сохранить» только тем, был ли он раньше.
router.post(
  "/shop",
  asyncRoute(async (req, res) => {
    const title = String(req.body?.title ?? "").trim().slice(0, market.MAX_TITLE);
    if (!title) return res.status(400).json({ error: "Назовите магазин" });
    const patch = {
      title,
      about: String(req.body?.about ?? "").trim().slice(0, market.MAX_ABOUT),
      city: String(req.body?.city ?? "").trim().slice(0, 80),
      imageUrl: safeImage(req.body?.imageUrl),
    };
    if (typeof req.body?.isOpen === "boolean") patch.isOpen = req.body.isOpen;

    const existing = market.getShopByOwner(req.uid);
    const shop = existing ? market.updateShop(existing.id, patch) : market.createShop({ ownerId: req.uid, ...patch });
    res.json({ shop });
  })
);

router.post(
  "/products",
  asyncRoute(async (req, res) => {
    const shop = await ownShop(req, res);
    if (!shop) return;
    const title = String(req.body?.title ?? "").trim();
    if (!title) return res.status(400).json({ error: "Назовите товар" });

    const payKind = req.body?.payKind === "cash" ? "cash" : "stars";
    const priceStars = Math.max(0, Math.floor(Number(req.body?.priceStars) || 0));
    const priceRub = Math.max(0, Math.floor(Number(req.body?.priceRub) || 0));
    // Товар без цены — это не «бесплатно», а недозаполненная карточка: у
    // покупателя не будет ответа на единственный вопрос, который его волнует.
    if (payKind === "stars" && priceStars <= 0) return res.status(400).json({ error: "Укажите цену в звёздах" });
    if (payKind === "cash" && priceRub <= 0) return res.status(400).json({ error: "Укажите цену в рублях" });

    const product = market.createProduct({
      shopId: shop.id,
      title,
      description: String(req.body?.description ?? "").trim(),
      imageUrl: safeImage(req.body?.imageUrl),
      payKind,
      priceStars,
      priceRub,
      stock: req.body?.stock === "" || req.body?.stock == null ? -1 : Number(req.body.stock),
    });
    res.json({ product });
  })
);

router.patch(
  "/products/:id",
  asyncRoute(async (req, res) => {
    const shop = await ownShop(req, res);
    if (!shop) return;
    const product = ownProduct(req, res, shop);
    if (!product) return;

    const patch = {};
    if (typeof req.body?.title === "string" && req.body.title.trim()) patch.title = req.body.title.trim().slice(0, market.MAX_TITLE);
    if (typeof req.body?.description === "string") patch.description = req.body.description.trim().slice(0, market.MAX_DESC);
    if (req.body?.imageUrl !== undefined) patch.imageUrl = safeImage(req.body.imageUrl);
    if (req.body?.payKind === "cash" || req.body?.payKind === "stars") patch.payKind = req.body.payKind;
    if (Number.isFinite(Number(req.body?.priceStars))) patch.priceStars = Math.max(0, Math.floor(Number(req.body.priceStars)));
    if (Number.isFinite(Number(req.body?.priceRub))) patch.priceRub = Math.max(0, Math.floor(Number(req.body.priceRub)));
    if (req.body?.stock !== undefined) patch.stock = req.body.stock === "" || req.body.stock == null ? -1 : Math.floor(Number(req.body.stock));
    if (typeof req.body?.isActive === "boolean") patch.isActive = req.body.isActive;

    res.json({ product: market.updateProduct(product.id, patch) });
  })
);

router.delete(
  "/products/:id",
  asyncRoute(async (req, res) => {
    const shop = await ownShop(req, res);
    if (!shop) return;
    const product = ownProduct(req, res, shop);
    if (!product) return;
    market.removeProduct(product.id);
    res.json({ ok: true });
  })
);

// ── Заказы ──────────────────────────────────────────────────────────────────

const ORDER_ERRORS = {
  gone: { code: 404, error: "Товара больше нет" },
  stock: { code: 409, error: "Столько уже не осталось" },
  stars: { code: 402, error: "Не хватает звёзд на балансе" },
  final: { code: 409, error: "Заказ уже завершён" },
};

router.post(
  "/orders",
  asyncRoute(async (req, res) => {
    const product = market.getProduct(String(req.body?.productId ?? ""));
    if (!product || !product.isActive) return res.status(404).json({ error: "Товар не найден" });
    if (product.shopOwnerId === req.uid) return res.status(400).json({ error: "Это ваш собственный товар" });

    const shop = market.getShop(product.shopId);
    if (!shop?.isOpen) return res.status(409).json({ error: "Магазин закрыт" });

    const qty = Math.min(MAX_QTY, Math.max(1, Math.floor(Number(req.body?.qty) || 1)));
    const result = market.createOrder({ product, buyerId: req.uid, qty, note: req.body?.note });
    if (result.error) {
      const e = ORDER_ERRORS[result.error] ?? { code: 400, error: "Не удалось оформить заказ" };
      return res.status(e.code).json({ error: e.error });
    }

    const order = result.order;
    // Заказ продолжается в обычном диалоге с продавцом: карточка отправляется
    // от имени покупателя, потому что это его заказ и его вопрос — а дальше
    // они просто разговаривают.
    const buyer = await getUser(req.uid);
    const chat = await findOrCreateDm(req.uid, order.sellerId);
    market.attachChat(order.id, chat.id);
    await sendMessageAndBroadcast(
      chat,
      req.uid,
      `🛍 Заказ в «${shop.title}»\n${order.productTitle} — ${order.qty} шт.\nК оплате: ${priceLine(order)}` +
        (order.note ? `\nКомментарий: ${order.note}` : "") +
        (order.payKind === "stars"
          ? "\n\nЗвёзды уже списаны и держатся до выдачи."
          : "\n\nОплата при получении — договоритесь здесь о времени и месте.")
    );

    res.json({ order: { ...order, chatId: chat.id }, balanceStars: balanceOf(req.uid) });
  })
);

router.get(
  "/orders",
  asyncRoute(async (req, res) => {
    res.json({ orders: market.listOrdersForBuyer(req.uid), balanceStars: balanceOf(req.uid) });
  })
);

// Кто что может: продавец ведёт заказ по состояниям, покупатель может только
// отменить и только пока продавец его не принял. После «принят» отмена — это
// уже разговор двоих, и делает её продавец.
const SELLER_STATUSES = new Set(["accepted", "done", "cancelled"]);

router.post(
  "/orders/:id/status",
  asyncRoute(async (req, res) => {
    const order = market.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Заказ не найден" });
    const isSeller = order.sellerId === req.uid;
    const isBuyer = order.buyerId === req.uid;
    if (!isSeller && !isBuyer) return res.status(403).json({ error: "Это не ваш заказ" });

    const status = String(req.body?.status ?? "");
    if (isSeller && !SELLER_STATUSES.has(status)) return res.status(400).json({ error: "Неизвестное состояние" });
    if (isBuyer && !isSeller) {
      if (status !== "cancelled") return res.status(403).json({ error: "Состояние заказа ведёт продавец" });
      if (order.status !== "new") return res.status(409).json({ error: "Заказ уже принят — отмену теперь делает продавец" });
    }

    const result = market.setOrderStatus(order.id, status);
    if (result.error) {
      const e = ORDER_ERRORS[result.error] ?? { code: 400, error: "Не удалось изменить заказ" };
      return res.status(e.code).json({ error: e.error });
    }

    // Обе стороны узнают об изменении там же, где заказ и начался.
    const NOTE = {
      accepted: `✅ Заказ «${order.productTitle}» принят.`,
      done: `📦 Заказ «${order.productTitle}» выдан.${order.amountStars > 0 ? ` Звёзды (⭐ ${order.amountStars}) зачислены продавцу.` : ""}`,
      cancelled: `❌ Заказ «${order.productTitle}» отменён.${order.amountStars > 0 ? ` Звёзды (⭐ ${order.amountStars}) вернулись покупателю.` : ""}`,
    };
    try {
      const chat = order.chatId ? { id: order.chatId, memberIds: [order.buyerId, order.sellerId] } : await findOrCreateDm(order.buyerId, order.sellerId);
      await sendMessageAndBroadcast(chat, req.uid, NOTE[status]);
    } catch (err) {
      console.error("order status notice failed:", err);
    }

    res.json({ order: result.order, balanceStars: balanceOf(req.uid) });
  })
);

// ── Реклама магазина ────────────────────────────────────────────────────────
//
// Продавцу не нужно знать про «рекламный кабинет»: он жмёт «Рекламировать» у
// своего товара, и дальше это обычная кампания — та же очередь проверки у
// администрации, те же звёзды за показы. Ссылка ведёт внутрь приложения, на
// витрину магазина, а не наружу.
router.post(
  "/promote",
  asyncRoute(async (req, res) => {
    const shop = await ownShop(req, res);
    if (!shop) return;

    const product = req.body?.productId ? market.getProduct(String(req.body.productId)) : null;
    if (req.body?.productId && (!product || product.shopId !== shop.id)) {
      return res.status(404).json({ error: "Товар не найден" });
    }

    const price = product ? (product.payKind === "stars" ? `⭐ ${product.priceStars}` : `${product.priceRub} ₽`) : null;
    const text = product
      ? `${product.title} — ${price}. ${shop.title}${shop.city ? `, ${shop.city}` : ""}`.slice(0, 200)
      : `${shop.title}${shop.city ? ` · ${shop.city}` : ""}. ${shop.about}`.trim().slice(0, 200);

    const campaign = campaigns.create({
      ownerId: req.uid,
      title: product ? product.title : shop.title,
      text,
      url: `/market/shop/${shop.id}`,
      imageUrl: product?.imageUrl ?? shop.imageUrl ?? null,
      placement: req.body?.placement === "chats" || req.body?.placement === "profile" ? req.body.placement : "discover",
      cpmStars: Number(req.body?.cpmStars) || 20,
    });
    await notifyAdminOfReview(campaign, req.uid);
    res.json({ campaign });
  })
);

// ─── Объявления ───────────────────────────────────────────────────────────
//
// Доска в духе «Авито»: любой человек выкладывает свою вещь, покупатель пишет
// ему в чат, дальше всё вне сервиса. Оплаты, эскроу и заказов здесь нет
// намеренно — это магазины выше, у них своя механика.
//
// Доставки тоже нет. cdekPriceRub — число, которое написал продавец: «отправлю
// СДЭК, доставка примерно столько». Никакой интеграции, вызова курьера и
// отслеживания: отправляет он сам. Поле существует, чтобы покупатель видел
// цену вопроса сразу, а не выяснял её в переписке.

const MAX_PHOTOS = 8;
const MAX_TITLE = 80;
const MAX_DESCRIPTION = 3000;
const MAX_PRICE = 100_000_000;

// Карточки продавцов для списка объявлений — одним запросом на страницу.
async function withSellers(items, viewerId) {
  const ids = [...new Set(items.map((l) => l.sellerId))];
  const users = await listUsersByIds(ids);
  const byId = new Map(users.map((u) => [u.id, publicUser(u)]));
  const favorites = viewerId ? listings.favoriteIdsFor(viewerId, items.map((l) => l.id)) : new Set();
  return items.map((l) => ({ ...l, seller: byId.get(l.sellerId) ?? null, isFavorite: favorites.has(l.id) }));
}

function readListingBody(body, { partial = false } = {}) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body ?? {}, k);

  if (!partial || has("title")) {
    const title = String(body?.title ?? "").trim().slice(0, MAX_TITLE);
    if (!title) return { error: "Без названия объявление не найдут" };
    out.title = title;
  }
  if (!partial || has("description")) out.description = String(body?.description ?? "").trim().slice(0, MAX_DESCRIPTION);
  if (!partial || has("category")) {
    const category = String(body?.category ?? "other");
    out.category = listings.CATEGORY_IDS.has(category) ? category : "other";
  }
  if (!partial || has("condition")) {
    const condition = String(body?.condition ?? "used");
    out.condition = listings.CONDITIONS.has(condition) ? condition : "used";
  }
  if (!partial || has("priceRub")) {
    const price = Math.floor(Number(body?.priceRub ?? 0));
    if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) return { error: "Некорректная цена" };
    out.priceRub = price;
  }
  if (!partial || has("isNegotiable")) out.isNegotiable = !!body?.isNegotiable;
  if (!partial || has("city")) out.city = String(body?.city ?? "").trim().slice(0, 60);
  if (!partial || has("photos")) {
    // Только файлы, которые загрузил сам сервер: чужая ссылка в объявлении —
    // это запрос к чужому хосту у каждого, кто открыл доску.
    const raw = Array.isArray(body?.photos) ? body.photos : [];
    out.photos = raw.filter((u) => typeof u === "string" && isSafeUrl(u) && !u.startsWith("data:")).slice(0, MAX_PHOTOS);
  }
  if (!partial || has("cdekPriceRub")) {
    const raw = body?.cdekPriceRub;
    if (raw === null || raw === "" || raw === undefined) out.cdekPriceRub = null;
    else {
      const cdek = Math.floor(Number(raw));
      if (!Number.isFinite(cdek) || cdek < 0 || cdek > 1_000_000) return { error: "Некорректная стоимость доставки" };
      out.cdekPriceRub = cdek;
    }
  }
  return { value: out };
}

router.get(
  "/listings",
  asyncRoute(async (req, res) => {
    const num = (v) => (v === undefined || v === "" ? null : Number(v));
    const items = listings.listListings({
      q: String(req.query.q ?? "").slice(0, 80),
      category: String(req.query.category ?? ""),
      city: String(req.query.city ?? "").slice(0, 60),
      condition: String(req.query.condition ?? ""),
      priceMin: num(req.query.priceMin),
      priceMax: num(req.query.priceMax),
      sort: String(req.query.sort ?? "new"),
      limit: Number(req.query.limit) || 40,
      offset: Number(req.query.offset) || 0,
    });
    res.json({
      listings: await withSellers(items, req.uid),
      categories: listings.CATEGORIES,
      cities: listings.listCities(),
    });
  })
);

router.get(
  "/listings/mine",
  asyncRoute(async (req, res) => {
    res.json({ listings: await withSellers(listings.listMyListings(req.uid), req.uid) });
  })
);

router.get(
  "/listings/favorites",
  asyncRoute(async (req, res) => {
    res.json({ listings: await withSellers(listings.listFavorites(req.uid), req.uid) });
  })
);

router.get(
  "/listings/:id",
  asyncRoute(async (req, res) => {
    const listing = listings.getListing(req.params.id);
    if (!listing) return res.status(404).json({ error: "Объявление не найдено" });
    // Свои просмотры не считаем: иначе счётчик показывает, сколько раз продавец
    // сам открыл свою страницу.
    if (listing.sellerId !== req.uid) listings.bumpViews(listing.id);
    const [withSeller] = await withSellers([listings.getListing(req.params.id)], req.uid);
    res.json({ listing: withSeller });
  })
);

router.post(
  "/listings",
  asyncRoute(async (req, res) => {
    const { value, error } = readListingBody(req.body);
    if (error) return res.status(400).json({ error });
    const listing = listings.createListing({
      id: `ls_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sellerId: req.uid,
      createdAt: new Date().toISOString(),
      ...value,
    });
    res.json({ listing });
  })
);

router.patch(
  "/listings/:id",
  asyncRoute(async (req, res) => {
    const listing = listings.getListing(req.params.id);
    if (!listing) return res.status(404).json({ error: "Объявление не найдено" });
    if (listing.sellerId !== req.uid) return res.status(403).json({ error: "Это чужое объявление" });

    const { value, error } = readListingBody(req.body, { partial: true });
    if (error) return res.status(400).json({ error });
    // Статус меняется тем же запросом: «продано» и «снять» — это те же
    // изменения объявления, а не отдельные действия.
    if (typeof req.body?.status === "string" && listings.STATUSES.has(req.body.status)) value.status = req.body.status;
    res.json({ listing: listings.updateListing(listing.id, value) });
  })
);

router.delete(
  "/listings/:id",
  asyncRoute(async (req, res) => {
    if (!listings.deleteListing(req.params.id, req.uid)) {
      return res.status(404).json({ error: "Объявление не найдено" });
    }
    res.json({ ok: true });
  })
);

router.post(
  "/listings/:id/favorite",
  asyncRoute(async (req, res) => {
    const listing = listings.getListing(req.params.id);
    if (!listing) return res.status(404).json({ error: "Объявление не найдено" });
    listings.setFavorite(req.uid, listing.id, req.body?.on !== false);
    res.json({ ok: true, isFavorite: req.body?.on !== false });
  })
);

// «Написать продавцу» — открывает личную переписку и сразу отправляет туда
// карточку объявления, чтобы продавец понял, о чём речь: у него их может быть
// десяток, а сообщение «здравствуйте, ещё продаёте?» само по себе бесполезно.
router.post(
  "/listings/:id/contact",
  asyncRoute(async (req, res) => {
    const listing = listings.getListing(req.params.id);
    if (!listing) return res.status(404).json({ error: "Объявление не найдено" });
    if (listing.sellerId === req.uid) return res.status(400).json({ error: "Это ваше собственное объявление" });

    const chat = await findOrCreateDm(req.uid, listing.sellerId);
    const price = listing.isNegotiable ? "цена договорная" : `${listing.priceRub} ₽`;
    const text = `Здравствуйте! Пишу по объявлению «${listing.title}» (${price}). Ещё продаёте?`;
    // Первым аргументом сам чат, а не его идентификатор: рассылка берёт из
    // него список участников.
    await sendMessageAndBroadcast(chat, req.uid, text);
    res.json({ chatId: chat.id });
  })
);

module.exports = router;
