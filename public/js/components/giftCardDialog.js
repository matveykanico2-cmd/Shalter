import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { giftTraits, renderGiftArt } from "../lib/giftTraits.js";

function row(label, value, rarity) {
  return el("div", { class: "gift-card-row" }, [
    el("span", { class: "gift-card-row-label" }, label),
    el("span", { class: "gift-card-row-value" }, [
      value,
      rarity != null ? el("span", { class: "gift-card-rarity" }, `${rarity}%`) : null,
    ].filter(Boolean)),
  ]);
}

export function openGiftCardDialog(gift, { ownerName, onSend, onRemove, onTogglePin } = {}) {
  const traits = giftTraits(gift);
  const [from, to] = traits.backdrop.colors;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const dialog = el("div", { class: "modal-dialog gift-card-dialog" }, [
    el("div", { class: "gift-card-hero", style: `--gift-from: ${from}; --gift-to: ${to}` }, [
      // Узор фона как у коллекционных подарков Telegram: символ, окрашенный в цвет узора фона.
      el(
        "div",
        { class: "gift-card-pattern", style: `--gift-symbol: url("${traits.symbol.image}"); --gift-pattern: ${traits.backdrop.pattern}` },
        Array.from({ length: 18 }, () => el("span", {}))
      ),
      el("div", { class: "gift-card-emoji" }, [renderGiftArt(gift, { size: 96, replay: true })]),
      el("p", { class: "gift-card-name" }, gift.name),
      el(
        "p",
        { class: "gift-card-serial" },
        gift.serial != null ? `Коллекционный подарок №${gift.serial}` : "Подарок"
      ),
    ]),
    el("div", { class: "gift-card-rows" }, [
      ownerName ? row("Владелец", ownerName) : null,
      gift.fromName ? row("От кого", gift.fromName) : null,
      gift.note ? row("Сообщение", gift.note) : null,
      row("Модель", traits.model.name, traits.model.rarity),
      row("Фон", traits.backdrop.name, traits.backdrop.rarity),
      row("Узор", traits.symbol.name, traits.symbol.rarity),
      gift.serial != null && gift.supply ? row("Количество", `${gift.serial}/${gift.supply} выпущено`) : null,
      gift.priceStars ? row("Цена", `⭐ ${Number(gift.priceStars).toLocaleString("ru-RU")}`) : null,
    ].filter(Boolean)),
    onSend ? el("button", { class: "btn-accent gift-card-send", onclick: () => (close(), onSend()) }, "Отправить такой же") : null,
    onTogglePin
      ? el(
          "button",
          { class: "modal-cancel", onclick: () => (close(), onTogglePin()) },
          gift.pinned ? "Открепить" : "Закрепить на профиле"
        )
      : null,
    onRemove
      ? el("button", { class: "modal-cancel danger", onclick: () => (close(), onRemove()) }, "Убрать с полки")
      : null,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Закрыть"),
  ].filter(Boolean));
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }
}
