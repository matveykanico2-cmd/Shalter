import { el, clear } from "../lib/dom.js";
import { api } from "../api.js";
import { Avatar } from "./avatar.js";
import { getState } from "../state.js";

// Карточка объявления целиком: фотографии, цена, описание, продавец и то, как
// с ним связаться. Открывается из ленты доски.
const fmt = (n) => new Intl.NumberFormat("ru-RU").format(n ?? 0);
const CONDITION_LABEL = { new: "Новое", used: "Б/у" };

function priceLabel(l) {
  if (l.isNegotiable) return "Цена договорная";
  if (!l.priceRub) return "Даром";
  return `${fmt(l.priceRub)} ₽`;
}

export function openListingDialog({ listingId, onContact, onFavorite, onChanged }) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "listing-view-body" });
  const dialog = el("div", { class: "modal-dialog listing-view" }, [body]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  let listing = null;
  let error = null;
  let photoIndex = 0;

  function close() {
    overlay.remove();
  }

  function render() {
    clear(body);
    if (error) {
      body.append(el("p", { class: "login-error" }, error), el("button", { class: "modal-cancel", onclick: close }, "Закрыть"));
      return;
    }
    if (!listing) {
      body.appendChild(el("div", { class: "qr-login-spinner" }));
      return;
    }
    const me = getState().user;
    const mine = listing.sellerId === me?.id;
    const photos = listing.photos ?? [];

    body.append(
      photos.length
        ? el("div", { class: "listing-view-gallery" }, [
            el("img", { class: "listing-view-photo", src: photos[photoIndex], alt: "" }),
            photos.length > 1
              ? el(
                  "div",
                  { class: "listing-view-thumbs" },
                  photos.map((url, i) =>
                    el("button", {
                      class: `listing-view-thumb ${i === photoIndex ? "active" : ""}`,
                      onclick: () => {
                        photoIndex = i;
                        render();
                      },
                    }, el("img", { src: url, alt: "" }))
                  )
                )
              : null,
          ])
        : null,
      el("h2", { class: "listing-view-title" }, listing.title),
      el("p", { class: "listing-view-price" }, priceLabel(listing)),
      el("p", { class: "listing-view-meta" }, [
        CONDITION_LABEL[listing.condition] ?? "",
        listing.city ? ` · ${listing.city}` : "",
        ` · ${listing.views} просмотров`,
        listing.status === "sold" ? " · продано" : listing.status === "archived" ? " · снято" : "",
      ].join("")),
      // Про отправку — отдельной строкой и без обиняков: сервис в ней не
      // участвует, это условие продавца.
      el("div", { class: "listing-view-delivery" }, [
        el("p", { class: "listing-view-delivery-title" },
          listing.cdekPriceRub == null
            ? "Только самовывоз"
            : listing.cdekPriceRub === 0
              ? "Отправка СДЭК за счёт продавца"
              : `Отправка СДЭК — примерно ${fmt(listing.cdekPriceRub)} ₽`),
        el("p", { class: "settings-toggle-hint" }, "Отправляет продавец сам. Shalter доставку не оформляет и денег за неё не берёт — сумма указана продавцом для ориентира."),
      ]),
      listing.description ? el("p", { class: "listing-view-description" }, listing.description) : null,
      listing.seller
        ? el("div", { class: "listing-view-seller" }, [
            Avatar({ name: listing.seller.name, color: listing.seller.avatarColor, image: listing.seller.avatarImage, size: 36 }),
            el("div", {}, [
              el("p", { class: "listing-view-seller-name" }, listing.seller.name),
              listing.seller.username ? el("p", { class: "settings-toggle-hint" }, `@${listing.seller.username}`) : null,
            ]),
          ])
        : null,
      el("div", { class: "listing-view-actions" }, [
        el("button", { class: "modal-cancel", onclick: close }, "Закрыть"),
        mine
          ? null
          : el(
              "button",
              {
                class: "btn-secondary",
                onclick: () => {
                  onFavorite?.();
                  listing.isFavorite = !listing.isFavorite;
                  render();
                },
              },
              listing.isFavorite ? "★ В избранном" : "☆ В избранное"
            ),
        mine
          ? null
          : el("button", { class: "btn-accent", onclick: () => { close(); onContact?.(); } }, "Написать продавцу"),
      ].filter(Boolean))
    );
  }

  render();
  api
    .getListing(listingId)
    .then((r) => {
      listing = r.listing;
      render();
      onChanged?.();
    })
    .catch((err) => {
      error = err.message || "Не удалось открыть объявление";
      render();
    });

  return { close };
}
