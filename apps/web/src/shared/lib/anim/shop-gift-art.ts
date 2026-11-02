// Рисованные подарки витрины (id sg_*): свой векторный рисунок с градиентами, свечением и
// спокойной зацикленной анимацией (классы sg-* в shop-gift-art.css). Рисунок — наш код, а не
// данные пользователя, поэтому строится из разметки. id градиентов в каждой копии свои
// ($ в разметке → уникальный префикс): одинаковые id в нескольких копиях ломают заливку,
// когда первая копия скрыта.
import "./shop-gift-art.css";

type Art = (u: string) => string;

/** Мягкое свечение за подарком. */
const glow = (u: string, color: string, r = 40) => `
  <radialGradient id="${u}glow"><stop offset="0" stop-color="${color}" stop-opacity="0.55"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
  </defs><circle class="sg-glow" cx="50" cy="52" r="${r}" fill="url(#${u}glow)"/><defs>`;

/** Искорки вокруг подарка. */
const sparkle = (x: number, y: number, s: number, color: string, i: number) =>
  `<path class="sg-twinkle sg-d${i}" d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="${color}"/>`;

const sparkles = (color = "#fff6c8") => sparkle(16, 24, 5, color, 1) + sparkle(84, 30, 4, color, 2) + sparkle(80, 78, 3.5, color, 3) + sparkle(20, 74, 3, color, 4);

const lin = (u: string, id: string, a: string, b: string, x2 = 0, y2 = 1) =>
  `<linearGradient id="${u}${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const rad = (u: string, id: string, a: string, b: string, cx = 0.35, cy = 0.3) =>
  `<radialGradient id="${u}${id}" cx="${cx}" cy="${cy}" r="0.8"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`;

const HEART = "M50 84C30 70 14 58 14 40c0-11 8-19 18-19 8 0 14 4 18 11 4-7 10-11 18-11 10 0 18 8 18 19 0 18-16 30-36 44z";

const ART: Record<string, Art> = {
  sg_heart_glow: (u) => `<defs>${glow(u, "#ff3d77")}${rad(u, "h", "#ff8fb1", "#e0164f")}</defs>
    <g class="sg-beat"><path d="${HEART}" fill="url(#${u}h)"/>
    <path d="M30 32c-6 2-9 8-8 14" stroke="#fff" stroke-opacity="0.7" stroke-width="4" fill="none" stroke-linecap="round"/></g>
    ${sparkles("#ffd1e0")}`,

  sg_rose_bloom: (u) => `<defs>${glow(u, "#ff4d6d", 34)}${rad(u, "p", "#ff7a8f", "#b3112e", 0.5, 0.35)}${lin(u, "s", "#5fcf6f", "#2a8a3e")}</defs>
    <path d="M50 54c0 14-2 26 0 36" stroke="url(#${u}s)" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path class="sg-sway" d="M50 72c-10 0-18-6-20-14 10-2 18 4 20 14z" fill="#3fae55"/>
    <path class="sg-sway sg-d2" d="M50 66c10 0 17-6 19-13-10-2-17 4-19 13z" fill="#4cbf62"/>
    <g class="sg-sway">
      <path d="M50 58c-14 0-22-9-22-20 0-9 6-16 12-18 3 6 7 8 10 8s7-2 10-8c6 2 12 9 12 18 0 11-8 20-22 20z" fill="url(#${u}p)"/>
      <path d="M50 28c-8 0-13 5-13 11 0 5 5 9 13 9s13-4 13-9c0-6-5-11-13-11z" fill="#d81f44"/>
      <path d="M44 38c2-5 9-6 12-1-3 4-9 4-12 1z" fill="#ff8da0"/>
    </g>
    ${sparkles("#ffe1e7")}`,

  sg_teddy: (u) => `<defs>${glow(u, "#ffb766", 38)}${rad(u, "f", "#d8a06a", "#8a5530")}${rad(u, "m", "#f6dcc0", "#d9ad83")}</defs>
    <g class="sg-wobble">
      <circle cx="30" cy="26" r="10" fill="url(#${u}f)"/><circle cx="70" cy="26" r="10" fill="url(#${u}f)"/>
      <circle cx="30" cy="26" r="5" fill="#f2c9a0"/><circle cx="70" cy="26" r="5" fill="#f2c9a0"/>
      <ellipse cx="50" cy="72" rx="22" ry="20" fill="url(#${u}f)"/>
      <ellipse cx="50" cy="75" rx="13" ry="12" fill="url(#${u}m)"/>
      <circle cx="50" cy="40" r="22" fill="url(#${u}f)"/>
      <ellipse cx="50" cy="47" rx="10" ry="8" fill="url(#${u}m)"/>
      <ellipse cx="50" cy="44" rx="4" ry="3" fill="#3b2416"/>
      <path d="M46 50q4 3 8 0" stroke="#3b2416" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <g class="sg-blink"><circle cx="41" cy="36" r="2.8" fill="#2a1a10"/><circle cx="59" cy="36" r="2.8" fill="#2a1a10"/></g>
      <ellipse cx="34" cy="45" rx="4" ry="2.5" fill="#ff8f8f" opacity="0.5"/><ellipse cx="66" cy="45" rx="4" ry="2.5" fill="#ff8f8f" opacity="0.5"/>
      <path d="M38 58l12 5 12-5-3 7-9-2-9 2z" fill="#e8325a"/><circle cx="50" cy="61" r="3" fill="#ff5c80"/>
    </g>
    ${sparkles()}`,

  sg_bunny: (u) => `<defs>${glow(u, "#ff9ad5", 38)}${rad(u, "f", "#ffffff", "#e3dcef")}${lin(u, "e", "#ffc6dd", "#ff8fbf")}</defs>
    <g class="sg-wobble">
      <g class="sg-ear"><ellipse cx="38" cy="22" rx="7" ry="18" fill="url(#${u}f)"/><ellipse cx="38" cy="23" rx="3.5" ry="13" fill="url(#${u}e)"/></g>
      <g class="sg-ear sg-d2"><ellipse cx="62" cy="22" rx="7" ry="18" fill="url(#${u}f)"/><ellipse cx="62" cy="23" rx="3.5" ry="13" fill="url(#${u}e)"/></g>
      <ellipse cx="50" cy="74" rx="20" ry="17" fill="url(#${u}f)"/>
      <circle cx="50" cy="48" r="20" fill="url(#${u}f)"/>
      <g class="sg-blink"><circle cx="43" cy="46" r="2.6" fill="#2b2433"/><circle cx="57" cy="46" r="2.6" fill="#2b2433"/></g>
      <path d="M48 52h4l-2 2.4z" fill="#ff7aa8"/>
      <ellipse cx="38" cy="54" rx="4" ry="2.4" fill="#ff9ec4" opacity="0.6"/><ellipse cx="62" cy="54" rx="4" ry="2.4" fill="#ff9ec4" opacity="0.6"/>
      <circle cx="50" cy="78" r="7" fill="#ffd34d"/><path d="M50 72v12M44 78h12" stroke="#ffb02e" stroke-width="2"/>
    </g>
    ${sparkles("#ffe3f2")}`,

  sg_cake: (u) => `<defs>${glow(u, "#ffcf6b", 38)}${lin(u, "a", "#ffe3ef", "#f7b6cf")}${lin(u, "b", "#ffb8d2", "#e9779f")}${rad(u, "fl", "#fff7c2", "#ff9a1f", 0.5, 0.7)}</defs>
    <ellipse cx="50" cy="86" rx="34" ry="5" fill="#000" opacity="0.12"/>
    <rect x="20" y="58" width="60" height="26" rx="6" fill="url(#${u}b)"/>
    <rect x="28" y="40" width="44" height="22" rx="6" fill="url(#${u}a)"/>
    <path d="M28 46c4 5 7 5 11 0s7-5 11 0 7 5 11 0 7-5 11 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M20 64c5 5 8 5 12 0s8-5 12 0 8 5 12 0 8-5 12 0 8 5 12 0" stroke="#fff3f8" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="34" cy="74" r="2.6" fill="#ff4f7d"/><circle cx="50" cy="76" r="2.6" fill="#5ab8ff"/><circle cx="66" cy="74" r="2.6" fill="#ffd23f"/>
    <rect x="47" y="24" width="6" height="17" rx="2" fill="#7fc8ff"/><path d="M47 28l6-3M47 34l6-3" stroke="#fff" stroke-width="1.6"/>
    <path class="sg-flame" d="M50 9c5 6 6 10 3 13-2 2-4 2-6 0-3-3-1-7 3-13z" fill="url(#${u}fl)"/>
    ${sparkles()}`,

  sg_rocket: (u) => `<defs>${glow(u, "#7aa8ff", 38)}${lin(u, "b", "#ffffff", "#c9d3e6", 1, 0)}${lin(u, "f", "#ff6a5a", "#c7203a", 1, 0)}${lin(u, "fl", "#fff3a6", "#ff6a1f")}${rad(u, "w", "#bfe8ff", "#2f7fd8")}</defs>
    <g class="sg-launch">
      <g transform="rotate(35 50 50)">
        <path class="sg-flame" d="M43 74c0 8 3 14 7 18 4-4 7-10 7-18z" fill="url(#${u}fl)"/>
        <path d="M38 62l-10 12 14-2zM62 62l10 12-14-2z" fill="url(#${u}f)"/>
        <path d="M50 10c10 8 14 22 14 36v26H36V46c0-14 4-28 14-36z" fill="url(#${u}b)"/>
        <path d="M50 10c6 5 10 11 12 18H38c2-7 6-13 12-18z" fill="url(#${u}f)"/>
        <circle cx="50" cy="42" r="7" fill="#e5ecf7"/><circle cx="50" cy="42" r="5" fill="url(#${u}w)"/>
        <path d="M47 39c1-1 3-2 4-1" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/>
        <rect x="44" y="66" width="12" height="6" rx="2" fill="#8a96ad"/>
      </g>
    </g>
    ${sparkles("#d8e6ff")}`,

  sg_diamond: (u) => `<defs>${glow(u, "#5fd3ff", 42)}${lin(u, "a", "#e4f8ff", "#5cc8f5")}${lin(u, "b", "#7fdcff", "#1e7fc4")}${lin(u, "c", "#b8ecff", "#3aa4e6", 1, 1)}
      <clipPath id="${u}clip"><path d="M50 88L12 40l14-18h48l14 18z"/></clipPath></defs>
    <g class="sg-float">
      <path d="M50 88L12 40l14-18h48l14 18z" fill="url(#${u}b)"/>
      <path d="M26 22h48l14 18H12z" fill="url(#${u}a)"/>
      <path d="M38 40l12 48 12-48-12-18z" fill="url(#${u}c)"/>
      <path d="M26 22l12 18 12-18zM50 22l12 18 12-18z" fill="#f2fcff" opacity="0.75"/>
      <path d="M12 40l26 0-12-18zM62 40h26L74 22z" fill="#9fe3ff" opacity="0.6"/>
      <g clip-path="url(#${u}clip)"><rect class="sg-shine" x="-30" y="0" width="16" height="100" fill="#fff" opacity="0.6" transform="skewX(-20)"/></g>
    </g>
    ${sparkles("#e8fbff")}`,

  sg_ring: (u) => `<defs>${glow(u, "#ffd36b", 38)}${lin(u, "g", "#fff1b0", "#c98a12", 1, 1)}${lin(u, "d", "#ffffff", "#7fd8ff", 1, 1)}</defs>
    <g class="sg-float">
      <ellipse cx="50" cy="62" rx="26" ry="24" fill="none" stroke="url(#${u}g)" stroke-width="8"/>
      <ellipse cx="50" cy="62" rx="26" ry="24" fill="none" stroke="#fff6d0" stroke-width="1.6" opacity="0.6" stroke-dasharray="20 120"/>
      <path d="M40 38h20l-4-6H44z" fill="url(#${u}g)"/>
      <path d="M50 38l-14-10 6-10h16l6 10z" fill="url(#${u}d)"/>
      <path d="M42 18h16l6 10H36z" fill="#eafaff"/><path d="M50 38l-6-10h12z" fill="#b9ecff"/>
      ${sparkle(63, 16, 6, "#ffffff", 2)}
    </g>
    ${sparkles()}`,

  sg_champagne: (u) => `<defs>${glow(u, "#ffe08a", 38)}${lin(u, "b", "#3a9a5b", "#14532d", 1, 0)}${lin(u, "f", "#ffe8a0", "#d8a62a", 1, 0)}</defs>
    <g class="sg-sway">
      <g transform="rotate(-18 50 60)">
        <path d="M42 30h16v10c6 4 8 10 8 18v28c0 3-2 5-5 5H39c-3 0-5-2-5-5V58c0-8 2-14 8-18z" fill="url(#${u}b)"/>
        <path d="M41 22h18v12H41z" fill="url(#${u}f)"/>
        <rect x="36" y="58" width="28" height="18" rx="3" fill="#fff4d6"/>
        <path d="M44 67h12" stroke="#d8a62a" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M38 46c0 10 0 30 1 40" stroke="#fff" stroke-opacity="0.35" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
    </g>
    <circle class="sg-bubble sg-d1" cx="40" cy="20" r="3" fill="#fff3c4"/>
    <circle class="sg-bubble sg-d2" cx="48" cy="14" r="2.2" fill="#fff3c4"/>
    <circle class="sg-bubble sg-d3" cx="34" cy="12" r="1.8" fill="#fff3c4"/>
    ${sparkles()}`,

  sg_trophy: (u) => `<defs>${glow(u, "#ffcc4d", 40)}${lin(u, "g", "#fff1a8", "#d4930f", 1, 1)}${lin(u, "b", "#5a3d8a", "#2b1d48")}
      <clipPath id="${u}clip"><path d="M30 16h40v24c0 13-9 22-20 22s-20-9-20-22z"/></clipPath></defs>
    <g class="sg-float">
      <path d="M30 22H20c0 14 5 20 13 22M70 22h10c0 14-5 20-13 22" stroke="url(#${u}g)" stroke-width="5" fill="none"/>
      <path d="M30 16h40v24c0 13-9 22-20 22s-20-9-20-22z" fill="url(#${u}g)"/>
      <g clip-path="url(#${u}clip)"><rect class="sg-shine" x="-30" y="0" width="14" height="70" fill="#fff" opacity="0.7" transform="skewX(-18)"/></g>
      <path d="M50 26l3 6 6.5 1-4.7 4.6 1.1 6.4-5.9-3.1-5.9 3.1 1.1-6.4-4.7-4.6 6.5-1z" fill="#fff6cf"/>
      <rect x="45" y="62" width="10" height="10" fill="url(#${u}g)"/>
      <rect x="32" y="72" width="36" height="16" rx="3" fill="url(#${u}b)"/>
      <rect x="40" y="77" width="20" height="5" rx="1.5" fill="#ffd56b"/>
    </g>
    ${sparkles()}`,

  sg_gift_box: (u) => `<defs>${glow(u, "#8f7bff", 40)}${lin(u, "b", "#8d7bff", "#4b33c9")}${lin(u, "l", "#a99bff", "#6a52e6")}${lin(u, "r", "#ffd56b", "#f29a1d")}</defs>
    <g class="sg-shake">
      <rect x="22" y="48" width="56" height="40" rx="5" fill="url(#${u}b)"/>
      <rect x="45" y="48" width="10" height="40" fill="url(#${u}r)"/>
      <g class="sg-lid">
        <rect x="18" y="36" width="64" height="14" rx="4" fill="url(#${u}l)"/>
        <rect x="45" y="36" width="10" height="14" fill="url(#${u}r)"/>
        <path d="M50 36c-6-12-20-14-20-6 0 5 10 6 20 6zM50 36c6-12 20-14 20-6 0 5-10 6-20 6z" fill="url(#${u}r)"/>
      </g>
      <path d="M26 54v28" stroke="#fff" stroke-opacity="0.25" stroke-width="3" stroke-linecap="round"/>
    </g>
    ${sparkles("#fff0b8")}`,

  sg_balloon: (u) => `<defs>${glow(u, "#ff6b8b", 34)}${rad(u, "b", "#ff9fb4", "#e0244f")}</defs>
    <g class="sg-float">
      <path d="M50 66c0 10-6 14-2 22" stroke="#c9b9c9" stroke-width="1.6" fill="none"/>
      <ellipse cx="50" cy="38" rx="22" ry="27" fill="url(#${u}b)"/>
      <path d="M46 64h8l-4 5z" fill="#c81d44"/>
      <ellipse cx="41" cy="27" rx="5" ry="9" fill="#fff" opacity="0.45" transform="rotate(25 41 27)"/>
    </g>
    ${sparkles("#ffe1e8")}`,

  sg_star: (u) => `<defs>${glow(u, "#ffd84d", 42)}${rad(u, "s", "#fffbe0", "#ffb41f", 0.45, 0.35)}</defs>
    <g class="sg-spin-soft">
      <path d="M50 10l11.8 24 26.2 3.8-19 18.5 4.5 26.1L50 70l-23.5 12.4 4.5-26.1-19-18.5 26.2-3.8z" fill="url(#${u}s)" stroke="#ffcf3f" stroke-width="2" stroke-linejoin="round"/>
      <path d="M50 22l7 14.5 15.8 2.3" stroke="#fff" stroke-opacity="0.7" stroke-width="3" fill="none" stroke-linecap="round"/>
    </g>
    ${sparkles()}`,

  sg_lollipop: (u) => `<defs>${glow(u, "#ff8de0", 34)}${rad(u, "c", "#ffe1f6", "#ff5fbf", 0.4, 0.35)}</defs>
    <rect x="48" y="56" width="4" height="34" rx="2" fill="#f4efe6"/>
    <g class="sg-spin">
      <circle cx="50" cy="38" r="22" fill="url(#${u}c)"/>
      <path d="M50 38c0-6 6-8 9-4s0 12-9 12-14-8-12-16 12-12 20-8 10 16 4 22" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.85"/>
    </g>
    <ellipse cx="42" cy="26" rx="5" ry="3" fill="#fff" opacity="0.5" transform="rotate(-30 42 26)"/>
    ${sparkles("#ffe6f7")}`,

  sg_moon: (u) => `<defs>${glow(u, "#9bb4ff", 40)}${rad(u, "m", "#fff8d6", "#f2c94c", 0.6, 0.4)}</defs>
    <g class="sg-sway">
      <path d="M60 14a34 34 0 1 0 22 52A28 28 0 0 1 60 14z" fill="url(#${u}m)"/>
      <path d="M28 60q4 3 8 0" stroke="#7a5a12" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M24 50q3-2 6 0M35 50q3-2 6 0" stroke="#7a5a12" stroke-width="2" fill="none" stroke-linecap="round"/>
      <ellipse cx="24" cy="58" rx="3.6" ry="2.2" fill="#ffab7a" opacity="0.5"/><ellipse cx="41" cy="58" rx="3.6" ry="2.2" fill="#ffab7a" opacity="0.5"/>
    </g>
    <text class="sg-zz" x="74" y="30" font-size="12" font-weight="700" fill="#cfd9ff">z</text>
    <text class="sg-zz sg-d2" x="82" y="20" font-size="9" font-weight="700" fill="#cfd9ff">z</text>
    ${sparkles("#eef2ff")}`,

  sg_crown: (u) => `<defs>${glow(u, "#ffcf4d", 44)}${lin(u, "g", "#fff2a8", "#d18b0c", 1, 1)}${rad(u, "r", "#ff9aae", "#c8102e")}${rad(u, "e", "#a8f0c4", "#14894a")}${rad(u, "s", "#b5dcff", "#1f5fd1")}
      <clipPath id="${u}clip"><path d="M18 74l-4-46 20 18 16-26 16 26 20-18-4 46z"/></clipPath></defs>
    <g class="sg-float">
      <path d="M18 74l-4-46 20 18 16-26 16 26 20-18-4 46z" fill="url(#${u}g)"/>
      <g clip-path="url(#${u}clip)"><rect class="sg-shine" x="-30" y="0" width="14" height="100" fill="#fff" opacity="0.65" transform="skewX(-18)"/></g>
      <rect x="16" y="70" width="68" height="12" rx="4" fill="url(#${u}g)"/>
      <circle cx="14" cy="27" r="4" fill="#fff1b0"/><circle cx="50" cy="19" r="4.5" fill="#fff1b0"/><circle cx="86" cy="27" r="4" fill="#fff1b0"/>
      <circle cx="34" cy="76" r="3.6" fill="url(#${u}e)"/><circle cx="50" cy="76" r="4.2" fill="url(#${u}r)"/><circle cx="66" cy="76" r="3.6" fill="url(#${u}s)"/>
      <path d="M50 44l6 9-6 9-6-9z" fill="url(#${u}r)"/>
    </g>
    ${sparkles()}`,

  sg_potion: (u) => `<defs>${glow(u, "#b46bff", 40)}${lin(u, "l", "#e08bff", "#6a1fd1")}${lin(u, "c", "#c79a6b", "#7a5230")}
      <clipPath id="${u}clip"><circle cx="50" cy="64" r="24"/></clipPath></defs>
    <g class="sg-wobble">
      <circle cx="50" cy="64" r="24" fill="#e9e3ff" opacity="0.35"/>
      <g clip-path="url(#${u}clip)"><path class="sg-liquid" d="M14 60q9-5 18 0t18 0 18 0 18 0 18 0V100H14z" fill="url(#${u}l)"/></g>
      <circle cx="50" cy="64" r="24" fill="none" stroke="#f3eeff" stroke-width="2.4"/>
      <rect x="43" y="28" width="14" height="16" fill="#e9e3ff" opacity="0.5"/>
      <rect x="41" y="20" width="18" height="10" rx="3" fill="url(#${u}c)"/>
      <ellipse cx="40" cy="56" rx="4" ry="8" fill="#fff" opacity="0.4" transform="rotate(25 40 56)"/>
    </g>
    <circle class="sg-bubble sg-d1" cx="46" cy="22" r="2.6" fill="#e6c4ff"/>
    <circle class="sg-bubble sg-d3" cx="56" cy="18" r="2" fill="#e6c4ff"/>
    ${sparkles("#f0dcff")}`,
};

export const SHOP_GIFT_ART_IDS: ReadonlySet<string> = new Set(Object.keys(ART));

let seq = 0;

/** Рисунок подарка витрины по id или null, если своего рисунка у подарка нет. */
export function renderShopGiftArt(id: string | null | undefined, { size = 84 }: { size?: number } = {}): Element | null {
  const art = id ? ART[id] : undefined;
  if (!art) return null;
  const u = `sg${++seq}-`;
  const tpl = document.createElement("template");
  tpl.innerHTML = `<svg viewBox="0 0 100 100" class="sg-art" aria-hidden="true" width="${size}" height="${size}"><defs></defs>${art(u)}</svg>`;
  const svg = tpl.content.firstElementChild as SVGSVGElement;
  svg.style.width = `${size}px`;
  svg.style.height = `${size}px`;
  return svg;
}
