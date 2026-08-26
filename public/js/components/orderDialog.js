import { el } from "../lib/dom.js";
import { api } from "../api.js";

// Оформление заказа. Отдельным окном, а не строкой в карточке товара: здесь
// человек в последний раз видит, за что и сколько платит, — и это единственный
// момент, когда решение ещё можно отменить, ничего не потратив.
//
// onDone(order) — заказ создан; экран, откуда его открыли, обновляет себя сам.
export function openOrderDialog(product, { balanceStars = 0, onDone } = {}) {
  const isStars = product.payKind === "stars";
  const unit = isStars ? product.priceStars : product.priceRub;
  const maxQty = product.stock >= 0 ? Math.max(1, product.stock) : 99;

  const qtyInput = el("input", { class: "settings-input mono", type: "number", min: 1, max: maxQty, value: "1" });
  const noteInput = el("textarea", {
    class: "settings-input",
    rows: 2,
    maxlength: 500,
    placeholder: isStars ? "Комментарий продавцу: куда прислать, какой вариант" : "Комментарий: район, удобное время, размер",
  });
  const errorSlot = el("p", { class: "login-error" });
  const totalSlot = el("p", { class: "order-total" });

  function qty() {
    return Math.min(maxQty, Math.max(1, Math.floor(Number(qtyInput.value) || 1)));
  }
  function paintTotal() {
    const total = unit * qty();
    totalSlot.textContent = isStars ? `К оплате: ⭐ ${total}` : `К оплате при получении: ${total} ₽`;
    // Не хватает звёзд — сказать об этом до нажатия, а не отказом сервера
    // после. Кнопка при этом остаётся живой: баланс можно пополнить и вернуться.
    errorSlot.textContent = isStars && total > balanceStars ? `На балансе только ⭐ ${balanceStars}` : "";
  }
  qtyInput.addEventListener("input", paintTotal);

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const submitBtn = el("button", { class: "btn-accent poll-create-btn" }, isStars ? "Заказать и оплатить" : "Оформить заказ");

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, "Заказ"),
    el("div", { class: "order-product" }, [
      product.imageUrl ? el("img", { class: "order-product-image", src: product.imageUrl, alt: "" }) : null,
      el("div", {}, [
        el("p", { class: "order-product-title" }, product.title),
        el("p", { class: "settings-toggle-hint" }, product.shopTitle ? `Магазин: ${product.shopTitle}` : ""),
        el("p", { class: "order-product-price" }, isStars ? `⭐ ${unit} за штуку` : `${unit} ₽ за штуку`),
      ]),
    ]),
    el("p", { class: "settings-field-label" }, product.stock >= 0 ? `Сколько (в наличии ${product.stock})` : "Сколько"),
    qtyInput,
    el("p", { class: "settings-field-label" }, "Комментарий продавцу"),
    noteInput,
    totalSlot,
    el(
      "p",
      { class: "settings-toggle-hint" },
      isStars
        ? "Звёзды спишутся сразу и будут держаться в заказе, пока продавец не отметит выдачу. Отмена — возврат на баланс."
        : "Деньги приложение не трогает: вы договариваетесь с продавцом в чате и платите при получении."
    ),
    errorSlot,
    submitBtn,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);

  submitBtn.addEventListener("click", async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = "Оформляем…";
    try {
      const { order } = await api.createOrder(product.id, qty(), noteInput.value.trim());
      close();
      onDone?.(order);
    } catch (err) {
      errorSlot.textContent = err.message || "Не удалось оформить заказ";
      submitBtn.disabled = false;
      submitBtn.textContent = isStars ? "Заказать и оплатить" : "Оформить заказ";
    }
  });

  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  paintTotal();
  qtyInput.focus();
}
