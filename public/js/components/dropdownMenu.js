import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// Positioned popover menu appended to <body>, closes on outside click/Escape —
// vanilla-JS port of components/DropdownMenu.tsx (React portal -> direct body append).
export function openDropdownMenu(pos, items) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.min(pos.x, vw - 220);
  const top = Math.min(pos.y, vh - 200);

  const menu = el(
    "div",
    { class: "dropdown-menu", style: { left: `${left}px`, top: `${top}px` } },
    items.map((item) =>
      item.separator
        ? el("div", { class: "dropdown-separator" })
        : item.label && !item.onClick
          ? el("p", { class: "dropdown-heading" }, item.label)
          : el(
              "button",
              {
                class: `dropdown-item ${item.danger ? "danger" : ""}`,
                onclick: () => {
                  item.onClick();
                  close();
                },
              },
              [item.icon ? el("span", { class: "dropdown-icon", html: iconSvg(item.icon, 16) }) : null, item.label]
            )
    )
  );

  function close() {
    document.removeEventListener("mousedown", onDown);
    document.removeEventListener("keydown", onKey);
    menu.remove();
  }
  function onDown(e) {
    if (!menu.contains(e.target)) close();
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }

  document.body.appendChild(menu);
  // Defer listener attach so the click that opened the menu doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
  }, 0);

  return close;
}
