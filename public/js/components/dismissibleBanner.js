import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

const BANNER_Z_INDEX = 70;
let currentBanner = null;

export function showDismissibleBanner(message, { id, actionText, actionHandler, autoHideMs = 0, className = "" } = {}) {
  if (currentBanner) currentBanner.remove();

  const banner = el("div", {
    class: `dismissible-banner ${className}`.trim(),
    role: "status",
    "aria-live": "polite",
  }, [
    el("span", { class: "dismissible-banner-text" }, message),
    actionText && actionHandler ? el("button", {
      class: "dismissible-banner-action",
      onclick: () => {
        actionHandler();
        hideDismissibleBanner();
      },
    }, actionText) : null,
    el("button", {
      class: "dismissible-banner-close",
      title: "Скрыть",
      html: iconSvg("X", 14),
      onclick: () => {
        if (id) {
          try { localStorage.setItem(`dismissedBanner:${id}`, "1"); } catch {}
        }
        hideDismissibleBanner();
      },
    }),
  ]);

  document.body.appendChild(banner);
  currentBanner = banner;

  requestAnimationFrame(() => banner.classList.add("show"));

  if (autoHideMs > 0) {
    setTimeout(() => hideDismissibleBanner(), autoHideMs);
  }

  return banner;
}

export function hideDismissibleBanner() {
  if (currentBanner) {
    currentBanner.classList.remove("show");
    setTimeout(() => currentBanner?.remove(), 200);
    currentBanner = null;
  }
}

export function isBannerDismissed(id) {
  try { return localStorage.getItem(`dismissedBanner:${id}`) === "1"; } catch { return false; }
}

export function resetDismissedBanner(id) {
  try { localStorage.removeItem(`dismissedBanner:${id}`); } catch {}
}