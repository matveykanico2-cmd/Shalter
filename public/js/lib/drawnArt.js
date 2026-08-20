import { GIFT_ART, GIFT_ART_FOR_EMOJI } from "./giftArt.js";

// Нарисованные стикеры и подарки — векторные, с частями, которые двигаются
// раздельно.
//
// Эмодзи здесь не участвуют вовсе: системная картинка неподвижна внутри, её
// можно только двигать целиком, и «стикер» из неё выходит бедный. Здесь у
// каждой вещи свои фигуры — рука машет отдельно от лица, сердце бьётся отдельно
// от рук, крышка подарка отлетает отдельно от коробки.
//
// Разметка статическая и своя, как в icons.js, поэтому вставляется строкой:
// собранная через createElementNS, она заняла бы втрое больше места и читалась
// бы вдвое хуже. Пользовательский ввод сюда не попадает.
//
// Классы частей описаны в components.css (ch-* и art-*). Имя класса — это и
// есть движение.

// ── Стикеры ─────────────────────────────────────────────────────────────────

// Приветствие: колобок машет лапой, над ним всплывает «Привет!».
const HELLO = `
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="ch-body-g">
    <ellipse cx="48" cy="62" rx="30" ry="28" fill="#ffd36e"/>
    <ellipse cx="48" cy="68" rx="19" ry="17" fill="#fff1c9"/>
    <ellipse class="ch-eye" cx="38" cy="52" rx="4" ry="5" fill="#4a3a1e"/>
    <ellipse class="ch-eye" cx="58" cy="52" rx="4" ry="5" fill="#4a3a1e"/>
    <ellipse cx="30" cy="62" rx="5" ry="3.4" fill="#ffb3a7" opacity="0.85"/>
    <ellipse cx="66" cy="62" rx="5" ry="3.4" fill="#ffb3a7" opacity="0.85"/>
    <path class="ch-mouth" d="M40 64q8 8 16 0" stroke="#4a3a1e" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <g class="ch-arm-g">
      <ellipse class="ch-arm" cx="82" cy="44" rx="8" ry="11" fill="#ffc94d"/>
    </g>
    <ellipse cx="16" cy="66" rx="7" ry="10" fill="#ffc94d"/>
  </g>
  <text class="art-word" x="50" y="20" text-anchor="middle" font-size="15" font-weight="700" fill="#ff8a3d">Привет!</text>
</svg>`;

// Любовь: сердце бьётся, вокруг взлетают маленькие сердечки.
const LOVE = `
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-beat">
    <path d="M50 84C24 66 12 52 12 38 12 26 21 18 32 18c7 0 13 3 18 9 5-6 11-9 18-9 11 0 20 8 20 20 0 14-12 28-38 46z" fill="#ff4d6d"/>
    <path d="M32 26c-6 0-11 5-11 12 0 3 1 6 3 9 1-9 5-15 12-19-1-1-3-2-4-2z" fill="#ff8095" opacity="0.9"/>
  </g>
  <path class="art-rise-1" d="M22 52c-6-5-9-8-9-12 0-3 2-5 5-5 2 0 3 1 4 2 1-1 2-2 4-2 3 0 5 2 5 5 0 4-3 7-9 12z" fill="#ff87a0"/>
  <path class="art-rise-2" d="M84 46c-5-4-8-7-8-10 0-3 2-4 4-4 2 0 3 1 4 2 1-1 2-2 4-2 2 0 4 1 4 4 0 3-3 6-8 10z" fill="#ffa8bb"/>
  <path class="art-twinkle-1" d="M20 24l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#ffd9e2"/>
  <ellipse cx="38" cy="36" rx="7" ry="4" fill="#ffffff" opacity="0.45" transform="rotate(-25 38 36)"/>
</svg>`;

// Спасибо: две ладошки складываются в поклоне, сверху блики.
const THANKS = `
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-bow">
    <path d="M50 84c-14 0-24-9-24-22 0-9 4-18 9-26 2-3 6-3 7 1l6 20 6-20c1-4 5-4 7-1 5 8 9 17 9 26 0 13-10 22-24 22z" fill="#ffd7b0"/>
    <path d="M50 84c-8 0-14-5-17-12 4 3 10 5 17 5s13-2 17-5c-3 7-9 12-17 12z" fill="#f5bd8f"/>
    <path d="M50 57l-5-17c-1-4 4-6 6-2l4 9 4-9c2-4 7-2 6 2z" fill="#ffe3c8"/>
  </g>
  <path class="art-twinkle-1" d="M24 26l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#ffd166"/>
  <path class="art-twinkle-2" d="M76 20l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#ffe9a8"/>
</svg>`;

// Поздравляю: коробка вздрагивает, крышка отлетает, вылетает конфетти.
const CONGRATS = `
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-shake">
    <rect x="24" y="46" width="52" height="40" rx="6" fill="#7c5cf0"/>
    <rect x="44" y="46" width="12" height="40" fill="#ffd166"/>
    <rect x="20" y="38" width="60" height="14" rx="5" fill="#9b7cff"/>
    <rect x="44" y="38" width="12" height="14" fill="#ffd166"/>
  </g>
  <g class="art-lid">
    <rect x="20" y="30" width="60" height="13" rx="5" fill="#b39bff"/>
    <path d="M50 30c-6-8-16-10-18-4-2 5 6 8 18 4zm0 0c6-8 16-10 18-4 2 5-6 8-18 4z" fill="#ffd166"/>
  </g>
  <circle class="art-confetti-1" cx="30" cy="30" r="4" fill="#ff6b9a"/>
  <circle class="art-confetti-2" cx="70" cy="26" r="3.4" fill="#4dd4c0"/>
  <rect class="art-confetti-3" x="48" y="16" width="6" height="6" rx="1.5" fill="#ffd166"/>
</svg>`;

// Смех: лицо подпрыгивает, из глаз брызжут слёзы.
const LAUGH = `
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-jump">
    <circle cx="50" cy="52" r="32" fill="#ffd36e"/>
    <path d="M28 44q8-8 16 0" stroke="#4a3a1e" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M56 44q8-8 16 0" stroke="#4a3a1e" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M30 60q20 22 40 0z" fill="#4a3a1e"/>
    <path d="M38 72q12 8 24 0z" fill="#ff7a8a"/>
  </g>
  <path class="art-tear-1" d="M22 50c3 5 4 8 2 10-2 2-5 0-5-3 0-2 1-4 3-7z" fill="#7ec8ff"/>
  <path class="art-tear-2" d="M78 50c3 5 4 8 2 10-2 2-5 0-5-3 0-2 1-4 3-7z" fill="#7ec8ff"/>
</svg>`;

// Грусть: капля катится, уголки рта опущены.
const SAD = `
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-sway">
    <circle cx="50" cy="52" r="32" fill="#a9c4fb"/>
    <ellipse class="ch-eye" cx="38" cy="46" rx="4" ry="5" fill="#2b3a55"/>
    <ellipse class="ch-eye" cx="62" cy="46" rx="4" ry="5" fill="#2b3a55"/>
    <path d="M36 70q14-12 28 0" stroke="#2b3a55" stroke-width="3" fill="none" stroke-linecap="round"/>
  </g>
  <path class="art-tear-1" d="M36 54c4 7 6 11 3 14-3 3-8 0-8-4 0-3 2-6 5-10z" fill="#4aa8ff"/>
</svg>`;

// Сон: колпак, закрытые глаза и всплывающие «Z».
const SLEEP = `
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-breathe">
    <circle cx="46" cy="56" r="30" fill="#ffd36e"/>
    <path d="M26 46q8 6 16 0" stroke="#4a3a1e" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M52 46q8 6 16 0" stroke="#4a3a1e" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="46" cy="66" rx="6" ry="4" fill="#4a3a1e"/>
    <path d="M18 40c6-16 22-26 40-22 6 1 8 6 3 9L26 48c-5 3-10-1-8-8z" fill="#7c5cf0"/>
    <circle cx="60" cy="20" r="6" fill="#ffd166"/>
  </g>
  <text class="art-z-1" x="76" y="34" font-size="16" font-weight="700" fill="#9b7cff">Z</text>
  <text class="art-z-2" x="86" y="22" font-size="12" font-weight="700" fill="#b39bff">z</text>
</svg>`;

// Круто: большой палец вверх с искрами.
const COOL = `
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-pop">
    <path d="M38 44c0-6 6-8 8-14 2-5 1-12 5-14 6-3 11 3 11 10 0 4-2 8-3 11h13c6 0 10 4 9 9l-5 26c-1 5-5 8-10 8H45c-4 0-7-3-7-7z" fill="#ffd36e"/>
    <rect x="18" y="46" width="18" height="34" rx="5" fill="#ffc94d"/>
    <path d="M46 58h26" stroke="#e8a93a" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M46 68h26" stroke="#e8a93a" stroke-width="2.4" stroke-linecap="round"/>
  </g>
  <path class="art-twinkle-1" d="M74 22l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#ffe9a8"/>
  <path class="art-twinkle-2" d="M24 26l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#ffd166"/>
</svg>`;

// ── Подарки ─────────────────────────────────────────────────────────────────

const ROSE = `
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <!-- Стебель рисуется первым и идёт под бутон: иначе видно, что головка
       приставлена сбоку, а не растёт из него. -->
  <path d="M48 44c0 18 1 30 2 42" stroke="#2f9e5e" stroke-width="5" stroke-linecap="round" fill="none"/>
  <path class="art-leaf" d="M49 64c-14-1-22-8-23-18 12-1 21 6 23 18z" fill="#37b36a"/>
  <path class="art-leaf-2" d="M51 76c13-1 20-7 21-16-11-1-19 5-21 16z" fill="#2a8b53"/>
  <g class="art-sway">
    <!-- Бутон: три слоя лепестков со смещением, чтобы читалась спираль,
         а не круг. -->
    <path d="M50 46c-14 0-23-9-23-20 0-12 10-20 23-20s23 8 23 20c0 11-9 20-23 20z" fill="#c9203a"/>
    <path d="M50 42c-11 0-18-7-18-15 0-6 4-11 10-13-3 4-4 8-3 13 2 8 8 12 17 12-2 2-4 3-6 3z" fill="#e63950"/>
    <path d="M52 38c-8 1-14-3-15-10-1-6 2-11 8-13-2 4-2 8 0 12 3 6 8 9 15 8-2 2-5 3-8 3z" fill="#ff5c74"/>
    <path d="M52 30c-4 1-7-1-8-5-1-3 1-6 4-7-1 2-1 4 0 6 2 3 5 4 8 3-1 2-2 3-4 3z" fill="#ff94a6"/>
  </g>
</svg>`;

const TEDDY = `
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="ch-body-g">
    <circle cx="28" cy="30" r="11" fill="#b07a4f"/>
    <circle cx="72" cy="30" r="11" fill="#b07a4f"/>
    <circle cx="28" cy="30" r="5" fill="#e0b28a"/>
    <circle cx="72" cy="30" r="5" fill="#e0b28a"/>
    <ellipse cx="50" cy="70" rx="26" ry="22" fill="#c08a5c"/>
    <ellipse cx="50" cy="74" rx="15" ry="14" fill="#e8c49c"/>
    <g class="ch-arm-g"><ellipse class="ch-arm" cx="80" cy="62" rx="9" ry="12" fill="#b07a4f"/></g>
    <ellipse cx="20" cy="62" rx="9" ry="12" fill="#b07a4f"/>
    <g class="ch-head-g">
      <circle cx="50" cy="38" r="24" fill="#c08a5c"/>
      <ellipse cx="50" cy="46" rx="13" ry="10" fill="#e8c49c"/>
      <ellipse class="ch-eye" cx="41" cy="34" rx="3.4" ry="4.2" fill="#4a3020"/>
      <ellipse class="ch-eye" cx="59" cy="34" rx="3.4" ry="4.2" fill="#4a3020"/>
      <ellipse cx="50" cy="43" rx="4.6" ry="3.4" fill="#4a3020"/>
      <path class="ch-mouth" d="M44 50q6 5 12 0" stroke="#4a3020" stroke-width="2" fill="none" stroke-linecap="round"/>
    </g>
  </g>
</svg>`;

const RING = `
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <!-- Кольцо покачивается, а не крутится вокруг вертикальной оси: без
       перспективы такое вращение раз в пол-оборота вырождает эллипс в линию,
       и кольцо на секунду пропадает — это было видно на первом же скриншоте. -->
  <g class="art-tilt">
    <ellipse cx="50" cy="66" rx="22" ry="24" fill="none" stroke="#f0c14b" stroke-width="9"/>
    <ellipse cx="50" cy="66" rx="22" ry="24" fill="none" stroke="#ffe08a" stroke-width="3"/>
    <path d="M50 12l15 15-15 17-15-17z" fill="#7ecbff"/>
    <path d="M50 12l15 15-15 5-15-5z" fill="#cdeeff"/>
    <path d="M35 27l15-5 15 5-15 17z" fill="#a5dcff" opacity="0.75"/>
  </g>
  <path class="art-twinkle-1" d="M76 20l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#ffffff"/>
  <path class="art-twinkle-2" d="M24 30l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff0b8"/>
</svg>`;

const CAKE = `
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-breathe">
    <rect x="20" y="56" width="60" height="28" rx="6" fill="#ffd9e8"/>
    <rect x="20" y="48" width="60" height="14" rx="6" fill="#fff2f7"/>
    <path d="M20 56q10 8 20 0t20 0 20 0v6H20z" fill="#ff8fb1"/>
    <rect x="47" y="30" width="6" height="18" rx="2" fill="#7c5cf0"/>
  </g>
  <path class="art-flame" d="M50 20c4 4 6 7 6 10a6 6 0 0 1-12 0c0-3 2-6 6-10z" fill="#ffb03a"/>
  <path class="art-flame-2" d="M50 24c2 2 3 4 3 6a3 3 0 0 1-6 0c0-2 1-4 3-6z" fill="#ffe58f"/>
</svg>`;

const CROWN = `
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-float">
    <path d="M18 66L12 30l20 14 18-24 18 24 20-14-6 36z" fill="#f4c542"/>
    <rect x="18" y="66" width="64" height="12" rx="4" fill="#e0ac2b"/>
    <circle cx="50" cy="52" r="5" fill="#ff5c74"/>
    <circle cx="30" cy="56" r="4" fill="#4dd4c0"/>
    <circle cx="70" cy="56" r="4" fill="#7c9dff"/>
  </g>
  <path class="art-twinkle-1" d="M80 26l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#fff3c4"/>
</svg>`;

const GIFTBOX = `
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-shake">
    <rect x="22" y="48" width="56" height="40" rx="6" fill="#4dc3ff"/>
    <rect x="44" y="48" width="12" height="40" fill="#fff0a8"/>
    <rect x="18" y="40" width="64" height="14" rx="5" fill="#6ed0ff"/>
    <rect x="44" y="40" width="12" height="14" fill="#fff0a8"/>
  </g>
  <g class="art-lid">
    <path d="M50 34c-7-9-18-11-20-5-2 6 7 9 20 5zm0 0c7-9 18-11 20-5 2 6-7 9-20 5z" fill="#ffd166"/>
  </g>
  <path class="art-twinkle-1" d="M24 26l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#fff3c4"/>
</svg>`;


export const ART = {
  // Подарки, нарисованные отдельно (lib/giftArt.js) — их больше и они сложнее,
  // поэтому живут своим файлом, а сюда подмешиваются, чтобы у всех, кто рисует
  // (магазин, лента, полка в профиле), точка входа осталась одна.
  ...GIFT_ART,
  // стикеры
  hello: { markup: HELLO, name: "Привет" },
  love: { markup: LOVE, name: "Любовь" },
  thanks: { markup: THANKS, name: "Спасибо" },
  congrats: { markup: CONGRATS, name: "Поздравляю" },
  laugh: { markup: LAUGH, name: "Смех" },
  sad: { markup: SAD, name: "Грусть" },
  sleep: { markup: SLEEP, name: "Сон" },
  cool: { markup: COOL, name: "Класс" },
  // подарки
  rose: { markup: ROSE, name: "Роза" },
  teddy: { markup: TEDDY, name: "Мишка" },
  ring: { markup: RING, name: "Кольцо" },
  cake: { markup: CAKE, name: "Торт" },
  crown: { markup: CROWN, name: "Корона" },
  giftbox: { markup: GIFTBOX, name: "Подарок" },
};

// Что рисуем вместо системного эмодзи. Список намеренно короткий: рисунок
// уместен там, где он и есть смысл сообщения или самой вещи.
export const ART_FOR_EMOJI = {
  ...GIFT_ART_FOR_EMOJI,
  "👋": "hello",
  "❤️": "love",
  "💖": "love",
  "🙏": "thanks",
  "🎉": "congrats",
  "🥳": "congrats",
  "😂": "laugh",
  "🤣": "laugh",
  "😢": "sad",
  "😭": "sad",
  "😴": "sleep",
  "👍": "cool",
  "🌹": "rose",
  "🧸": "teddy",
  "💍": "ring",
  "🎂": "cake",
  "👑": "crown",
  "🎁": "giftbox",
};

export function artFor(emoji, preferred) {
  if (preferred && ART[preferred]) return preferred;
  return ART_FOR_EMOJI[emoji] ?? null;
}

export function renderArt(id, { size = 84 } = {}) {
  const item = ART[id];
  if (!item) return null;
  const wrap = document.createElement("div");
  wrap.className = `char-scene art-${id}`;
  wrap.style.width = `${size}px`;
  wrap.style.height = `${size}px`;
  wrap.innerHTML = item.markup;
  return wrap;
}
