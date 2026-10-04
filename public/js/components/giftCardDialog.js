import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { giftTraits, renderGiftArt } from "../lib/giftTraits.js";
import { giftBackdrop } from "../lib/giftBackground.js";

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
  // Выбранный при отправке фон — он и показываем; у коллекционных без выбора —
  // детерминированный фон серии (tweb: collectibleAttributes.backdrop).
  const backdrop = giftBackdrop(gift.background ?? traits.backdrop);
  const symbol = backdrop.symbol;

  // В tweb нажатие на атрибут подарка (фон, узор, модель) сразу открывает
  // отправку этого же подарка с выбранным атрибутом — handleAttributeClick
  // в starGiftInfo.tsx. Здесь строка кликабельна, если есть куда отправлять.
  const sendWithBackdrop = () => {
    if (!onSend) return;
    close();
    onSend(backdrop?.id ?? null);
  };
  const attrRow = (label, value, rarity) => {
    const node = row(label, value, rarity);
    if (!onSend) return node;
    node.classList.add("gift-card-attr");
    node.setAttribute("role", "button");
    node.setAttribute("tabindex", "0");
    node.title = `Отправить подарок с этим фоном`;
    node.addEventListener("click", sendWithBackdrop);
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        sendWithBackdrop();
      }
    });
    return node;
  };

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const dialog = el("div", { class: "modal-dialog gift-card-dialog" }, [
    el("div", { class: "gift-card-hero", style: `--gift-from: ${backdrop.center}; --gift-to: ${backdrop.edge}` }, [
      // Узор фона как у коллекционных подарков Telegram: символ, окрашенный в цвет узора фона.
      el(
        "div",
        { class: "gift-card-pattern", style: `--gift-symbol: url("${symbol.image}"); --gift-pattern: ${backdrop.pattern}` },
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
      attrRow("Фон", backdrop.name || "Без фона", backdrop.rarity),
      attrRow("Узор", symbol.name, symbol.rarity),
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
