import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// Positioned popover menu appended to <body>, closes on outside click/Escape —
// vanilla-JS port of components/DropdownMenu.tsx (React portal -> direct body append).
export function openDropdownMenu(pos, items) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // First guess, refined once the menu is in the DOM and its real size is
  // known (see the clamp after appendChild). The old code assumed every menu
  // was about 200px tall, which is wrong for a short menu near the bottom edge
  // and very wrong for the gift picker.
  const left = Math.min(pos.x, vw - 220);
  const top = pos.y;

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

  // Now that it's laid out (and .dropdown-menu's max-height has been applied),
  // keep it fully on screen: prefer opening downwards from the click, flip above
  // it when there isn't room, and clamp to the viewport either way. An 8px
  // margin keeps it off the very edge.
  const MARGIN = 8;
  // Measure first, place second. A menu's width is content-based, so measuring
  // it while it sits near the right edge gives the *squeezed* width — move it
  // left to fit and it grows, which stops it fitting again. Parking it at the
  // left margin (invisible, for one frame) gives its natural size, and only
  // then is the final position computed from a number that won't change.
  menu.style.visibility = "hidden";
  menu.style.left = `${MARGIN}px`;
  menu.style.top = `${MARGIN}px`;
  const width = menu.getBoundingClientRect().width;
  const height = menu.getBoundingClientRect().height;

  let x = Math.min(pos.x, vw - width - MARGIN);
  let y = pos.y;
  if (y + height > vh - MARGIN) {
    // Not enough room below the click — open upwards from it, or clamp.
    y = pos.y - height > MARGIN ? pos.y - height : vh - height - MARGIN;
  }
  menu.style.left = `${Math.max(MARGIN, x)}px`;
  menu.style.top = `${Math.max(MARGIN, y)}px`;
  menu.style.visibility = "";

  // Defer listener attach so the click that opened the menu doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
  }, 0);

  return close;
}
