import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { showToast } from "./toast.js";
import { renderGiftArt } from "../lib/giftTraits.js";

const fmt = (n) => Number(n ?? 0).toLocaleString("ru-RU");

// Выбор подарка из каталога сеткой — та же витрина, что в окне «Отправить
// подарок» (tw-gifts-grid), с картинкой подарка и подписью. Админские кнопки
// раньше открывали ленту строк «эмодзи + название»: картинки подарка не было
// видно, а «Пиратский флаг» и прочие ZWJ-эмодзи местами рисовались квадратами.
export function openGiftPickerDialog({ gifts = [], title = "Выдать подарок", searchPlaceholder = "Поиск подарка", onPick } = {}) {
  let query = "";

  const overlay = el("div", { class: "modal-overlay sg-overlay", onclick: (e) => e.target === overlay && close() });
  const popup = el("div", { class: "sg-popup", role: "dialog", "aria-modal": "true", "aria-label": title });
  const results = el("div", { class: "sg-scroll" });
  const search = el("input", {
    class: "sg-input",
    type: "search",
    placeholder: searchPlaceholder,
    "aria-label": searchPlaceholder,
    oninput: (e) => {
      query = e.target.value.trim().toLowerCase();
      paint();
    },
  });

  function tile(g) {
    const soldOut = g.supply != null && (g.remaining ?? 0) <= 0;
    let badge = null;
    if (soldOut) badge = el("span", { class: "tw-gift-badge sg-badge-soldout" }, [el("span", { class: "tw-gift-badge-text" }, "распродан")]);
    else if (g.supply) badge = el("span", { class: "tw-gift-badge" }, [el("span", { class: "tw-gift-badge-text" }, "лимит")]);
    else if (g.exclusive) badge = el("span", { class: "tw-gift-badge sg-badge-rare" }, [el("span", { class: "tw-gift-badge-text" }, "редкий")]);
    return el(
      "button",
      {
        type: "button",
        class: `tw-gift-item sg-gift gp-tile${soldOut ? " sg-gift-soldout" : ""}`,
        title: soldOut ? `${g.name} — распродан` : `${g.name} — ⭐ ${fmt(g.priceStars)}`,
        "aria-label": g.name,
        onclick: () => {
          if (soldOut) return showToast(`«${g.name}» распродан`);
          close();
          onPick?.(g);
        },
      },
      [
        badge,
        el("span", { class: "tw-gift-sticker" }, [renderGiftArt(g, { size: 72, replay: false })]),
        el("span", { class: "gp-tile-name" }, g.name),
        el("span", { class: "tw-gift-price" }, [el("span", { class: "tw-gift-star" }, "⭐"), fmt(g.priceStars)]),
      ].filter(Boolean)
    );
  }

  function paint() {
    clear(results);
    const list = query ? gifts.filter((g) => `${g.name ?? ""} ${g.emoji ?? ""}`.toLowerCase().includes(query)) : gifts;
    if (!list.length) return results.append(el("p", { class: "sg-empty" }, "Ничего не найдено"));
    results.append(el("div", { class: "tw-gifts-grid" }, list.map(tile)));
  }

  const onKey = (e) => {
    if (e.key !== "Escape" || overlay.nextElementSibling) return;
    e.stopPropagation();
    close();
  };
  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }

  popup.append(
    el("div", { class: "sg-header" }, [
      el("button", { type: "button", class: "sg-icon-btn", "aria-label": "Закрыть", title: "Закрыть", html: iconSvg("X", 22), onclick: close }),
      el("div", { class: "sg-header-title" }, title),
    ]),
    el("div", { class: "sg-input-wrap" }, [search]),
    results
  );
  paint();
  overlay.append(popup);
  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKey);
  setTimeout(() => search.focus(), 0);
  return close;
}