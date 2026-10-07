import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// Плашка реакций, как в tweb (components/chat/reactionsMenu.ts): быстрые реакции
// в ряд, кнопка ▾ раскрывает полный список (эмодзи и стикеры). Открывается
// двойным нажатием на сообщение; меню действий (три точки, правый клик) — отдельно.
//
// opts:
//   quick       — быстрые реакции в плашке
//   premium     — реакции для Premium (без Premium — с замком)
//   isPremium   — есть ли у пользователя Premium
//   full        — { emojis, stickers } для раскрытого списка; null — только quick
//   chosen      — Set реакций, которые пользователь уже поставил
//   glyph(e, size)  — отрисовка реакции (анимированный эмодзи / стикер / текст)
//   onReact(e)  — поставить/снять реакцию
//   onLocked()  — нажали реакцию Premium без Premium
let closeOpen = null;

export function openReactionsBar(pos, opts) {
  closeOpen?.();
  const { quick = [], premium = [], isPremium = false, full = null, chosen = new Set(), glyph, onReact, onLocked } = opts;

  // Синтетический click касания, которым плашку открыли, — не выбор реакции.
  const openedAt = Date.now();
  const GHOST_MS = 400;
  const pick = (emoji, locked) => {
    if (Date.now() - openedAt < GHOST_MS) return;
    close();
    if (locked) onLocked?.();
    else onReact(emoji);
  };

  // Анимации (Lottie) не создаются сразу: десяток плееров, стартующих разом,
  // дёргал появление плашки, а на ~1900 эмодзи раскрытого списка вешал интерфейс.
  // Кнопка рисуется обычным символом, а живой glyph подставляется позже (upgrade).
  // plain — так и остаётся символом (эмодзи раскрытого списка).
  const reactionBtn = (emoji, { locked = false, size = 30, title, plain = false, sticker = false } = {}) => {
    const stub = sticker
      ? el("span", { class: "rmenu-stub", style: { width: `${size}px`, height: `${size}px` } })
      : el("span", { class: "rmenu-emoji" }, emoji);
    const btn = el(
      "button",
      {
        type: "button",
        class: `rmenu-reaction${chosen.has(emoji) ? " chosen" : ""}${locked ? " locked" : ""}`,
        title: title ?? (locked ? "Реакция для Premium" : ""),
        "aria-label": title ?? emoji,
        onclick: () => pick(emoji, locked),
      },
      [stub, locked ? el("span", { class: "rmenu-lock", html: iconSvg("Lock", 9) }) : null]
    );
    if (!plain) {
      btn._upgrade = () => {
        btn._upgrade = null;
        if (!closed && stub.isConnected) stub.replaceWith(glyph(emoji, size));
      };
    }
    return btn;
  };

  const stripButtons = [...quick.map((e) => reactionBtn(e)), ...premium.map((e) => reactionBtn(e, { locked: !isPremium }))];
  const strip = el("div", { class: "rmenu-strip" }, stripButtons);
  // После анимации появления — по одной, чтобы не стартовать все плееры в одном кадре.
  const upgradeTimers = [];
  stripButtons.forEach((b, i) => upgradeTimers.push(setTimeout(() => b._upgrade?.(), 220 + i * 45)));
  const moreBtn = full
    ? el("button", { type: "button", class: "rmenu-more", title: "Все реакции", "aria-label": "Все реакции", html: iconSvg("ChevronDown", 18), onclick: () => expand() })
    : null;
  const bar = el("div", { class: "rmenu", role: "menu", "aria-label": "Реакции" }, [el("div", { class: "rmenu-row" }, [strip, moreBtn])]);

  // ▾ — полный список под строкой (tweb: onMoreClick → emoticons dropdown).
  function expand() {
    if (!full || bar.classList.contains("expanded")) return;
    bar.classList.add("expanded");
    const stickerButtons = (full.stickers ?? []).map((s) => reactionBtn(s.value, { size: 28, title: s.name, sticker: true }));
    const grid = el("div", { class: "rmenu-grid" }, [
      el("p", { class: "rmenu-grid-title" }, "Эмодзи"),
      el("div", { class: "rmenu-grid-items" }, full.emojis.map((e) => reactionBtn(e, { size: 26, plain: true }))),
      stickerButtons.length ? el("p", { class: "rmenu-grid-title" }, "Стикеры") : null,
      stickerButtons.length ? el("div", { class: "rmenu-grid-items" }, stickerButtons) : null,
    ]);
    bar.appendChild(grid);
    // Стикеры оживают, только когда до них доскроллили.
    if (stickerButtons.length) {
      if (typeof IntersectionObserver === "undefined") stickerButtons.forEach((b) => b._upgrade?.());
      else {
        gridObserver = new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (!e.isIntersecting) continue;
              gridObserver.unobserve(e.target);
              e.target._upgrade?.();
            }
          },
          { root: grid, rootMargin: "80px" }
        );
        stickerButtons.forEach((b) => gridObserver.observe(b));
      }
    }
    place();
  }

  // Над точкой нажатия (над сообщением), а если сверху мало места — под ней.
  function place() {
    const MARGIN = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = bar.offsetWidth;
    const height = bar.offsetHeight;
    let y = pos.y - height - 16;
    if (y < MARGIN) y = pos.y + 16;
    const x = pos.x - width / 2;
    bar.style.left = `${Math.max(MARGIN, Math.min(x, vw - width - MARGIN))}px`;
    bar.style.top = `${Math.max(MARGIN, Math.min(y, vh - height - MARGIN))}px`;
  }

  function onDown(e) {
    if (Date.now() - openedAt < GHOST_MS || bar.contains(e.target)) return;
    close();
  }
  // Escape закрывает только плашку — не чат под ней (у ленты свой Escape).
  function onKey(e) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }
  // Прокрутка ленты под нераскрытой плашкой — закрываем, иначе она «висит» не там.
  function onScroll(e) {
    if (!bar.contains(e.target) && !bar.classList.contains("expanded")) close();
  }

  let closed = false;
  let gridObserver = null;
  function close() {
    if (closed) return;
    closed = true;
    upgradeTimers.forEach(clearTimeout);
    gridObserver?.disconnect();
    if (closeOpen === close) closeOpen = null;
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", place);
    bar.remove();
  }

  document.body.appendChild(bar);
  place();
  requestAnimationFrame(() => bar.classList.add("is-visible"));
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", place);
  closeOpen = close;
  return close;
}
