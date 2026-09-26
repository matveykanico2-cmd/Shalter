import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { renderGiftArt } from "../lib/giftTraits.js";
import { openStarsDialog } from "./starsDialog.js";
import { openContactPickerDialog } from "./contactPickerDialog.js";
import { openAnimatorEditor } from "./animatorEditor.js";
import { GIFT_BACKGROUNDS, giftBackgroundStyle } from "../lib/giftBackground.js";

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
  // Свои подарки, нарисованные в аниматоре — бесплатные и дарятся без звёзд.
  { id: "mine", label: "Мои" },
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
  let myGifts = []; // свои нарисованные подарки (вкладка «Мои»)
  let background = null; // выбранный фон подарка (lib/giftBackground.js), null = без фона
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
      const mine = await api.listCustomGifts();
      myGifts = mine.gifts ?? [];
    } catch (err) {
      error = err.message || "Не удалось загрузить подарки";
    }
    render();
  }

  // Нарисовать свой подарок в аниматоре и сохранить в «Мои».
  function createMine() {
    openAnimatorEditor({
      title: "Нарисовать подарок",
      saveLabel: "Сохранить подарок",
      onSave: async (scene) => {
        const name = (prompt("Название подарка") || "").trim();
        if (!name) return;
        try {
          const { gift } = await api.createCustomGift(name, scene);
          myGifts = [gift, ...myGifts];
          notice = `Подарок «${gift.name}» сохранён`;
          render();
        } catch (err) {
          error = err.message || "Не удалось сохранить";
          render();
        }
      },
    });
  }

  // Подарить свой подарок — бесплатно. Без получателя сначала спросим кого.
  async function sendMine(gift) {
    if (!target) {
      openContactPickerDialog((picked) => {
        target = picked;
        sendMine(gift);
      }, "Кому подарить");
      return;
    }
    if (busyId) return;
    busyId = gift.id;
    error = null;
    notice = null;
    render();
    try {
      await api.sendCustomGift(gift.id, target.id, background);
      notice = `«${gift.name}» отправлен — ${target.name}`;
      onSent?.();
    } catch (err) {
      error = err.message || "Не удалось отправить подарок";
    } finally {
      busyId = null;
      render();
    }
  }

  // Открыть свой подарок в аниматоре и переделать рисунок.
  function editMine(gift) {
    openAnimatorEditor({
      title: "Изменить подарок",
      saveLabel: "Сохранить",
      initial: gift.scene,
      onSave: async (scene) => {
        try {
          const { gift: updated } = await api.updateCustomGift(gift.id, { scene });
          myGifts = myGifts.map((g) => (g.id === updated.id ? updated : g));
          notice = `Подарок «${updated.name}» обновлён`;
          render();
        } catch (err) {
          error = err.message || "Не удалось сохранить";
          render();
        }
      },
    });
  }

  async function deleteMine(gift) {
    if (!confirm(`Удалить подарок «${gift.name}»?`)) return;
    try {
      await api.deleteCustomGift(gift.id);
      myGifts = myGifts.filter((g) => g.id !== gift.id);
    } catch (err) {
      error = err.message || "Не удалось удалить";
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
      const res = await api.buyGift(gift.id, target?.id, background);
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
        el("span", { class: "gs-card-art", style: background ? { background: giftBackgroundStyle(background) } : {} }, [renderGiftArt(g, { size: 44, replay: false })]),
        el("span", { class: "gs-card-name" }, g.name),
        el("span", { class: `gs-card-price ${affordable ? "" : "short"}` }, `⭐ ${fmt(g.priceStars)}`),
        g.supply != null
          ? el("span", { class: "gs-card-supply" }, soldOut ? "Распродан" : `${fmt(g.remaining)} из ${fmt(g.supply)}`)
          : null,
      ]
    );
  }

  // Карточка своего подарка: клик — подарить (бесплатно), крестик — удалить.
  function mineCard(g) {
    return el("div", { class: "gs-card gs-card-mine" }, [
      el("button", {
        class: "gs-card-edit",
        title: "Изменить",
        onclick: (e) => { e.stopPropagation(); editMine(g); },
      }, "✎"),
      el("button", {
        class: "gs-card-del",
        title: "Удалить",
        onclick: (e) => { e.stopPropagation(); deleteMine(g); },
      }, "✕"),
      el(
        "button",
        { class: "gs-card-inner", disabled: busyId === g.id, title: `Подарить «${g.name}»`, onclick: () => sendMine(g) },
        [
          el("span", { class: "gs-card-art", style: background ? { background: giftBackgroundStyle(background) } : {} }, [renderGiftArt(g, { size: 44, replay: false })]),
          el("span", { class: "gs-card-name" }, g.name),
          el("span", { class: "gs-card-price" }, "Бесплатно"),
        ]
      ),
    ]);
  }

  // Выбор фона подарка: готовые пресеты + два своих цвета. Фон применяется ко
  // всем карточкам как превью и уходит с подарком при отправке.
  function backgroundPicker() {
    const isSel = (bg) => (bg.id === "" ? !background : background && background.from === bg.from && background.to === bg.to);
    const swatches = GIFT_BACKGROUNDS.map((bg) =>
      el(
        "button",
        {
          class: `gs-bg-swatch ${isSel(bg) ? "sel" : ""}`,
          title: bg.label,
          style: bg.from ? { background: giftBackgroundStyle({ from: bg.from, to: bg.to }) } : {},
          onclick: () => { background = bg.id === "" ? null : { from: bg.from, to: bg.to }; render(); },
        },
        bg.id === "" ? "✕" : ""
      )
    );
    // Свои цвета — onchange (не oninput), чтобы перерисовка не закрывала пипетку
    // на каждом движении.
    const fromInput = el("input", {
      type: "color",
      class: "anim-color-input",
      title: "Цвет в центре",
      value: background?.from || "#ffe08a",
      onchange: (e) => { background = { from: e.target.value, to: background?.to || "#c8860b" }; render(); },
    });
    const toInput = el("input", {
      type: "color",
      class: "anim-color-input",
      title: "Цвет по краям",
      value: background?.to || "#c8860b",
      onchange: (e) => { background = { from: background?.from || "#ffe08a", to: e.target.value }; render(); },
    });
    return el("div", { class: "gs-bg-picker" }, [
      el("span", { class: "gs-bg-label" }, "Фон подарка"),
      el("div", { class: "gs-bg-swatches" }, [...swatches, fromInput, toInput]),
    ]);
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
        backgroundPicker(),
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
        tab === "mine"
          ? el("div", { class: "gs-mine" }, [
              el("button", { class: "gs-recipient-btn gs-create-gift", onclick: createMine }, "✏️ Нарисовать подарок"),
              myGifts.length
                ? el("div", { class: "gs-grid" }, myGifts.map(mineCard))
                : el("p", { class: "moderation-empty" }, "Пока нет своих подарков — нарисуйте первый"),
            ])
          : list.length
            ? el("div", { class: "gs-grid" }, list.map(card))
            : el("p", { class: "moderation-empty" }, "Под фильтр ничего не подошло"),
      ].filter(Boolean)
    );
  }

  render();
  load();
}
