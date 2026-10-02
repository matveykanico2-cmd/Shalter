import { el } from "../lib/dom.js";

export const PREMIUM_VARIANTS = ["accent"];

const STAR_SVG = `
<svg viewBox="0 0 24 24" aria-hidden="true" class="ps-star" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
  <path d="M12 2.5l2.95 6.4 7 .75-5.2 4.8 1.45 6.9L12 17.35 5.8 21.35l1.45-6.9-5.2-4.8 7-.75Z"/>
</svg>`;

export function PremiumStar({ size = 22, variant, seed = "", title = "Premium", className = "" } = {}) {
  return el("span", {
    class: `premium-star ${className}`,
    title,
    style: `width:${size}px; height:${size}px`,
    html: STAR_SVG,
  });
}

export function PremiumStarRow({ size = 64 } = {}) {
  return el("div", { class: "premium-star-row" }, [PremiumStar({ size, title: "Shalter Premium" })]);
}
