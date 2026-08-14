import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { renderScene } from "../lib/animScenes.js";
import { openStarsDialog } from "./starsDialog.js";
import { openContactPickerDialog } from "./contactPickerDialog.js";

// The gift shop: priced in stars, paid from the balance, delivered instantly.
//
// Shaped after what the brief pointed at: the balance sits in the header (that's
// where you decide whether you can afford anything), gifts are cards with a star
// price, limited runs carry a "Редкий" badge, and the tabs narrow a 286-entry
// catalogue down to something browsable.
const TABS = [
  { id: "all", label: "Все подарки" },
  { id: "rare", label: "Редкие" },
  { id: "available", label: "В наличии" },
];
// Price shortcuts, matching the cheap end of the catalogue where most of it sits.
const PRICE_TABS = [10, 20, 30, 50];

export function openGiftShopDialog({ recipient = null, onSent } = {}) {
  let gifts = [];
  let balance = 0;
  let tab = "all";
  let priceFilter = null;
  let error = null;
  let notice = null;
  let busyId = null;
  let target = recipient; // null = buying for yourself

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const bodyEl = el("div", { class: "gs-body" });
  const balanceEl = el("button", { class: "gs-balance", title: "Купить звёзды", onclick: () => openStarsDialog(load) });
  const dialog = el("div", { class: "modal-dialog gs-dialog" }, [
    el("div", { class: "gs-head" }, [el("h2", { class: "modal-title" }, "Подарки"), balanceEl]),
    bodyEl,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Закрыть"),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  const fmt = (n) => Number(n).toLocaleString("ru-RU");

  async function load() {
    try {
      const res = await api.listGifts();
      gifts = res.gifts;
      balance = res.balance ?? 0;
    } catch (err) {
      error = err.message || "Не удалось загрузить подарки";
    }
    render();
  }

  async function buy(gift) {
    if (busyId) return;
    busyId = gift.id;
    error = null;
    notice = null;
    render();
    try {
      const res = await api.buyGift(gift.id, target?.id);
      balance = res.balance ?? balance;
      notice = `${gift.emoji} «${gift.name}» отправлен${target ? ` — ${target.name}` : " вам"}${res.serial ? `, №${res.serial}` : ""}`;
      onSent?.();
      // A limited gift's remaining count just changed for everyone.
      const fresh = await api.listGifts();
      gifts = fresh.gifts;
      balance = fresh.balance ?? balance;
    } catch (err) {
      if (err.message && /не хватает/i.test(err.message)) {
        error = err.message;
        // The balance is the blocker, so put the top-up right where they are.
        if (confirm(`${err.message}. Открыть покупку звёзд?`)) openStarsDialog(load);
      } else {
        error = err.message || "Не удалось отправить подарок";
        await load();
      }
    } finally {
      busyId = null;
      render();
    }
  }

  function visible() {
    let list = gifts;
    if (tab === "rare") list = list.filter((g) => g.exclusive || g.supply);
    if (tab === "available") list = list.filter((g) => !g.supply || (g.remaining ?? 0) > 0);
    if (priceFilter) list = list.filter((g) => g.priceStars <= priceFilter);
    return list;
  }

  function card(g) {
    const soldOut = g.supply != null && (g.remaining ?? 0) <= 0;
    const affordable = balance >= g.priceStars;
    return el(
      "button",
      {
        class: `gs-card ${g.exclusive ? "gs-card-rare" : ""} ${soldOut ? "gs-card-sold" : ""}`,
        disabled: soldOut || busyId === g.id,
        title: soldOut ? "Распродан" : `${g.name} — ${fmt(g.priceStars)} ⭐`,
        onclick: () => buy(g),
      },
      [
        g.exclusive ? el("span", { class: "gs-rare-badge" }, "Редкий") : null,
        el("span", { class: "gs-card-art" }, [renderScene(g.emoji, { size: 44, replay: false })]),
        el("span", { class: "gs-card-name" }, g.name),
        el("span", { class: `gs-card-price ${affordable ? "" : "short"}` }, `⭐ ${fmt(g.priceStars)}`),
        g.supply != null
          ? el("span", { class: "gs-card-supply" }, soldOut ? "Распродан" : `${fmt(g.remaining)} из ${fmt(g.supply)}`)
          : null,
      ]
    );
  }

  function render() {
    balanceEl.textContent = "";
    balanceEl.append(el("span", { class: "gs-balance-label" }, "Баланс"), el("span", { class: "gs-balance-value" }, `⭐ ${fmt(balance)}`));

    clear(bodyEl);
    const list = visible();
    bodyEl.append(
      ...[
        el("div", { class: "gs-recipient" }, [
          el("span", {}, target ? `Кому: ${target.name}` : "Кому: себе"),
          el("button", {
            class: "gs-recipient-btn",
            onclick: () =>
              openContactPickerDialog((picked) => {
                target = picked;
                render();
              }, "Кому подарить"),
          }, "Выбрать"),
          target ? el("button", { class: "gs-recipient-btn", onclick: () => { target = null; render(); } }, "Себе") : null,
        ]),
        notice ? el("p", { class: "admin-panel-notice" }, `✅ ${notice}`) : null,
        error ? el("p", { class: "login-error" }, error) : null,
        el(
          "div",
          { class: "gs-tabs" },
          [
            ...TABS.map((t) =>
              el("button", { class: `gs-tab ${tab === t.id && !priceFilter ? "active" : ""}`, onclick: () => { tab = t.id; priceFilter = null; render(); } }, t.label)
            ),
            ...PRICE_TABS.map((p) =>
              el("button", { class: `gs-tab ${priceFilter === p ? "active" : ""}`, onclick: () => { priceFilter = priceFilter === p ? null : p; render(); } }, `⭐ ${p}`)
            ),
          ]
        ),
        list.length
          ? el("div", { class: "gs-grid" }, list.map(card))
          : el("p", { class: "moderation-empty" }, "Под фильтр ничего не подошло"),
      ].filter(Boolean)
    );
  }

  render();
  load();
}
