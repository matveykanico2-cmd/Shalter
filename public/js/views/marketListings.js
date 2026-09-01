import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { navigate } from "../router.js";
import { Avatar } from "../components/avatar.js";
import { openListingEditor } from "../components/listingEditor.js";

// Доска объявлений — вкладка «Объявления» в маркете.
//
// Отличается от витрины магазинов рядом ровно тем, чем доска отличается от
// магазина: объявление публикует любой человек про одну свою вещь, оплаты через
// сервис нет, заказов нет — покупатель пишет продавцу, дальше они сами.
//
// Доставки тоже нет. У объявления есть только число «отправка СДЭК стоит
// столько», которое написал продавец: это подсказка покупателю, а не услуга.
const fmt = (n) => new Intl.NumberFormat("ru-RU").format(n ?? 0);

const CONDITION_LABEL = { new: "Новое", used: "Б/у" };

function priceLabel(l) {
  if (l.isNegotiable) return "Договорная";
  if (!l.priceRub) return "Даром";
  return `${fmt(l.priceRub)} ₽`;
}

// Подпись про отправку. Разделены три разных случая: продавец не отправляет,
// отправляет бесплатно и отправляет за деньги — из «0 ₽» это не читается.
function deliveryLabel(l) {
  if (l.cdekPriceRub == null) return "Только самовывоз";
  if (l.cdekPriceRub === 0) return "СДЭК — за счёт продавца";
  return `СДЭК ≈ ${fmt(l.cdekPriceRub)} ₽`;
}

export function ListingsBoard() {
  const wrap = el("div", { class: "listings-board" });
  const me = getState().user;

  // "all" — вся доска, "mine" — свои объявления, "fav" — избранное.
  let scope = "all";
  let filters = { q: "", category: "", city: "", condition: "", priceMin: "", priceMax: "", sort: "new" };
  let data = { listings: [], categories: [], cities: [] };
  let loading = true;
  let error = null;

  async function load() {
    loading = true;
    render();
    try {
      if (scope === "mine") data = { ...data, listings: (await api.myListings()).listings };
      else if (scope === "fav") data = { ...data, listings: (await api.favoriteListings()).listings };
      else data = await api.listListings(filters);
      error = null;
    } catch (err) {
      error = err.message || "Не удалось загрузить объявления";
    }
    loading = false;
    render();
  }

  // Поиск не дёргает сервер на каждую букву.
  let searchTimer = null;
  function scheduleLoad() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 350);
  }

  async function toggleFavorite(listing) {
    const on = !listing.isFavorite;
    listing.isFavorite = on; // рисуем сразу, не дожидаясь ответа
    render();
    try {
      await api.favoriteListing(listing.id, on);
      if (scope === "fav") load();
    } catch {
      listing.isFavorite = !on;
      render();
    }
  }

  async function contact(listing) {
    try {
      const { chatId } = await api.contactSeller(listing.id);
      navigate(`/chat/${chatId}`);
    } catch (err) {
      error = err.message || "Не удалось написать продавцу";
      render();
    }
  }

  function card(l) {
    const mine = l.sellerId === me?.id;
    return el("div", { class: `listing-card ${l.status !== "active" ? "closed" : ""}` }, [
      el(
        "button",
        { class: "listing-card-photo", onclick: () => openListing(l) },
        l.photos?.length
          ? el("img", { src: l.photos[0], alt: "", loading: "lazy" })
          : el("span", { class: "listing-card-nophoto", html: iconSvg("Image", 22) })
      ),
      el("div", { class: "listing-card-body" }, [
        el("button", { class: "listing-card-title", onclick: () => openListing(l) }, l.title),
        el("p", { class: "listing-card-price" }, priceLabel(l)),
        el("p", { class: "listing-card-meta" }, [
          CONDITION_LABEL[l.condition] ?? "",
          l.city ? ` · ${l.city}` : "",
          l.status === "sold" ? " · продано" : l.status === "archived" ? " · снято" : "",
        ].join("")),
        el("p", { class: "listing-card-delivery" }, deliveryLabel(l)),
      ]),
      el("div", { class: "listing-card-actions" }, [
        mine
          ? el("button", { class: "listing-mini-btn", title: "Изменить", onclick: () => edit(l) }, "Изменить")
          : el(
              "button",
              {
                class: `listing-mini-btn ${l.isFavorite ? "on" : ""}`,
                title: l.isFavorite ? "Убрать из избранного" : "В избранное",
                onclick: () => toggleFavorite(l),
              },
              l.isFavorite ? "★" : "☆"
            ),
      ]),
    ]);
  }

  function openListing(l) {
    import("../components/listingDialog.js").then(({ openListingDialog }) =>
      openListingDialog({
        listingId: l.id,
        onContact: () => contact(l),
        onFavorite: () => toggleFavorite(l),
        onChanged: load,
      })
    );
  }

  function edit(listing) {
    openListingEditor({ listing, categories: data.categories, onSaved: load });
  }

  function filtersRow() {
    const set = (key) => (e) => {
      filters[key] = e.target.value;
      scheduleLoad();
    };
    return el("div", { class: "listing-filters" }, [
      el("input", { class: "listing-search", type: "search", placeholder: "Что ищете?", value: filters.q, oninput: set("q") }),
      el("select", { class: "listing-select", onchange: set("category") }, [
        el("option", { value: "" }, "Все категории"),
        ...(data.categories ?? []).map((c) => el("option", { value: c.id, selected: filters.category === c.id }, c.label)),
      ]),
      el("select", { class: "listing-select", onchange: set("city") }, [
        el("option", { value: "" }, "Любой город"),
        ...(data.cities ?? []).map((c) => el("option", { value: c.city, selected: filters.city === c.city }, `${c.city} (${c.count})`)),
      ]),
      el("select", { class: "listing-select", onchange: set("condition") }, [
        el("option", { value: "" }, "Новое и б/у"),
        el("option", { value: "new", selected: filters.condition === "new" }, "Только новое"),
        el("option", { value: "used", selected: filters.condition === "used" }, "Только б/у"),
      ]),
      el("input", { class: "listing-price", type: "number", min: "0", placeholder: "Цена от", value: filters.priceMin, oninput: set("priceMin") }),
      el("input", { class: "listing-price", type: "number", min: "0", placeholder: "до", value: filters.priceMax, oninput: set("priceMax") }),
      el("select", { class: "listing-select", onchange: set("sort") }, [
        el("option", { value: "new" }, "Сначала новые"),
        el("option", { value: "cheap", selected: filters.sort === "cheap" }, "Сначала дешёвые"),
        el("option", { value: "expensive", selected: filters.sort === "expensive" }, "Сначала дорогие"),
      ]),
    ]);
  }

  function render() {
    clear(wrap);
    wrap.append(
      el("div", { class: "listing-scopes" }, [
        ...[
          { id: "all", label: "Все объявления" },
          { id: "mine", label: "Мои" },
          { id: "fav", label: "Избранное" },
        ].map((s) =>
          el(
            "button",
            {
              class: `market-tab ${scope === s.id ? "active" : ""}`,
              onclick: () => {
                scope = s.id;
                load();
              },
            },
            s.label
          )
        ),
        el("button", { class: "btn-accent-pill listing-add", onclick: () => openListingEditor({ categories: data.categories, onSaved: () => { scope = "mine"; load(); } }) }, "Разместить"),
      ]),
      scope === "all" ? filtersRow() : null,
      error ? el("p", { class: "login-error" }, error) : null,
      loading
        ? el("div", { class: "qr-login-spinner" })
        : data.listings.length
          ? el("div", { class: "listing-grid" }, data.listings.map(card))
          : el(
              "p",
              { class: "empty-hint" },
              scope === "mine" ? "Вы ещё ничего не разместили" : scope === "fav" ? "Пока пусто — отмечайте звёздочкой" : "Ничего не нашлось"
            )
    );
  }

  load();
  return wrap;
}
