import { el, clear } from "../lib/dom.js";
import { api } from "../api.js";
import { navigate } from "../router.js";

// Buying stars and setting what strangers pay to write to you.
//
// Purchases follow the same route as everything else priced in this app: the
// request lands in the administration's chat and the balance is credited once
// the transfer arrives (see AGENTS.md — no payment gateway).
export function openStarsDialog(onChanged) {
  let data = null;
  let error = null;
  let notice = null;
  let busy = false;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const bodyEl = el("div", { class: "stars-body" });
  const dialog = el("div", { class: "modal-dialog stars-dialog" }, [
    el("h2", { class: "modal-title" }, "Звёзды"),
    bodyEl,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Закрыть"),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  async function load() {
    try {
      data = await api.getStars();
    } catch (err) {
      error = err.message || "Не удалось загрузить баланс";
    }
    render();
  }

  async function buy(pack) {
    if (busy) return;
    busy = true;
    error = null;
    notice = null;
    render();
    try {
      const res = await api.requestStars(pack.id);
      if (res.granted) {
        notice = `Начислено ${pack.stars} ⭐`;
        data = await api.getStars();
        onChanged?.();
      } else if (res.chatId) {
        close();
        navigate(`/chat/${res.chatId}`);
        return;
      }
    } catch (err) {
      error = err.message || "Не удалось оформить покупку";
    } finally {
      busy = false;
      render();
    }
  }

  // Uncontrolled input read on save — re-rendering per keystroke would take the
  // focus with it.
  const priceInput = el("input", { class: "settings-input mono stars-price-input", type: "number", min: "0", step: "1" });

  async function savePrice() {
    error = null;
    notice = null;
    try {
      const { messagePriceStars } = await api.setMessagePrice(Number(priceInput.value));
      data.messagePriceStars = messagePriceStars;
      notice = messagePriceStars > 0 ? `Незнакомцы платят ${messagePriceStars} ⭐ за сообщение` : "Писать вам могут все бесплатно";
      onChanged?.();
    } catch (err) {
      error = err.message || "Не удалось сохранить";
    }
    render();
  }

  function render() {
    clear(bodyEl);
    if (!data) {
      bodyEl.append(el("p", { class: "settings-toggle-hint" }, error || "Загружаем…"));
      return;
    }
    priceInput.value = String(data.messagePriceStars ?? 0);

    bodyEl.append(
      ...[
        el("p", { class: "stars-balance" }, [el("span", { class: "stars-balance-value" }, `${data.balance} ⭐`), el("span", {}, "на балансе")]),
        notice ? el("p", { class: "admin-panel-notice" }, `✅ ${notice}`) : null,
        error ? el("p", { class: "login-error" }, error) : null,

        el("p", { class: "settings-section-title" }, "Купить"),
        el(
          "div",
          { class: "stars-pack-grid" },
          data.packs.map((p) =>
            el("button", { class: "stars-pack", disabled: busy, onclick: () => buy(p) }, [
              el("span", { class: "stars-pack-amount" }, `${p.stars} ⭐`),
              el("span", { class: "stars-pack-price mono" }, `${p.priceRub} ₽`),
            ])
          )
        ),
        el("p", { class: "settings-toggle-hint" }, "Оплата переводом администрации — заявка создастся автоматически, звёзды придут после подтверждения."),

        el("p", { class: "settings-section-title" }, "На что тратятся"),
        el("ul", { class: "stars-costs" }, [
          el("li", {}, `Поднять своё сообщение — ${data.costs.boost} ⭐ на ${data.costs.boostMinutes} мин.`),
          el("li", {}, `Удалить чужое сообщение в личной переписке — ${data.costs.delete} ⭐`),
          el("li", {}, "Написать тому, кто берёт плату за сообщения от незнакомых"),
        ]),

        el("p", { class: "settings-section-title" }, "Плата за сообщения мне"),
        el(
          "p",
          { class: "settings-toggle-hint" },
          `Сколько звёзд платит тот, кто пишет вам впервые. 0 — бесплатно для всех. Ваши контакты и те, кому вы уже отвечали, не платят никогда. Максимум ${data.costs.maxMessagePrice} ⭐.`
        ),
        el("div", { class: "stars-price-row" }, [priceInput, el("button", { class: "btn-accent-pill", onclick: savePrice }, "Сохранить")]),
      ].filter(Boolean)
    );
  }

  render();
  load();
}
