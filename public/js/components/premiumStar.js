import { el } from "../lib/dom.js";

// Знак Premium: белая звезда в скруглённом квадрате.
//
// Раньше премиум обозначала системная корона 👑 — картинка из шрифта, которая
// у каждого своя (на телефоне одна, в вебе другая) и внутри неподвижна. Здесь
// звезда нарисована, поэтому у неё двигаются части: по квадрату проходит блик,
// звезда чуть покачивается и в конце цикла коротко вспыхивает лучами.
//
// Фон — не один: варианты ниже отличаются градиентом, и это способ показать
// разные уровни («на месяц», «на год», «навсегда») одной и той же фигурой, не
// заводя четыре разные картинки.
export const PREMIUM_VARIANTS = ["violet", "gold", "aqua", "sunset", "rose", "night"];

// Звезда рисуется один раз на вызов и вставляется строкой — как остальные
// значки в icons.js. Пользовательский ввод сюда не попадает.
//
// Раньше это была плоская однотонная заливка — читалась как силуэт, не как
// огранённый камень. Теперь заливка идёт градиентом (белый центр → холодный
// голубоватый край, как грань, поймавшая тень) плюс небольшой блик-глянец
// сверху слева, имитирующий отражение света на гранёной поверхности —
// ровно то, чего не хватало рядом с настоящим значком Premium в Telegram.
//
// Градиент/блик — через <defs> с id, а id в инлайновом SVG виден всему
// документу разом: без уникального суффикса шесть звёзд подряд
// (PremiumStarRow) стали бы ссылаться на один и тот же <linearGradient>,
// и половина рисовалась бы неправильно. uid делает каждый вызов независимым.
let uidCounter = 0;
function starSvg(uid) {
  return `
<svg viewBox="0 0 24 24" aria-hidden="true" class="ps-star">
  <defs>
    <linearGradient id="ps-fill-${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="60%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#dbe6ff"/>
    </linearGradient>
    <radialGradient id="ps-glint-${uid}" cx="35%" cy="30%" r="45%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <path d="M12 2.6l2.7 5.9 6.4.7-4.8 4.4 1.3 6.3L12 16.7 6.4 19.9l1.3-6.3-4.8-4.4 6.4-.7z"
    fill="url(#ps-fill-${uid})"/>
  <path d="M12 2.6l2.7 5.9 6.4.7-4.8 4.4 1.3 6.3L12 16.7 6.4 19.9l1.3-6.3-4.8-4.4 6.4-.7z"
    fill="url(#ps-glint-${uid})"/>
</svg>`;
}

// size — сторона квадрата. variant — фон (см. PREMIUM_VARIANTS); если не задан,
// выбирается по имени владельца, чтобы у одного человека значок был всегда
// одинаковым, а у разных — разным.
export function PremiumStar({ size = 22, variant, seed = "", title = "Premium", className = "" } = {}) {
  const chosen = variant && PREMIUM_VARIANTS.includes(variant) ? variant : pickVariant(seed);
  const uid = `${Date.now().toString(36)}${uidCounter++}`;
  const box = el("span", {
    class: `premium-star ps-${chosen} ${className}`,
    title,
    style: { width: `${size}px`, height: `${size}px`, borderRadius: `${Math.max(5, Math.round(size * 0.3))}px` },
    html: `<span class="ps-shine"></span>${starSvg(uid)}`,
  });
  return box;
}

// Тот же человек — тот же фон. Простая сумма кодов символов: смысл здесь не в
// равномерности, а в устойчивости выбора между перерисовками.
function pickVariant(seed) {
  const s = String(seed ?? "");
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n + s.charCodeAt(i)) % 997;
  return PREMIUM_VARIANTS[n % PREMIUM_VARIANTS.length];
}

// Ряд из всех вариантов — для страницы Premium: показывает, что значок бывает
// разным, и заодно служит её заглавной картинкой.
export function PremiumStarRow({ size = 44 } = {}) {
  return el(
    "div",
    { class: "premium-star-row" },
    PREMIUM_VARIANTS.map((v, i) => {
      const star = PremiumStar({ size, variant: v, title: `Premium — ${v}` });
      // Разбег по фазе: одинаково мигающий ряд читается как гирлянда, а с
      // разбегом — как отдельные значки.
      star.style.animationDelay = `${i * 0.35}s`;
      star.querySelector(".ps-shine").style.animationDelay = `${i * 0.35}s`;
      return star;
    })
  );
}
