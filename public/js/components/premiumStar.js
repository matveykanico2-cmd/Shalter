import { el } from "../lib/dom.js";

// Знак Premium — тонкая контурная звезда цвета акцента, как рядом со значком
// подтверждения в профиле (см. приложенный макет): не заливка, не золото, а
// просто обведённый контур того же цвета, что и остальной фирменный акцент
// приложения — читается как единый набор бейджей рядом с именем, а не как
// отдельная наклейка другого цвета.
//
// PREMIUM_VARIANTS оставлен пустым массивом (не удалён совсем) ради
// обратной совместимости: несколько мест в коде вызывают PremiumStar с
// variant: "gold"/"violet" — они по-прежнему работают, просто variant
// больше ничего не меняет визуально, звезда всегда одна и та же.
export const PREMIUM_VARIANTS = ["accent"];

// Контур рисуется через stroke, а не fill — цвет берётся из CSS
// (.premium-star, currentColor), поэтому здесь нет ни градиента, ни id,
// которые раньше требовали уникального суффикса на каждый вызов.
const STAR_SVG = `
<svg viewBox="0 0 24 24" aria-hidden="true" class="ps-star" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
  <path d="M12 2.5l2.95 6.4 7 .75-5.2 4.8 1.45 6.9L12 17.35 5.8 21.35l1.45-6.9-5.2-4.8 7-.75Z"/>
</svg>`;

// size — размер значка в пикселях. variant больше не влияет на цвет (см.
// комментарий выше), параметр остался только чтобы старые вызовы не ломались.
export function PremiumStar({ size = 22, variant, seed = "", title = "Premium", className = "" } = {}) {
  return el("span", {
    class: `premium-star ${className}`,
    title,
    style: `width:${size}px; height:${size}px`,
    html: STAR_SVG,
  });
}

// Раньше показывала шесть цветных вариантов — теперь такого понятия нет
// (см. выше), поэтому просто одна звезда покрупнее для заглавной картинки
// страницы Premium. Оставлена отдельной функцией, а не инлайном на месте
// вызова, чтобы не трогать settings/index.js там, где она уже используется.
export function PremiumStarRow({ size = 64 } = {}) {
  return el("div", { class: "premium-star-row" }, [PremiumStar({ size, title: "Shalter Premium" })]);
}
