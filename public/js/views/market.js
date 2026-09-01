import { el, mount } from "../lib/dom.js";
import { ListingsBoard } from "./marketListings.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { getState } from "../state.js";
import { fileToImageDataUrl } from "../lib/image.js";
import { openOrderDialog } from "../components/orderDialog.js";
import { openForwardDialog } from "../components/forwardDialog.js";

// Маркет: витрина, магазин продавца и заказы.
//
// Три вкладки одного экрана, а не три раздела в рельсе: покупатель и продавец —
// это один и тот же человек в разные дни, и «мои заказы» он ищет там же, где
// покупал. Страница магазина (ShopView ниже) — отдельный адрес: на неё ведут
// ссылки из рекламы и из переписки.

const ORDER_STATUS = {
  new: { label: "Новый", tone: "warn" },
  accepted: { label: "Принят", tone: "ok" },
  done: { label: "Выдан", tone: "muted" },
  cancelled: { label: "Отменён", tone: "danger" },
};

const TABS = [
  // Доска объявлений идёт первой: продать свою вещь хочет любой, а магазин с
  // оплатой звёздами заводят единицы.
  { id: "", label: "Объявления" },
  { id: "shops", label: "Магазины" },
  { id: "orders", label: "Мои заказы" },
  { id: "my", label: "Мой магазин" },
];

const fmt = (n) => new Intl.NumberFormat("ru-RU").format(n ?? 0);

// Ссылка на магазин. По юзернейму владельца, если он есть: /market/shop/@marina
// читается вслух и пишется на визитке, а sh_1787…_419l — нет. Сервер понимает
// обе (server/routes/market.js, resolveShop).
function shopLink(shop, owner) {
  const handle = owner?.username ? `@${owner.username}` : shop.id;
  return `${window.location.origin}/market/shop/${handle}`;
}

// Копирование с ответом на экране: без него нажатие «Скопировать» ничем не
// отличается от нажатия в пустоту.
async function copyLink(link, button) {
  try {
    await navigator.clipboard.writeText(link);
    const was = button.textContent;
    button.textContent = "Ссылка скопирована";
    setTimeout(() => (button.textContent = was), 1500);
  } catch {
    prompt("Скопируйте ссылку:", link);
  }
}

// Отправить ссылку в любой свой чат — тем же выбором, что и пересылка
// сообщений, чтобы это было одно знакомое окно, а не второе такое же.
function shareLink(link, title) {
  openForwardDialog(async (chatId) => {
    try {
      await api.sendMessage(chatId, `${title}\n${link}`);
      navigate(`/chat/${chatId}`);
    } catch (err) {
      alert(err.message || "Не удалось отправить");
    }
  });
}

// Цена товара одной строкой — она отвечает и на «сколько», и на «чем платят».
function priceText(p) {
  return p.payKind === "stars" ? `⭐ ${fmt(p.priceStars)}` : `${fmt(p.priceRub)} ₽`;
}

function orderAmount(o) {
  return o.payKind === "stars" ? `⭐ ${fmt(o.amountStars)}` : `${fmt(o.amountRub)} ₽ при получении`;
}

function header(title, backTo, actions) {
  return el("header", { class: "contacts-header" }, [
    el("button", { class: "chat-header-back", html: iconSvg("ChevronLeft", 20), onclick: () => navigate(backTo) }),
    el("p", { class: "view-title" }, title),
    actions ? el("div", { class: "market-header-actions" }, actions) : null,
  ]);
}

// Карточка товара на витрине. Кнопка целиком: тыкать в маленькую надпись
// «купить» на телефоне неудобно, а вся карточка — цель размером с палец.
function productCard(p, onOpen) {
  return el("button", { class: "market-card", onclick: () => onOpen(p) }, [
    p.imageUrl
      ? el("img", { class: "market-card-image", src: p.imageUrl, alt: "", loading: "lazy" })
      : el("div", { class: "market-card-image placeholder", html: iconSvg("Bag", 26) }),
    el("div", { class: "market-card-body" }, [
      el("p", { class: "market-card-title" }, p.title),
      el("p", { class: "market-card-price" }, priceText(p)),
      p.shopTitle ? el("p", { class: "market-card-shop" }, p.shopTitle) : null,
      p.stock === 0 ? el("p", { class: "market-card-out" }, "Нет в наличии") : null,
    ]),
  ]);
}

export async function MarketView(root, tab = "") {
  let data = null; // витрина
  let orders = null; // мои заказы
  let mine = null; // кабинет продавца
  let error = null;
  let notice = null;
  let busy = false;
  let query = "";
  let searchTimer = null;
  let editingProduct = null; // id товара или "new"

  const me = getState().user;

  // Поля форм — вне render(): пересозданные на каждой перерисовке, они теряли
  // бы фокус после каждой буквы.
  const shopFields = {
    title: el("input", { class: "settings-input", placeholder: "Название магазина" }),
    city: el("input", { class: "settings-input", placeholder: "Город или район — где забирать" }),
    about: el("textarea", { class: "settings-input", rows: 3, placeholder: "Чем торгуете, как доставляете" }),
  };
  let shopImage = null;

  const productFields = {
    title: el("input", { class: "settings-input", placeholder: "Название товара" }),
    description: el("textarea", { class: "settings-input", rows: 3, placeholder: "Описание: что это, состояние, размеры" }),
    priceStars: el("input", { class: "settings-input mono", type: "number", min: 1, value: "50" }),
    priceRub: el("input", { class: "settings-input mono", type: "number", min: 1, value: "500" }),
    stock: el("input", { class: "settings-input mono", type: "number", min: 0, placeholder: "Пусто — сколько угодно" }),
  };
  let productPay = "stars";
  let productImage = null;

  function fillProductForm(p) {
    productFields.title.value = p?.title ?? "";
    productFields.description.value = p?.description ?? "";
    productFields.priceStars.value = String(p?.priceStars || 50);
    productFields.priceRub.value = String(p?.priceRub || 500);
    productFields.stock.value = p && p.stock >= 0 ? String(p.stock) : "";
    productPay = p?.payKind ?? "stars";
    productImage = p?.imageUrl ?? null;
  }

  async function act(fn) {
    if (busy) return;
    busy = true;
    error = null;
    render();
    try {
      await fn();
    } catch (err) {
      error = err.message || "Не получилось";
    } finally {
      busy = false;
      render();
    }
  }

  async function load() {
    try {
      if (tab === "shops") data = await api.marketFeed(query);
      else if (tab === "orders") orders = await api.myOrders();
      else mine = await api.myShop();
      error = null;
    } catch (err) {
      error = err.message || "Не удалось загрузить маркет";
    }
    render();
  }

  function openProduct(p) {
    if (p.shopOwnerId === me.id) return navigate(`/market/shop/${p.shopId}`);
    if (p.stock === 0) return;
    openOrderDialog(p, {
      balanceStars: data?.balanceStars ?? mine?.balanceStars ?? 0,
      onDone: (order) => {
        // Разговор с продавцом уже начался — туда и ведём: дальше всё
        // происходит в переписке, а не на этом экране.
        if (order?.chatId) navigate(`/chat/${order.chatId}`);
        else navigate("/market/orders");
      },
    });
  }

  // ── Витрина ───────────────────────────────────────────────────────────────
  function feed() {
    if (!data) return el("p", { class: "empty-hint" }, "Загрузка…");
    return el("div", { class: "market-feed" }, [
      el("div", { class: "contacts-add-panel" }, [
        el("input", {
          class: "settings-input",
          placeholder: "Что ищете — название товара или магазина",
          value: query,
          oninput: (e) => {
            query = e.target.value;
            clearTimeout(searchTimer);
            searchTimer = setTimeout(load, 300);
          },
        }),
      ]),
      data.shops.length
        ? el("div", { class: "market-shops-strip" }, [
            el("p", { class: "market-section-title" }, "Магазины"),
            el(
              "div",
              { class: "market-shops-row" },
              data.shops.map((s) =>
                el("button", { class: "market-shop-chip", onclick: () => navigate(`/market/shop/${s.id}`) }, [
                  s.imageUrl ? el("img", { class: "market-shop-chip-img", src: s.imageUrl, alt: "" }) : el("span", { html: iconSvg("Bag", 16) }),
                  el("span", {}, s.title),
                  el("span", { class: "market-shop-chip-count" }, String(s.productCount)),
                ])
              )
            ),
          ])
        : null,
      el("p", { class: "market-section-title" }, query ? "Найдено" : "Свежие товары"),
      data.products.length
        ? el("div", { class: "market-grid" }, data.products.map((p) => productCard(p, openProduct)))
        : el("p", { class: "empty-hint" }, query ? "Ничего не нашлось" : "Товаров пока нет — ваш магазин может стать первым"),
    ]);
  }

  // ── Мои заказы (покупатель) ───────────────────────────────────────────────
  function buyerOrders() {
    if (!orders) return el("p", { class: "empty-hint" }, "Загрузка…");
    if (!orders.orders.length) return el("p", { class: "empty-hint" }, "Заказов пока нет");
    return el(
      "div",
      { class: "market-orders" },
      orders.orders.map((o) => {
        const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.new;
        return el("div", { class: "ad-card" }, [
          el("div", { class: "ad-card-head" }, [
            el("div", { class: "ad-card-titles" }, [
              el("p", { class: "ad-card-title" }, o.productTitle),
              el("p", { class: "ad-card-place" }, `${o.shopTitle ?? "магазин"} · ${o.qty} шт. · ${new Date(o.createdAt).toLocaleString("ru-RU")}`),
            ]),
            el("span", { class: `ad-status ${st.tone}` }, st.label),
          ]),
          el("p", { class: "ad-card-text" }, orderAmount(o)),
          o.note ? el("p", { class: "settings-toggle-hint" }, `Комментарий: ${o.note}`) : null,
          el("div", { class: "ad-card-actions" }, [
            o.chatId ? el("button", { class: "profile-action-btn", onclick: () => navigate(`/chat/${o.chatId}`) }, "Написать продавцу") : null,
            // Отменить можно, пока продавец не принял заказ: после этого он уже
            // мог отложить вещь или выехать, и отмена — разговор, а не кнопка.
            o.status === "new"
              ? el("button", {
                  class: "profile-action-btn danger",
                  disabled: busy,
                  onclick: () => act(async () => {
                    await api.setOrderStatus(o.id, "cancelled");
                    await load();
                  }),
                }, "Отменить заказ")
              : null,
          ]),
        ]);
      })
    );
  }

  // ── Кабинет продавца ──────────────────────────────────────────────────────
  function shopForm(shop) {
    return el("div", { class: "ad-form" }, [
      el("p", { class: "settings-field-label" }, "Название"),
      shopFields.title,
      el("p", { class: "settings-field-label" }, "Город"),
      shopFields.city,
      el("p", { class: "settings-field-label" }, "О магазине"),
      shopFields.about,
      imagePicker(shopImage, "Обложка магазина", (url) => {
        shopImage = url;
        render();
      }),
      el("div", { class: "ad-form-actions" }, [
        el("button", {
          class: "btn-accent",
          disabled: busy,
          onclick: () => act(async () => {
            await api.saveShop({
              title: shopFields.title.value,
              city: shopFields.city.value,
              about: shopFields.about.value,
              imageUrl: shopImage,
              isOpen: shop ? shop.isOpen : true,
            });
            notice = shop ? "Магазин сохранён" : "Магазин создан — добавьте первый товар";
            await load();
          }),
        }, shop ? "Сохранить магазин" : "Создать магазин"),
      ]),
    ]);
  }

  // Картинка — одним и тем же способом для магазина и товара: файл сразу
  // ужимается до 512 пикселей и хранится как есть, без отдельной загрузки.
  function imagePicker(current, label, onPick) {
    const fileInput = el("input", {
      type: "file",
      accept: "image/*",
      class: "hidden-input",
      onchange: async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        onPick(await fileToImageDataUrl(file, 512));
      },
    });
    return el("div", { class: "market-image-picker" }, [
      current ? el("img", { class: "market-image-preview", src: current, alt: "" }) : null,
      el("button", { class: "profile-action-btn", onclick: () => fileInput.click() }, current ? "Заменить картинку" : label),
      current ? el("button", { class: "profile-action-btn danger", onclick: () => onPick(null) }, "Убрать") : null,
      fileInput,
    ]);
  }

  function productForm(p) {
    const isNew = !p;
    return el("div", { class: "ad-form" }, [
      el("p", { class: "settings-field-label" }, "Название"),
      productFields.title,
      el("p", { class: "settings-field-label" }, "Описание"),
      productFields.description,
      imagePicker(productImage, "Фото товара", (url) => {
        productImage = url;
        render();
      }),
      el("p", { class: "settings-field-label" }, "Как платят"),
      el("div", { class: "ad-placements" }, [
        el("button", {
          class: `ad-placement ${productPay === "stars" ? "active" : ""}`,
          onclick: () => {
            productPay = "stars";
            render();
          },
        }, "Звёздами в приложении"),
        el("button", {
          class: `ad-placement ${productPay === "cash" ? "active" : ""}`,
          onclick: () => {
            productPay = "cash";
            render();
          },
        }, "Деньгами при получении"),
      ]),
      el(
        "p",
        { class: "settings-toggle-hint" },
        productPay === "stars"
          ? "Звёзды спишутся с покупателя при заказе и придут вам, когда отметите выдачу. Подходит для цифровых товаров и предоплаты."
          : "Приложение денег не касается: покупатель платит вам напрямую при встрече или доставке."
      ),
      el("p", { class: "settings-field-label" }, productPay === "stars" ? "Цена, звёзд" : "Цена, ₽"),
      productPay === "stars" ? productFields.priceStars : productFields.priceRub,
      el("p", { class: "settings-field-label" }, "Сколько в наличии"),
      productFields.stock,
      el("p", { class: "settings-toggle-hint" }, "Оставьте пустым, если товар не кончается (цифровой или под заказ)."),
      el("div", { class: "ad-form-actions" }, [
        el("button", {
          class: "btn-accent",
          disabled: busy,
          onclick: () => act(async () => {
            const payload = {
              title: productFields.title.value,
              description: productFields.description.value,
              imageUrl: productImage,
              payKind: productPay,
              priceStars: Number(productFields.priceStars.value),
              priceRub: Number(productFields.priceRub.value),
              stock: productFields.stock.value === "" ? null : Number(productFields.stock.value),
            };
            if (isNew) await api.createProduct(payload);
            else await api.updateProduct(p.id, payload);
            editingProduct = null;
            await load();
          }),
        }, isNew ? "Добавить товар" : "Сохранить"),
        el("button", { class: "profile-action-btn", onclick: () => { editingProduct = null; render(); } }, "Отмена"),
      ]),
    ]);
  }

  function sellerProduct(p) {
    return el("div", { class: "ad-card" }, [
      el("div", { class: "ad-card-head" }, [
        el("div", { class: "ad-card-titles" }, [
          el("p", { class: "ad-card-title" }, p.title),
          el("p", { class: "ad-card-place" }, `${priceText(p)} · ${p.stock >= 0 ? `в наличии ${p.stock}` : "без ограничения"}`),
        ]),
        el("span", { class: `ad-status ${p.isActive ? "ok" : "muted"}` }, p.isActive ? "На витрине" : "Скрыт"),
      ]),
      p.imageUrl ? el("img", { class: "market-image-preview", src: p.imageUrl, alt: "" }) : null,
      p.description ? el("p", { class: "ad-card-text" }, p.description) : null,
      el("div", { class: "ad-card-actions" }, [
        el("button", {
          class: "profile-action-btn",
          disabled: busy,
          onclick: () => act(async () => {
            await api.updateProduct(p.id, { isActive: !p.isActive });
            await load();
          }),
        }, p.isActive ? "Скрыть" : "Вернуть на витрину"),
        el("button", { class: "profile-action-btn", onclick: () => { editingProduct = p.id; fillProductForm(p); render(); } }, "Изменить"),
        // Реклама заводится прямо отсюда: продавцу незачем знать про рекламный
        // кабинет и переносить туда название с ценой руками.
        el("button", {
          class: "profile-action-btn",
          disabled: busy,
          onclick: () => act(async () => {
            await api.promoteShop({ productId: p.id });
            notice = "Объявление создано и ушло на проверку администрации. Бюджет пополняется в Настройки → Реклама.";
          }),
        }, "Рекламировать"),
        el("button", {
          class: "profile-action-btn danger",
          onclick: () => confirm(`Удалить товар «${p.title}»?`) && act(async () => {
            await api.deleteProduct(p.id);
            await load();
          }),
        }, "Удалить"),
      ]),
      editingProduct === p.id ? productForm(p) : null,
    ]);
  }

  function sellerOrder(o) {
    const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.new;
    const open = o.status === "new" || o.status === "accepted";
    return el("div", { class: "ad-card" }, [
      el("div", { class: "ad-card-head" }, [
        el("div", { class: "ad-card-titles" }, [
          el("p", { class: "ad-card-title" }, `${o.productTitle} · ${o.qty} шт.`),
          el("p", { class: "ad-card-place" }, new Date(o.createdAt).toLocaleString("ru-RU")),
        ]),
        el("span", { class: `ad-status ${st.tone}` }, st.label),
      ]),
      el("p", { class: "ad-card-text" }, orderAmount(o)),
      o.note ? el("p", { class: "settings-toggle-hint" }, `Комментарий покупателя: ${o.note}`) : null,
      el("div", { class: "ad-card-actions" }, [
        o.chatId ? el("button", { class: "profile-action-btn", onclick: () => navigate(`/chat/${o.chatId}`) }, "Написать покупателю") : null,
        o.status === "new"
          ? el("button", {
              class: "btn-accent",
              disabled: busy,
              onclick: () => act(async () => {
                await api.setOrderStatus(o.id, "accepted");
                await load();
              }),
            }, "Принять")
          : null,
        open
          ? el("button", {
              class: "btn-accent",
              disabled: busy,
              onclick: () => act(async () => {
                await api.setOrderStatus(o.id, "done");
                await load();
              }),
            }, o.payKind === "stars" ? "Выдан — получить звёзды" : "Выдан")
          : null,
        open
          ? el("button", {
              class: "profile-action-btn danger",
              disabled: busy,
              onclick: () => act(async () => {
                await api.setOrderStatus(o.id, "cancelled");
                await load();
              }),
            }, "Отменить")
          : null,
      ]),
    ]);
  }

  function cabinet() {
    if (!mine) return el("p", { class: "empty-hint" }, "Загрузка…");
    if (!mine.shop) {
      return el("div", { class: "market-cabinet" }, [
        el("div", { class: "settings-notice-box" }, [
          el("p", { class: "settings-toggle-title" }, "Свой магазин"),
          el("p", { class: "settings-toggle-hint" }, "Витрина внутри Shalter: товары, заказы и переписка с покупателем в одном месте. Платить можно звёздами внутри приложения или деньгами при получении — это вы выбираете для каждого товара."),
        ]),
        shopForm(null),
      ]);
    }

    const openOrders = mine.orders.filter((o) => o.status === "new" || o.status === "accepted");
    const closedOrders = mine.orders.filter((o) => o.status === "done" || o.status === "cancelled");
    return el("div", { class: "market-cabinet" }, [
      el("div", { class: "ad-balance" }, [
        el("span", { html: iconSvg("Zap", 16) }),
        el("p", {}, [el("strong", {}, `⭐ ${fmt(mine.balanceStars)}`), " на балансе — сюда приходит оплата звёздами"]),
      ]),
      // Ссылка на витрину прямо в кабинете: продавцу она нужна каждый раз, когда
      // он о магазине кому-то рассказывает, и искать её на самой витрине — лишний
      // круг.
      el("div", { class: "market-link-row" }, [
        el("span", { class: "mono market-link-text" }, shopLink(mine.shop, me)),
        el("button", { class: "profile-action-btn", onclick: (e) => copyLink(shopLink(mine.shop, me), e.currentTarget) }, "Скопировать"),
        el("button", { class: "profile-action-btn", onclick: () => shareLink(shopLink(mine.shop, me), `🛍 ${mine.shop.title}`) }, "Отправить в чат"),
      ]),
      el("div", { class: "ad-card-actions" }, [
        el("button", { class: "profile-action-btn", onclick: () => navigate(`/market/shop/${mine.shop.id}`) }, "Открыть витрину"),
        el("button", {
          class: "profile-action-btn",
          disabled: busy,
          onclick: () => act(async () => {
            await api.saveShop({ ...mine.shop, isOpen: !mine.shop.isOpen });
            notice = mine.shop.isOpen ? "Магазин закрыт — витрина скрыта из каталога" : "Магазин снова открыт";
            await load();
          }),
        }, mine.shop.isOpen ? "Закрыть магазин" : "Открыть магазин"),
        el("button", {
          class: "profile-action-btn",
          disabled: busy,
          onclick: () => act(async () => {
            await api.promoteShop({});
            notice = "Объявление о магазине создано и ушло на проверку. Бюджет пополняется в Настройки → Реклама.";
          }),
        }, "Рекламировать магазин"),
      ]),

      el("p", { class: "market-section-title" }, `Заказы (${openOrders.length})`),
      openOrders.length ? el("div", {}, openOrders.map(sellerOrder)) : el("p", { class: "empty-hint" }, "Новых заказов нет"),

      el("p", { class: "market-section-title" }, `Товары (${mine.products.length})`),
      editingProduct === "new"
        ? productForm(null)
        : el("button", { class: "btn-accent", onclick: () => { editingProduct = "new"; fillProductForm(null); render(); } }, [
            el("span", { html: iconSvg("Plus", 15) }),
            "Добавить товар",
          ]),
      ...mine.products.map(sellerProduct),

      el("p", { class: "market-section-title" }, "Настройки магазина"),
      shopForm(mine.shop),

      closedOrders.length
        ? el("div", {}, [el("p", { class: "market-section-title" }, "Завершённые заказы"), ...closedOrders.map(sellerOrder)])
        : null,
    ]);
  }

  function render() {
    mount(
      root,
      el("div", { class: "contacts-view market-view" }, [
        header("Маркет", "/"),
        el(
          "div",
          { class: "market-tabs" },
          TABS.map((t) =>
            el("button", {
              class: `market-tab ${tab === t.id ? "active" : ""}`,
              onclick: () => navigate(t.id ? `/market/${t.id}` : "/market"),
            }, t.label)
          )
        ),
        notice ? el("p", { class: "market-notice" }, notice) : null,
        error ? el("p", { class: "login-error" }, error) : null,
        el("div", { class: "market-body" }, [
          tab === "" ? ListingsBoard() : tab === "shops" ? feed() : tab === "orders" ? buyerOrders() : cabinet(),
        ]),
      ])
    );
  }

  render();
  await load();
  // Форма магазина заполняется после загрузки: до неё нечего показывать, а
  // после — поля уже стоят в дереве и просто получают значения.
  if (mine?.shop) {
    shopFields.title.value = mine.shop.title;
    shopFields.city.value = mine.shop.city;
    shopFields.about.value = mine.shop.about;
    shopImage = mine.shop.imageUrl;
    render();
  }
}

// ── Страница магазина ───────────────────────────────────────────────────────
// Отдельный адрес: /market/shop/:id. На него ведут ссылка из рекламы и ссылка,
// которую продавец кидает в переписке.
export async function ShopView(root, shopId) {
  let data = null;
  let error = null;
  const me = getState().user;

  function openProduct(p) {
    if (data.isMine) return navigate("/market/my");
    if (p.stock === 0) return;
    openOrderDialog({ ...p, shopTitle: data.shop.title }, {
      balanceStars: data.balanceStars ?? 0,
      onDone: (order) => navigate(order?.chatId ? `/chat/${order.chatId}` : "/market/orders"),
    });
  }

  function render() {
    if (error) return mount(root, el("div", { class: "contacts-view market-view" }, [header("Магазин", "/market"), el("p", { class: "empty-hint" }, error)]));
    if (!data) return mount(root, el("div", { class: "contacts-view market-view" }, [header("Магазин", "/market"), el("p", { class: "empty-hint" }, "Загрузка…")]));

    const { shop, owner, products } = data;
    mount(
      root,
      el("div", { class: "contacts-view market-view" }, [
        header(shop.title, "/market"),
        el("div", { class: "market-shop-head" }, [
          shop.imageUrl ? el("img", { class: "market-shop-cover", src: shop.imageUrl, alt: "" }) : null,
          el("div", { class: "market-shop-info" }, [
            el("p", { class: "market-shop-title" }, [shop.title, shop.isOpen ? null : el("span", { class: "ad-status danger" }, "Закрыт")]),
            shop.city ? el("p", { class: "market-card-shop" }, shop.city) : null,
            shop.about ? el("p", { class: "ad-card-text" }, shop.about) : null,
            el("div", { class: "ad-card-actions" }, [
              owner && owner.id !== me.id
                ? el("button", { class: "profile-action-btn", onclick: () => navigate(owner.username ? `/u/${owner.username}` : "/market") }, `Продавец: ${owner.name}`)
                : null,
              // Ссылку даём всем, а не только владельцу: чаще магазин
              // пересылают друг другу покупатели, а не хозяин.
              el("button", { class: "profile-action-btn", onclick: (e) => copyLink(shopLink(shop, owner), e.currentTarget) }, "Скопировать ссылку"),
              el("button", { class: "profile-action-btn", onclick: () => shareLink(shopLink(shop, owner), `🛍 ${shop.title}`) }, "Отправить в чат"),
              data.isMine ? el("button", { class: "btn-accent", onclick: () => navigate("/market/my") }, "Управлять магазином") : null,
            ]),
          ]),
        ]),
        products.length
          ? el("div", { class: "market-grid" }, products.map((p) => productCard({ ...p, shopTitle: shop.title }, openProduct)))
          : el("p", { class: "empty-hint" }, "В этом магазине пока нет товаров"),
      ])
    );
  }

  render();
  try {
    data = await api.marketShop(shopId);
  } catch (err) {
    error = err.message || "Магазин не найден";
  }
  render();
}
