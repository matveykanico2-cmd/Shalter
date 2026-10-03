// «Волна» от точки нажатия на кнопках, строках списков и пунктах меню — как в
// Telegram Web. Один делегированный обработчик на документ: компоненты ничего
// не подключают, достаточно, чтобы элемент подходил под RIPPLE_SELECTOR.

const RIPPLE_SELECTOR = [
  "[data-ripple]",
  ".chat-list-item",
  ".icon-btn",
  ".composer-icon-btn",
  ".btn-accent",
  ".btn-accent-pill",
  ".btn-secondary",
  ".dropdown-item",
  ".settings-row",
  ".settings-toggle-row",
  ".settings-device-row",
  ".info-panel-row",
  ".profile-action-btn",
  ".contact-row",
  ".forward-row",
  ".search-user-row",
  ".sidebar-menu-btn",
  ".sidebar-fab",
  ".choice-dialog-btn",
  ".chat-tab",
  ".search-filter-chip",
].join(",");

const usable = new WeakMap();

function reducedMotion() {
  return document.documentElement.hasAttribute("data-reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Слою волны нужен позиционированный родитель. Если элемент статичный, делаем
// его relative — но только когда внутри нет абсолютно спозиционированных
// детей, которые привязаны к кому-то выше и съехали бы.
function canHost(host) {
  if (usable.has(host)) return usable.get(host);
  const style = getComputedStyle(host);
  let ok = style.display !== "inline" && style.display !== "contents";
  if (ok && style.position === "static") {
    const kids = host.querySelectorAll("*");
    for (let i = 0; i < kids.length && i < 200; i++) {
      const p = getComputedStyle(kids[i]).position;
      // Абсолютный ребёнок, привязанный к кому-то внутри элемента, не пострадает.
      const anchoredInside = p === "absolute" && kids[i].offsetParent && host.contains(kids[i].offsetParent) && kids[i].offsetParent !== host;
      if ((p === "absolute" || p === "fixed") && !anchoredInside) {
        ok = false;
        break;
      }
    }
    if (ok) host.classList.add("ripple-host");
  }
  usable.set(host, ok);
  return ok;
}

function start(e) {
  if (e.button !== 0 || reducedMotion()) return;
  const host = e.target.closest?.(RIPPLE_SELECTOR);
  if (!host || host.disabled || host.getAttribute("aria-disabled") === "true" || !canHost(host)) return;

  let layer = host.querySelector(":scope > .ripple-layer");
  if (!layer) {
    layer = document.createElement("span");
    layer.className = "ripple-layer";
    layer.setAttribute("aria-hidden", "true");
    host.prepend(layer);
  }
  const rect = layer.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  // Радиус — до самого дальнего угла, чтобы круг закрыл элемент целиком.
  const r = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));
  const circle = document.createElement("span");
  circle.className = "ripple-circle";
  circle.style.cssText = `left:${x - r}px;top:${y - r}px;width:${r * 2}px;height:${r * 2}px`;
  layer.append(circle);

  const born = performance.now();
  const finish = () => {
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
    host.removeEventListener("pointerleave", finish);
    // Даём волне дорасти хотя бы наполовину, потом растворяем.
    const wait = Math.max(0, 200 - (performance.now() - born));
    setTimeout(() => {
      circle.classList.add("ripple-fade");
      setTimeout(() => circle.remove(), 320);
    }, wait);
  };
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
  host.addEventListener("pointerleave", finish);
}

export function initRipple() {
  document.addEventListener("pointerdown", start, { passive: true });
}
