// Подарки, нарисованные с нуля, — и сыгранные, а не покрученные.
//
// Системный эмодзи внутри неподвижен: его можно только двигать целиком, и
// «анимация» из него выходит одна на всех — либо вращение, либо подпрыгивание.
// Здесь у каждого подарка свои фигуры, у фигур свои имена, и каждая живёт
// отдельно: у чашки поднимается пар и наклоняется корпус, у звезды моргают
// глаза и разлетаются лучи, у алмаза по граням проходит блик.
//
// ── Как устроено движение ───────────────────────────────────────────────────
//
// Одно движение — это не «крутится по кругу», а маленькая сцена с фазами:
// подготовка (присел), бросок (взлетел и вытянулся), приземление (сплющился),
// отдача и покой. Плюс отдельные части со своим ритмом: моргание раз в цикл,
// искры в момент приземления, пар — непрерывно и медленнее всего остального.
// Именно расхождение ритмов и читается как «живое», а совпадение — как
// «дёргается».
//
// Разметка статическая и вставляется строкой — так же, как в icons.js и
// lib/drawnArt.js: собранная через createElementNS, она заняла бы втрое больше
// места. Пользовательский ввод сюда не попадает.
//
// Классы частей описаны в components.css (g-*). Имя класса и есть движение.

// Глаза — общая деталь: с ними предмет становится существом, а моргание
// перестаёт быть странностью. Вынесены в функцию, чтобы у всех подарков они
// моргали одинаково и в одном ритме.
const eyes = (cx1, cx2, cy, r = 3.4) => `
  <g class="g-eyes">
    <ellipse class="g-eye" cx="${cx1}" cy="${cy}" rx="${r}" ry="${r * 1.25}" fill="#2f2a24"/>
    <ellipse class="g-eye" cx="${cx2}" cy="${cy}" rx="${r}" ry="${r * 1.25}" fill="#2f2a24"/>
    <circle cx="${cx1 + 1.2}" cy="${cy - 1.4}" r="${r * 0.34}" fill="#fff"/>
    <circle cx="${cx2 + 1.2}" cy="${cy - 1.4}" r="${r * 0.34}" fill="#fff"/>
  </g>`;

const blush = (cx1, cx2, cy) => `
  <ellipse cx="${cx1}" cy="${cy}" rx="4.6" ry="3" fill="#ff9d9d" opacity="0.55"/>
  <ellipse cx="${cx2}" cy="${cy}" rx="4.6" ry="3" fill="#ff9d9d" opacity="0.55"/>`;

// ☕ Кофе: чашка приседает и подпрыгивает, пар вьётся тремя струйками с разной
// задержкой, в момент приземления кофе внутри плещется.
const COFFEE = `
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <g class="g-steam">
    <path class="g-steam-1" d="M42 34c-4-5 3-8-1-13" stroke="#cfd6e4" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path class="g-steam-2" d="M52 32c-4-6 3-9-1-14" stroke="#cfd6e4" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path class="g-steam-3" d="M62 35c-3-5 2-8-1-12" stroke="#cfd6e4" stroke-width="2.8" fill="none" stroke-linecap="round"/>
  </g>
  <g class="g-hop">
    <path d="M74 52c7 0 12 4 12 10s-5 11-13 11l-3-6c5 0 9-2 9-5s-3-4-7-4z" fill="#e8e2da"/>
    <path d="M24 44h50v20c0 12-9 20-25 20s-25-8-25-20z" fill="#f6f2ec"/>
    <path class="g-liquid" d="M28 47h42v6c0 3-9 5-21 5s-21-2-21-5z" fill="#6f4326"/>
    <path d="M28 47h42v3c0 2-9 4-21 4s-21-2-21-4z" fill="#8a5733" opacity="0.85"/>
    ${eyes(41, 59, 64)}
    ${blush(33, 67, 71)}
    <path class="g-smile" d="M43 72q7 6 14 0" stroke="#2f2a24" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <rect x="20" y="86" width="60" height="6" rx="3" fill="#d8d1c6"/>
  </g>
</svg>`;

// ⭐ Звезда: белая, с лучами. Прыгает выше всех, в верхней точке крутится, при
// приземлении из-под неё разлетаются искры.
const STAR = `
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <g class="g-sparks">
    <circle class="g-spark g-spark-1" cx="22" cy="70" r="3" fill="#ffe9a8"/>
    <circle class="g-spark g-spark-2" cx="78" cy="72" r="2.6" fill="#fff3c9"/>
    <circle class="g-spark g-spark-3" cx="50" cy="86" r="2.2" fill="#ffdf8a"/>
  </g>
  <g class="g-hop g-hop-high">
    <g class="g-spin-soft">
      <path d="M50 10l11 24 26 3-19 18 5 26-23-13-23 13 5-26-19-18 26-3z" fill="#ffffff" stroke="#ffd66b" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M50 18l8 18 20 2-14 13 3 19-17-9-17 9 3-19-14-13 20-2z" fill="#fffdf5"/>
      ${eyes(43, 57, 46, 3.1)}
      ${blush(36, 64, 53)}
      <path class="g-smile" d="M45 54q5 5 10 0" stroke="#2f2a24" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    </g>
  </g>
</svg>`;

// 💎 Алмаз: грани переливаются — по камню слева направо проходит светлая
// полоса, а сам он вздрагивает и коротко подпрыгивает.
const DIAMOND = `
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <defs>
    <clipPath id="g-diamond-clip"><path d="M50 88L12 44l14-20h48l14 20z"/></clipPath>
  </defs>
  <g class="g-hop">
    <path d="M50 88L12 44l14-20h48l14 20z" fill="#63c7f5"/>
    <path d="M26 24h48l14 20H12z" fill="#a5e2fb"/>
    <path d="M50 88L12 44h76z" fill="#3fa9e0" opacity="0.9"/>
    <path d="M38 44l12 44 12-44-12-20z" fill="#8ad8fa"/>
    <path d="M26 24l12 20 12-20z" fill="#d3f1ff" opacity="0.9"/>
    <path d="M62 24l12 20-24 0z" fill="#c2ecff" opacity="0.75"/>
    <g clip-path="url(#g-diamond-clip)">
      <rect class="g-shine" x="-40" y="10" width="26" height="90" fill="#ffffff" opacity="0.55" transform="skewX(-18)"/>
    </g>
    ${eyes(42, 58, 52, 3)}
    <path class="g-smile" d="M44 60q6 5 12 0" stroke="#1d5b7a" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </g>
  <path class="g-twinkle g-twinkle-1" d="M18 26l2.4 6 6 2.4-6 2.4-2.4 6-2.4-6-6-2.4 6-2.4z" fill="#ffffff"/>
  <path class="g-twinkle g-twinkle-2" d="M84 60l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#eaf9ff"/>
</svg>`;

// 🏆 Кубок: подпрыгивает, в верхней точке по золоту пробегает блик, вниз
// сыплется конфетти.
const TROPHY = `
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <defs>
    <clipPath id="g-cup-clip"><path d="M30 20h40v22c0 12-9 20-20 20s-20-8-20-20z"/></clipPath>
  </defs>
  <g class="g-confetti">
    <rect class="g-conf g-conf-1" x="20" y="18" width="5" height="8" rx="1.5" fill="#ff6b81"/>
    <rect class="g-conf g-conf-2" x="74" y="14" width="5" height="8" rx="1.5" fill="#5bc8ff"/>
    <rect class="g-conf g-conf-3" x="52" y="10" width="5" height="8" rx="1.5" fill="#9b7cff"/>
  </g>
  <g class="g-hop">
    <path d="M30 20h40v22c0 12-9 20-20 20s-20-8-20-20z" fill="#f5c542"/>
    <path d="M36 24h28v18c0 9-6 15-14 15s-14-6-14-15z" fill="#ffd96b"/>
    <path d="M30 24h-9c0 12 4 18 12 20l-2-6c-4-2-5-6-5-14z" fill="#e5b132"/>
    <path d="M70 24h9c0 12-4 18-12 20l2-6c4-2 5-6 5-14z" fill="#e5b132"/>
    <g clip-path="url(#g-cup-clip)">
      <rect class="g-shine" x="-40" y="0" width="20" height="70" fill="#fff8dd" opacity="0.75" transform="skewX(-16)"/>
    </g>
    ${eyes(43, 57, 36, 3)}
    <path class="g-smile" d="M44 44q6 5 12 0" stroke="#7a5a12" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <rect x="44" y="62" width="12" height="12" fill="#e5b132"/>
    <rect x="32" y="74" width="36" height="8" rx="3" fill="#d9a52c"/>
    <rect x="26" y="82" width="48" height="9" rx="4" fill="#c9962a"/>
  </g>
</svg>`;

// ♾️ Бесконечность: по контуру бежит светящаяся точка, сам знак дышит.
const INFINITY_ART = `
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <g class="g-breathe">
    <path id="g-inf-path" d="M50 50c-8-13-16-19-25-19-11 0-19 8-19 19s8 19 19 19c9 0 17-6 25-19 8-13 16-19 25-19 11 0 19 8 19 19s-8 19-19 19c-9 0-17-6-25-19z"
      fill="none" stroke="#8f7bff" stroke-width="11" stroke-linecap="round"/>
    <path d="M50 50c-8-13-16-19-25-19-11 0-19 8-19 19s8 19 19 19c9 0 17-6 25-19 8-13 16-19 25-19 11 0 19 8 19 19s-8 19-19 19c-9 0-17-6-25-19z"
      fill="none" stroke="#c3b6ff" stroke-width="4" stroke-linecap="round" opacity="0.8"/>
  </g>
  <circle class="g-runner" r="5.5" fill="#fff6b0">
    <animateMotion dur="3.4s" repeatCount="indefinite" rotate="auto">
      <mpath href="#g-inf-path"/>
    </animateMotion>
  </circle>
</svg>`;

// 🌸 Сакура: цветок качается на ветру, лепестки по одному отрываются и падают,
// покачиваясь.
const SAKURA = `
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <g class="g-sway">
    <g>
      <ellipse cx="50" cy="26" rx="13" ry="16" fill="#ffc2d8"/>
      <ellipse cx="72" cy="42" rx="13" ry="16" fill="#ffb5cf" transform="rotate(72 72 42)"/>
      <ellipse cx="64" cy="68" rx="13" ry="16" fill="#ffc2d8" transform="rotate(144 64 68)"/>
      <ellipse cx="36" cy="68" rx="13" ry="16" fill="#ffb5cf" transform="rotate(216 36 68)"/>
      <ellipse cx="28" cy="42" rx="13" ry="16" fill="#ffc2d8" transform="rotate(288 28 42)"/>
      <circle cx="50" cy="50" r="9" fill="#fff0b3"/>
      <circle cx="50" cy="50" r="4.5" fill="#ffd75e"/>
      ${eyes(44, 56, 49, 2.6)}
      <path class="g-smile" d="M46 55q4 4 8 0" stroke="#8a5a6a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    </g>
  </g>
  <ellipse class="g-petal g-petal-1" cx="24" cy="30" rx="6" ry="8" fill="#ffd3e2"/>
  <ellipse class="g-petal g-petal-2" cx="78" cy="24" rx="5" ry="7" fill="#ffc2d8"/>
  <ellipse class="g-petal g-petal-3" cx="60" cy="20" rx="4.5" ry="6" fill="#ffe0ea"/>
</svg>`;

// 🍀 Клевер: подпрыгивает от радости, листики дрожат вразнобой, сверху падает
// искра удачи.
const CLOVER = `
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <path class="g-luck" d="M50 6l2.6 7 7 2.6-7 2.6-2.6 7-2.6-7-7-2.6 7-2.6z" fill="#ffe9a8"/>
  <g class="g-hop">
    <path d="M50 56c1 12 4 22 10 30-8-3-14-11-16-22z" fill="#3f9e5a"/>
    <g transform="translate(50 50)">
      <!-- Поворот и дрожание разнесены по разным узлам намеренно: CSS-анимация
           перебивает атрибут transform у того же элемента, и все четыре листа
           складывались друг на друга — вместо клевера выходило одно сердце. -->
      <g transform="rotate(-45)"><g class="g-leaf g-leaf-1"><path d="M0 0C-9-5-21-10-21-19-21-26-14-30-8-27-4-25-1-21 0-18 1-21 4-25 8-27 14-30 21-26 21-19 21-10 9-5 0 0Z" fill="#57c46f"/></g></g>
      <g transform="rotate(45)"><g class="g-leaf g-leaf-2"><path d="M0 0C-9-5-21-10-21-19-21-26-14-30-8-27-4-25-1-21 0-18 1-21 4-25 8-27 14-30 21-26 21-19 21-10 9-5 0 0Z" fill="#4bb865"/></g></g>
      <g transform="rotate(135)"><g class="g-leaf g-leaf-3"><path d="M0 0C-9-5-21-10-21-19-21-26-14-30-8-27-4-25-1-21 0-18 1-21 4-25 8-27 14-30 21-26 21-19 21-10 9-5 0 0Z" fill="#54c06b"/></g></g>
      <g transform="rotate(225)"><g class="g-leaf g-leaf-4"><path d="M0 0C-9-5-21-10-21-19-21-26-14-30-8-27-4-25-1-21 0-18 1-21 4-25 8-27 14-30 21-26 21-19 21-10 9-5 0 0Z" fill="#49b160"/></g></g>
      <circle r="4.5" fill="#2f8f4b"/>
    </g>
    <g class="g-eyes">
      <ellipse class="g-eye" cx="44" cy="46" rx="2.7" ry="3.4" fill="#2f2a24"/>
      <ellipse class="g-eye" cx="56" cy="46" rx="2.7" ry="3.4" fill="#2f2a24"/>
      <circle cx="45" cy="45" r="0.9" fill="#fff"/>
      <circle cx="57" cy="45" r="0.9" fill="#fff"/>
    </g>
    <path class="g-smile" d="M45 54q5 4 10 0" stroke="#1f6b38" stroke-width="2" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;

// 🌷 Тюльпан: стебель гнётся, бутон кивает — как от ветра, а не как маятник:
// туда быстро, обратно медленно.
const TULIP = `
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <g class="g-stem-sway">
    <path d="M50 54c-2 14-2 26 0 38" stroke="#3f9e5a" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path class="g-leaf g-leaf-1" d="M50 70c-11 1-19-5-21-15 11-3 19 4 21 15z" fill="#57c46f"/>
    <path class="g-leaf g-leaf-2" d="M50 80c11 1 19-5 21-15-11-3-19 4-21 15z" fill="#4bb865"/>
    <g class="g-nod">
      <path d="M50 14c-4 0-8 4-10 10-2-6-6-10-10-10-5 0-8 5-8 12v12c0 13 12 20 28 20s28-7 28-20V26c0-7-3-12-8-12-4 0-8 4-10 10-2-6-6-10-10-10z" fill="#f2557a"/>
      <path d="M40 24c-2-6-6-10-10-10-5 0-8 5-8 12v12c0 8 5 14 13 17-3-9-4-20 5-31z" fill="#ff7d9a"/>
      <path d="M60 24c2-6 6-10 10-10 5 0 8 5 8 12v12c0 8-5 14-13 17 3-9 4-20-5-31z" fill="#e04a6c"/>
      <g class="g-eyes">
        <ellipse class="g-eye" cx="44" cy="40" rx="2.7" ry="3.4" fill="#2f2a24"/>
        <ellipse class="g-eye" cx="56" cy="40" rx="2.7" ry="3.4" fill="#2f2a24"/>
        <circle cx="45" cy="39" r="0.9" fill="#fff"/>
        <circle cx="57" cy="39" r="0.9" fill="#fff"/>
      </g>
      <path class="g-smile" d="M45 47q5 4 10 0" stroke="#7a2740" stroke-width="2" fill="none" stroke-linecap="round"/>
    </g>
  </g>
</svg>`;

// 🌻 Подсолнух: поворачивается за солнцем — медленно туда и быстро обратно,
// лепестки чуть отстают.
const SUNFLOWER = `
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <path d="M50 58c-1 12-1 22 0 32" stroke="#3f9e5a" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path class="g-leaf g-leaf-1" d="M50 74c-11 1-19-4-22-14 11-3 19 3 22 14z" fill="#57c46f"/>
  <g class="g-turn">
    <g class="g-petals-shiver">
      <g fill="#ffc93c">
        <ellipse cx="50" cy="16" rx="7" ry="13"/>
        <ellipse cx="74" cy="26" rx="7" ry="13" transform="rotate(45 74 26)"/>
        <ellipse cx="84" cy="48" rx="7" ry="13" transform="rotate(90 84 48)"/>
        <ellipse cx="74" cy="70" rx="7" ry="13" transform="rotate(135 74 70)"/>
        <ellipse cx="50" cy="80" rx="7" ry="13"/>
        <ellipse cx="26" cy="70" rx="7" ry="13" transform="rotate(45 26 70)"/>
        <ellipse cx="16" cy="48" rx="7" ry="13" transform="rotate(90 16 48)"/>
        <ellipse cx="26" cy="26" rx="7" ry="13" transform="rotate(135 26 26)"/>
      </g>
    </g>
    <circle cx="50" cy="48" r="19" fill="#7a4a1e"/>
    <circle cx="50" cy="48" r="14" fill="#8f5a26"/>
    ${eyes(44, 56, 45, 3)}
    ${blush(37, 63, 52)}
    <path class="g-smile" d="M44 54q6 5 12 0" stroke="#2f1c08" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;

export const GIFT_ART = {
  coffee: { markup: COFFEE, name: "Кофе" },
  star: { markup: STAR, name: "Звезда" },
  diamond: { markup: DIAMOND, name: "Алмаз" },
  trophy: { markup: TROPHY, name: "Кубок" },
  infinity: { markup: INFINITY_ART, name: "Бесконечность" },
  sakura: { markup: SAKURA, name: "Сакура" },
  clover: { markup: CLOVER, name: "Клевер" },
  tulip: { markup: TULIP, name: "Тюльпан" },
  sunflower: { markup: SUNFLOWER, name: "Подсолнух" },
};

// Какому эмодзи из каталога подарков (server/data/gifts.js) соответствует
// рисунок. Всё, чего здесь нет, по-прежнему рисуется прежним способом — так
// каталог из трёхсот позиций не приходится рисовать целиком, прежде чем хоть
// что-то станет живым.
export const GIFT_ART_FOR_EMOJI = {
  "☕": "coffee",
  "⭐": "star",
  "🌟": "star",
  "💫": "star",
  "💎": "diamond",
  "🏆": "trophy",
  "♾️": "infinity",
  "🌸": "sakura",
  "🍀": "clover",
  "☘️": "clover",
  "🌷": "tulip",
  "🌻": "sunflower",
};
