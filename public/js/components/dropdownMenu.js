import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

export function openDropdownMenu(pos, items, opts = {}) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sheet = !!opts.search && vw <= 560;
  const left = Math.min(pos.x, vw - 220);
  const top = pos.y;

  function renderItem(item) {
    if (item.separator) return el("div", { class: "dropdown-separator" });
    if (item.label && !item.onClick) return el("p", { class: "dropdown-heading" }, item.label);
    return el(
      "button",
      {
        class: `dropdown-item ${item.danger ? "danger" : ""}`,
        onclick: () => {
          item.onClick();
          close();
        },
      },
      [item.icon ? el("span", { class: "dropdown-icon", html: iconSvg(item.icon, 16) }) : null, item.label]
    );
  }

  const rows = items.map((item) => ({ node: renderItem(item), text: String(item.label ?? "").toLowerCase() }));

  const empty = el("p", { class: "dropdown-empty" }, "Ничего не найдено");
  empty.hidden = true;

  const searchInput = opts.search
    ? el("input", {
        class: "dropdown-search-input",
        type: "search",
        placeholder: typeof opts.search === "string" ? opts.search : "Поиск",
        oninput: (e) => {
          const q = e.target.value.trim().toLowerCase();
          let shown = 0;
          for (const row of rows) {
            const match = !q || row.text.includes(q);
            row.node.hidden = !match;
            if (match) shown++;
          }
          empty.hidden = shown > 0;
          list.scrollTop = 0;
        },
      })
    : null;

  const list = el("div", { class: "dropdown-list" }, [...rows.map((r) => r.node), empty]);
  const menu = el(
    "div",
    { class: `dropdown-menu ${opts.search ? "has-search" : ""} ${sheet ? "dropdown-sheet" : ""}`, style: sheet ? {} : { left: `${left}px`, top: `${top}px` } },
    [searchInput ? el("div", { class: "dropdown-search" }, [searchInput]) : null, list].filter(Boolean)
  );

  let backdrop = null;
  const vv = window.visualViewport;
  function onVv() {
    if (!vv) return;
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    menu.style.setProperty("--kb", `${kb}px`);
  }

  function close() {
    document.removeEventListener("mousedown", onDown);
    document.removeEventListener("keydown", onKey);
    vv?.removeEventListener("resize", onVv);
    vv?.removeEventListener("scroll", onVv);
    backdrop?.remove();
    menu.remove();
  }
  function onDown(e) {
    if (!menu.contains(e.target)) close();
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }

  document.body.appendChild(menu);

  if (sheet) {
    backdrop = el("div", { class: "dropdown-sheet-backdrop", onclick: () => close() });
    document.body.appendChild(backdrop);
    vv?.addEventListener("resize", onVv);
    vv?.addEventListener("scroll", onVv);
    onVv();
  } else {
    const MARGIN = 8;
    menu.style.visibility = "hidden";
    menu.style.left = `${MARGIN}px`;
    menu.style.top = `${MARGIN}px`;
    // offset*, а не getBoundingClientRect: у меню анимация появления со scale(0.8),
    // и в этот момент «видимый» размер меньше настоящего — меню уезжало за край экрана
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;

    let x = Math.min(pos.x, vw - width - MARGIN);
    let y = pos.y;
    if (y + height > vh - MARGIN) {
      y = pos.y - height > MARGIN ? pos.y - height : vh - height - MARGIN;
    }
    menu.style.left = `${Math.max(MARGIN, x)}px`;
    menu.style.top = `${Math.max(MARGIN, y)}px`;
    menu.style.visibility = "";
  }

  setTimeout(() => {
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    searchInput?.focus();
  }, 0);

  return close;
}
