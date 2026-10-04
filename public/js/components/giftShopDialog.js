import { showToast } from "./toast.js";
import { navigate } from "../router.js";
import { setState, getState } from "../state.js";
import { askText, askConfirm } from "./confirmDialog.js";
import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { renderGiftArt } from "../lib/giftTraits.js";
import { GIFT_BACKDROUNDS, giftBackdropById, giftBackgroundValue, renderGiftBackdrop } from "../lib/giftBackground.js";
import { openStarsDialog } from "./starsDialog.js";
import { openContactPickerDialog } from "./contactPickerDialog.js";
import { openAnimatorEditor } from "./animatorEditor.js";
import { Avatar } from "./avatar.js";
import { cachedUser, fetchUsers } from "../lib/userLookup.js";

// Окно «Отправить подарок» как popups/sendGift.tsx в tweb: первая страница — получатель
// и сетка подарков с чипами-категориями, вторая — превью подарка в чате, подпись,
// «Скрыть моё имя» и кнопка «Отправить за ⭐ N».

const CATEGORIES = [
  { id: "all", label: "Все" },
  { id: "rare", label: "Редкие" },
  { id: "available", label: "В наличии" },
  { id: "mine", label: "Мои" },
];
const PRICE_CHIPS = [10, 20, 30, 50];
const NOTE_MAX = 128;

const fmt = (n) => Number(n ?? 0).toLocaleString("ru-RU");
// Баланс в шапке — коротко, как в Telegram: «12 345», «1,2 млн», «5 млрд»; огромное — «999+ трлн».
function fmtShort(n) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v >= 1e15) return "999+ трлн";
  if (v < 100000) return fmt(v);
  return new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}
const firstName = (name) => String(name ?? "").trim().split(/\s+/)[0] || "получателю";

// gift — подарок, выбранный заранее (карточка подарка в профиле или в чате → «Отправить такой же»):
// как в tweb, окно сразу открывается на странице отправки этого подарка.
export function openGiftShopDialog({ recipient = null, onSent, gift: preset = null } = {}) {
  const me = getState().user;
  let gifts = [];
  let myGifts = [];
  let balance = 0;
  let loaded = false;
  let category = "all";
  let priceFilter = null;
  let loadError = null;
  let target = recipient?.id === me?.id ? null : recipient;
  let chosen = null; // { gift, mine }
  let note = "";
  let anonymous = false;
  let backdropId = ""; // выбранный фон подарка, "" — без фона
  let sending = false;
  let listScrollTop = 0;

  const overlay = el("div", { class: "modal-overlay sg-overlay", onclick: (e) => e.target === overlay && close() });
  const popup = el("div", { class: "sg-popup", role: "dialog", "aria-modal": "true", "aria-label": "Отправить подарок" });
  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  const onKey = (e) => {
    if (e.key !== "Escape" || overlay.nextElementSibling) return;
    e.stopPropagation();
    if (chosen) back();
    else close();
  };
  document.addEventListener("keydown", onKey);

  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }

  async function load() {
    try {
      const [res, mine] = await Promise.all([api.listGifts(), api.listCustomGifts().catch(() => ({ gifts: [] }))]);
      gifts = res.gifts ?? [];
      balance = res.balance ?? 0;
      myGifts = mine.gifts ?? [];
      loadError = null;
    } catch (err) {
      loadError = err.message || "Не удалось загрузить подарки";
    }
    loaded = true;
    if (openPreset()) return;
    render();
  }

  function openPreset() {
    if (!preset) return false;
    const wanted = preset;
    preset = null;
    const presetId = wanted.giftId ?? wanted.id;
    const fromCatalog = gifts.find((g) => g.id === presetId);
    const fromMine = !fromCatalog ? myGifts.find((g) => g.id === presetId) : null;
    const found = fromCatalog ?? fromMine;
    if (!found) {
      showToast(`«${wanted.name ?? "Этот подарок"}» сейчас нельзя купить — выберите другой`);
      return false;
    }
    if (fromCatalog && fromCatalog.supply != null && (fromCatalog.remaining ?? 0) <= 0) {
      showToast(`«${fromCatalog.name}» распродан — выберите другой`);
      return false;
    }
    choose(found, !!fromMine);
    return true;
  }

  function balancePill() {
    return el(
      "button",
      { type: "button", class: "sg-balance", title: `Баланс: ${fmt(balance)} ⭐ — купить звёзды`, onclick: () => openStarsDialog(load) },
      [el("span", { class: "sg-balance-label" }, "Баланс"), el("span", { class: "sg-balance-value" }, `⭐ ${fmtShort(balance)}`)]
    );
  }

  function iconBtn(icon, label, onclick) {
    return el("button", { type: "button", class: "sg-icon-btn", "aria-label": label, title: label, html: iconSvg(icon, 22), onclick });
  }

  function pickRecipient(then) {
    openContactPickerDialog(
      (picked) => {
        target = picked;
        then?.();
        render();
      },
      "Кому подарить",
      { exclude: [me?.id] }
    );
  }

  // ---------- страница 1: выбор подарка ----------

  function visibleGifts() {
    let list = gifts;
    if (category === "rare") list = list.filter((g) => g.exclusive || g.supply);
    if (category === "available") list = list.filter((g) => !g.supply || (g.remaining ?? 0) > 0);
    if (priceFilter) list = list.filter((g) => g.priceStars <= priceFilter);
    return list;
  }

  function giftTile(g) {
    const soldOut = g.supply != null && (g.remaining ?? 0) <= 0;
    let badge = null;
    if (soldOut) badge = el("span", { class: "tw-gift-badge sg-badge-soldout" }, [el("span", { class: "tw-gift-badge-text" }, "распродан")]);
    else if (g.supply) badge = el("span", { class: "tw-gift-badge" }, [el("span", { class: "tw-gift-badge-text" }, "лимит")]);
    else if (g.exclusive) badge = el("span", { class: "tw-gift-badge sg-badge-rare" }, [el("span", { class: "tw-gift-badge-text" }, "редкий")]);
    return el(
      "button",
      {
        type: "button",
        class: `tw-gift-item sg-gift${soldOut ? " sg-gift-soldout" : ""}`,
        title: soldOut ? `${g.name} — распродан` : `${g.name} — ⭐ ${fmt(g.priceStars)}`,
        "aria-label": g.name,
        onclick: () => {
          if (soldOut) return showToast(`«${g.name}» распродан`);
          choose(g, false);
        },
      },
      [
        badge,
        el("span", { class: "tw-gift-sticker" }, [renderGiftArt(g, { size: 72, replay: false })]),
        el("span", { class: "tw-gift-price" }, [el("span", { class: "tw-gift-star" }, "⭐"), fmt(g.priceStars)]),
      ].filter(Boolean)
    );
  }

  function mineTile(g) {
    return el("div", { class: "sg-mine-wrap" }, [
      el(
        "button",
        { type: "button", class: "tw-gift-item sg-gift", title: `Подарить «${g.name}»`, "aria-label": g.name, onclick: () => choose(g, true) },
        [
          el("span", { class: "tw-gift-sticker" }, [renderGiftArt(g, { size: 72, replay: false })]),
          el("span", { class: "tw-gift-price sg-price-free" }, "Бесплатно"),
        ]
      ),
      el("div", { class: "sg-mine-tools" }, [
        el("button", { type: "button", class: "sg-mine-tool", title: "Изменить", "aria-label": "Изменить", html: iconSvg("Edit", 14), onclick: () => editMine(g) }),
        el("button", { type: "button", class: "sg-mine-tool danger", title: "Удалить", "aria-label": "Удалить", html: iconSvg("Trash", 14), onclick: () => deleteMine(g) }),
      ]),
    ]);
  }

  function recipientHero() {
    const u = target ? cachedUser(target.id) ?? target : null;
    if (target && !cachedUser(target.id)) fetchUsers([target.id]).then((changed) => changed && !chosen && render()).catch(() => {});
    return el("div", { class: "sg-hero" }, [
      el("div", { class: "sg-hero-glow" }),
      u
        ? el("button", { type: "button", class: "sg-hero-avatar", title: "Сменить получателя", onclick: () => pickRecipient() }, [
            Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 100 }),
          ])
        : el("button", { type: "button", class: "sg-hero-avatar sg-hero-empty", title: "Выбрать получателя", html: iconSvg("Gift", 44), onclick: () => pickRecipient() }),
      el("h2", { class: "sg-title" }, "Отправить подарок"),
      el(
        "p",
        { class: "sg-subtitle" },
        target
          ? `${target.name} получит подарок в профиль, а в вашем чате появится сообщение о нём.`
          : "Выберите, кому подарить, — подарок появится в профиле получателя и в чате."
      ),
      el("button", { type: "button", class: "sg-recipient-chip", onclick: () => pickRecipient() }, target ? `Кому: ${target.name} · изменить` : "Выбрать получателя"),
    ]);
  }

  function chips() {
    return el("div", { class: "sg-chips", role: "tablist" }, [
      ...CATEGORIES.map((c) =>
        el(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": String(category === c.id && !priceFilter),
            class: `sg-chip${category === c.id && !priceFilter ? " active" : ""}`,
            onclick: () => {
              category = c.id;
              priceFilter = null;
              render();
            },
          },
          c.label
        )
      ),
      ...(category === "mine"
        ? []
        : PRICE_CHIPS.map((p) =>
            el(
              "button",
              {
                type: "button",
                class: `sg-chip${priceFilter === p ? " active" : ""}`,
                onclick: () => {
                  priceFilter = priceFilter === p ? null : p;
                  render();
                },
              },
              `⭐ ${p}`
            )
          )),
    ]);
  }

  function gridSection() {
    if (!loaded) return el("div", { class: "sg-empty" }, [el("div", { class: "qr-login-spinner" })]);
    if (loadError) return el("p", { class: "sg-empty" }, loadError);
    if (category === "mine") {
      return el("div", { class: "tw-gifts-grid" }, [
        el("button", { type: "button", class: "tw-gift-item sg-gift sg-create", onclick: createMine }, [
          el("span", { class: "sg-create-icon", html: iconSvg("Plus", 28) }),
          el("span", { class: "sg-create-label" }, "Нарисовать"),
        ]),
        ...myGifts.map(mineTile),
      ]);
    }
    const list = visibleGifts();
    if (!list.length) return el("p", { class: "sg-empty" }, "Под фильтр ничего не подошло");
    return el("div", { class: "tw-gifts-grid" }, list.map(giftTile));
  }

  function renderList() {
    const header = el("div", { class: "sg-header" }, [
      iconBtn("X", "Закрыть", close),
      el("div", { class: "sg-header-title" }, "Отправить подарок"),
      balancePill(),
    ]);
    // Подарок выбран заранее — пока грузится каталог, не мелькаем сеткой, сразу ждём страницу отправки.
    const scroll = el(
      "div",
      { class: "sg-scroll" },
      preset && !loaded ? [el("div", { class: "sg-empty sg-preset-loading" }, [el("div", { class: "qr-login-spinner" })])] : [recipientHero(), chips(), gridSection()]
    );
    scroll.addEventListener("scroll", () => popup.classList.toggle("sg-scrolled", scroll.scrollTop > 8), { passive: true });
    const page = el("div", { class: "sg-page sg-page-list" }, [header, scroll]);
    popup.append(page);
    scroll.scrollTop = listScrollTop;
    popup.classList.toggle("sg-scrolled", scroll.scrollTop > 8);
    return scroll;
  }

  // ---------- страница 2: отправка выбранного подарка ----------

  function choose(gift, mine) {
    const go = () => {
      listScrollTop = popup.querySelector(".sg-scroll")?.scrollTop ?? 0;
      chosen = { gift, mine };
      note = "";
      sending = false;
      render();
    };
    if (!target) return pickRecipient(go);
    go();
  }

  function back() {
    chosen = null;
    render();
  }

  // Выбор фона подарка — как в tweb, где фон задаётся вместе с подарком и
  // рисуется теми же тремя слоями (край, свечение, узор символом).
  function backdropPicker(onPick) {
    const label = el("span", { class: "sg-bg-label" });
    const swatches = el("div", { class: "sg-bg-swatches", role: "radiogroup", "aria-label": "Фон подарка" });
    const paint = () => {
      const picked = giftBackdropById(backdropId);
      label.textContent = `Фон подарка · ${picked?.name ?? "Без фона"}`;
      clear(swatches);
      for (const option of GIFT_BACKDROUNDS) {
        const selected = option.id === backdropId;
        const swatch = el(
          "button",
          {
            type: "button",
            role: "radio",
            "aria-checked": String(selected),
            class: `sg-bg-swatch${selected ? " sel" : ""}`,
            title: option.rarity != null ? `${option.name} — ${option.rarity}%` : option.name,
            "aria-label": option.name,
            onclick: () => {
              backdropId = option.id;
              paint();
              onPick();
            },
          },
          [renderGiftBackdrop(option.id ? option : null, { small: true, className: "sg-bg-preview" })]
        );
        swatches.append(swatch);
      }
    };
    paint();
    return el("div", { class: "sg-bg-picker" }, [label, swatches]);
  }

  function renderChosen() {
    const { gift, mine } = chosen;
    const price = mine ? 0 : gift.priceStars ?? 0;
    const canAnon = !!me?.isPremium;
    const short = price > balance;

    const fromName = el("span", {}, "");
    const fromAvatarSlot = el("span", { class: "tw-gift-from-user" });
    const msgEl = el("p", { class: "tw-gift-message" });
    const hintEl = el("p", { class: "tw-gift-note" }, `${target.name} сможет показать этот подарок в своём профиле.`);
    const syncPreview = () => {
      clear(fromAvatarSlot);
      if (!anonymous) fromAvatarSlot.append(Avatar({ name: me?.name ?? "Вы", color: me?.avatarColor, image: me?.avatarImage, size: 16 }));
      fromName.textContent = anonymous ? "Аноним" : me?.name ?? "Вы";
      fromAvatarSlot.append(fromName);
      msgEl.textContent = note;
      msgEl.hidden = !note;
      hintEl.hidden = !!note;
      counter.textContent = `${NOTE_MAX - note.length}`;
    };

    const counter = el("span", { class: "sg-input-counter" });
    const input = el("input", {
      type: "text",
      class: "sg-input",
      placeholder: "Добавить сообщение",
      maxlength: String(NOTE_MAX),
      "aria-label": "Сообщение к подарку",
      value: note,
      oninput: (e) => {
        note = e.target.value.slice(0, NOTE_MAX);
        syncPreview();
      },
      onkeydown: (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          send();
        }
      },
    });

    const toggle = el("input", {
      type: "checkbox",
      class: "sg-toggle-input",
      checked: anonymous,
      disabled: !canAnon,
      onchange: (e) => {
        anonymous = e.target.checked;
        syncPreview();
      },
    });

    const limited = !mine && gift.supply
      ? (() => {
          const left = Math.max(0, gift.remaining ?? 0);
          const sold = gift.supply - left;
          const pct = Math.max(4, Math.min(100, (sold / gift.supply) * 100));
          return el("div", { class: "sg-limited" }, [
            el("div", { class: "sg-limited-bar" }, [
              el("div", { class: "sg-limited-fill", style: `width: ${pct}%` }),
              el("div", { class: "sg-limited-text" }, [el("span", {}, `осталось ${fmt(left)}`), el("span", {}, `продано ${fmt(sold)}`)]),
            ]),
          ]);
        })()
      : null;

    const sendBtn = el(
      "button",
      { type: "button", class: `sg-send${sending ? " busy" : ""}`, disabled: sending, onclick: () => send() },
      sending ? "Отправляем…" : mine ? "Отправить подарок" : `Отправить подарок за ⭐ ${fmt(price)}`
    );

    // Фон в превью — тот же, что уедет с подарком.
    const backdropSlot = el("div", { class: "tw-gift-backdrop-slot" });
    const syncBackdrop = () => {
      const layer = renderGiftBackdrop(backdropId ? giftBackdropById(backdropId) : null);
      clear(backdropSlot);
      if (layer) backdropSlot.append(layer);
    };
    syncBackdrop();

    const page = el("div", { class: "sg-page sg-page-chosen" }, [
      el("div", { class: "sg-header sg-header-solid" }, [
        iconBtn("ChevronLeft", "Назад", back),
        el("div", { class: "sg-header-title" }, "Отправить подарок"),
        balancePill(),
      ]),
      el("div", { class: "sg-scroll sg-chosen-scroll" }, [
        el("div", { class: "sg-preview" }, [
          el("div", { class: "tw-gift sg-preview-gift" }, [
            el("div", { class: "system-message" }, [
              el("span", { class: "system-message-text" }, mine ? "Вы отправили подарок" : `Вы отправили подарок за ${fmt(price)} ⭐`),
            ]),
            el("div", { class: `tw-gift-box${gift.supply ? " is-unique" : ""}` }, [
              gift.supply ? el("span", { class: "tw-gift-ribbon" }, `1 из ${fmt(gift.supply)}`) : null,
              backdropSlot,
              el("div", { class: "tw-gift-art" }, [renderGiftArt(gift, { size: 120, replay: true })]),
              el("p", { class: "tw-gift-from" }, ["Подарок от ", fromAvatarSlot]),
              el("p", { class: "tw-gift-name" }, gift.name),
              msgEl,
              hintEl,
            ].filter(Boolean)),
          ]),
        ]),
        el("div", { class: "sg-sheet" }, [
          limited,
          el("label", { class: "sg-input-wrap" }, [input, counter]),
          el("label", { class: `sg-row${canAnon ? "" : " disabled"}` }, [
            el("span", { class: "sg-row-title" }, "Скрыть моё имя"),
            el("span", { class: "sg-toggle" }, [toggle, el("span", { class: "sg-toggle-track" })]),
          ]),
        ].filter(Boolean)),
        backdropPicker(syncBackdrop),
        el(
          "p",
          { class: "sg-hint" },
          canAnon
            ? `${target.name} и посетители профиля не увидят, от кого этот подарок.`
            : "Анонимные подарки доступны с Premium."
        ),
        short ? el("p", { class: "sg-hint sg-hint-warn" }, `Не хватает ${fmt(price - balance)} ⭐ — при отправке предложим докупить.`) : null,
      ].filter(Boolean)),
      el("div", { class: "sg-footer" }, [sendBtn]),
    ]);
    popup.append(page);
    syncPreview();
    if (window.matchMedia?.("(pointer: fine)").matches) input.focus();
  }

  async function send() {
    if (!chosen || sending || !target) return;
    // Последняя проверка перед запросом: подарок себе не отправляем.
    if (target.id === me?.id) {
      showToast("Нельзя подарить подарок самому себе");
      target = null;
      back();
      return;
    }
    const { gift, mine } = chosen;
    sending = true;
    render();
    try {
      const background = giftBackgroundValue(backdropId ? giftBackdropById(backdropId) : null);
      const res = mine
        ? await api.sendCustomGift(gift.id, target.id, background, anonymous, note.trim() || null)
        : await api.buyGift(gift.id, target.id, background, anonymous, note.trim() || null);
      if (res?.balance != null) balance = res.balance;
      onSent?.();
      return finish(res?.chatId, gift, res?.serial);
    } catch (err) {
      sending = false;
      if (err.message && /не хватает/i.test(err.message)) {
        render();
        if (await askConfirm(`${err.message}. Открыть покупку звёзд?`)) openStarsDialog(load);
        return;
      }
      showToast(err.message || "Не удалось отправить подарок");
      await load();
    }
  }

  // Как в Telegram: после отправки — сразу в чат с получателем, где лежит подарок.
  function finish(chatId, gift, serial) {
    showToast(`«${gift.name}» отправлен — ${target.name}${serial ? `, №${serial}` : ""}`);
    close();
    if (!chatId) return;
    document.querySelectorAll(".profile-panel-overlay").forEach((o) => o.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    document.querySelectorAll(".modal-overlay").forEach((o) => o.querySelector(".profile-dialog, .gift-card-dialog") && o.remove());
    api.listChats().then((r) => setState({ chats: r.chats }), () => {});
    navigate(`/chat/${chatId}`);
  }

  // ---------- свои нарисованные подарки ----------

  function createMine() {
    openAnimatorEditor({
      title: "Нарисовать подарок",
      saveLabel: "Сохранить подарок",
      onSave: async (scene) => {
        const name = ((await askText("Название подарка")) || "").trim();
        if (!name) return;
        try {
          const { gift } = await api.createCustomGift(name, scene);
          myGifts = [gift, ...myGifts];
          showToast(`Подарок «${gift.name}» сохранён`);
          render();
        } catch (err) {
          showToast(err.message || "Не удалось сохранить");
        }
      },
    });
  }

  function editMine(gift) {
    openAnimatorEditor({
      title: "Изменить подарок",
      saveLabel: "Сохранить",
      initial: gift.scene,
      onSave: async (scene) => {
        try {
          const { gift: updated } = await api.updateCustomGift(gift.id, { scene });
          myGifts = myGifts.map((g) => (g.id === updated.id ? updated : g));
          render();
        } catch (err) {
          showToast(err.message || "Не удалось сохранить");
        }
      },
    });
  }

  async function deleteMine(gift) {
    if (!(await askConfirm(`Удалить подарок «${gift.name}»?`))) return;
    try {
      await api.deleteCustomGift(gift.id);
      myGifts = myGifts.filter((g) => g.id !== gift.id);
    } catch (err) {
      showToast(err.message || "Не удалось удалить");
    }
    render();
  }

  function render() {
    const prev = popup.querySelector(".sg-page-list .sg-scroll");
    if (prev) listScrollTop = prev.scrollTop;
    const wasChosen = popup.classList.contains("sg-is-chosen");
    clear(popup);
    popup.classList.toggle("sg-is-chosen", !!chosen);
    popup.classList.remove("sg-scrolled");
    if (chosen) renderChosen();
    else renderList();
    const page = popup.lastElementChild;
    if (wasChosen !== !!chosen) page?.classList.add(chosen ? "sg-enter-forward" : "sg-enter-back");
  }

  render();
  load();
}
