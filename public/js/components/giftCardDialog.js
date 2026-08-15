import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { renderScene } from "../lib/animScenes.js";
import { giftTraits } from "../lib/giftTraits.js";

// Карточка коллекционного подарка: сам подарок на своём фоне, владелец и
// таблица свойств с редкостью.
//
// До этого подарок в профиле был крошечной фишкой с эмодзи и номером, и о нём
// нельзя было узнать ничего сверх того, что он есть. Здесь у экземпляра
// появляется лицо: модель, фон, узор и то, насколько каждое из них редкое
// (lib/giftTraits.js — свойства выводятся из номера, а не хранятся).

function row(label, value, rarity) {
  return el("div", { class: "gift-card-row" }, [
    el("span", { class: "gift-card-row-label" }, label),
    el("span", { class: "gift-card-row-value" }, [
      value,
      rarity != null ? el("span", { class: "gift-card-rarity" }, `${rarity}%`) : null,
    ].filter(Boolean)),
  ]);
}

export function openGiftCardDialog(gift, { ownerName, onSend, onRemove } = {}) {
  const traits = giftTraits(gift);
  const [from, to] = traits.backdrop.colors;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const dialog = el("div", { class: "modal-dialog gift-card-dialog" }, [
    el("div", { class: "gift-card-hero", style: `--gift-from: ${from}; --gift-to: ${to}` }, [
      // Узор повторяется по всему фону, как в оригинале: он и делает экземпляр
      // узнаваемым с одного взгляда, ещё до чтения таблицы.
      el("div", { class: "gift-card-pattern" }, Array.from({ length: 18 }, () => el("span", {}, traits.symbol.glyph))),
      el("div", { class: "gift-card-emoji" }, [renderScene(gift.emoji, { size: 96, replay: true })]),
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
      row("Модель", traits.model.name, traits.model.rarity),
      row("Фон", traits.backdrop.name, traits.backdrop.rarity),
      row("Узор", traits.symbol.name, traits.symbol.rarity),
      gift.serial != null && gift.supply ? row("Количество", `${gift.serial}/${gift.supply} выпущено`) : null,
      gift.priceStars ? row("Цена", `⭐ ${Number(gift.priceStars).toLocaleString("ru-RU")}`) : null,
    ].filter(Boolean)),
    onSend ? el("button", { class: "btn-accent gift-card-send", onclick: () => (close(), onSend()) }, "Отправить такой же") : null,
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
