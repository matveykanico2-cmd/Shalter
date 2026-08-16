// Нарисованные персонажи — векторные, с частями, которые двигаются отдельно.
//
// Сцены из эмодзи (lib/animScenes.js) дали движение, но не дали характера:
// эмодзи нарисован системой, и внутри него ничего не пошевелить — можно только
// двигать его целиком. Здесь наоборот: у каждого персонажа глаза, руки, хвост и
// рот — отдельные фигуры, поэтому лис моргает, машет лапой и виляет хвостом
// независимо друг от друга, как и должно быть у живого.
//
// Почему SVG-строкой, а не сборкой из createElementNS: разметка здесь своя и
// статическая, ровно как у icons.js, — а собранная вручную она заняла бы втрое
// больше места и читалась бы вдвое хуже. Пользовательский ввод сюда не попадает.
//
// Классы частей (ch-*) описаны в components.css. Имя класса — это и есть
// движение: eye моргает, arm машет, tail виляет.

const FOX = `
<svg viewBox="0 0 100 100" class="ch ch-fox" aria-hidden="true">
  <g class="ch-tail-g">
    <path class="ch-tail" d="M40 74c-14 4-26-2-30-14-3-10 2-20 10-24-3 12 2 22 12 26 4 2 8 6 8 12z" fill="#e2703a"/>
    <path d="M14 40c-4 6-4 14 1 19 3 3 7 5 11 5-6-6-9-15-8-24z" fill="#fff3e6"/>
  </g>
  <g class="ch-body-g">
    <ellipse cx="52" cy="70" rx="24" ry="20" fill="#f08a4b"/>
    <ellipse cx="52" cy="76" rx="14" ry="12" fill="#fff3e6"/>
    <g class="ch-arm-g">
      <rect class="ch-arm" x="70" y="56" width="9" height="22" rx="4.5" fill="#e2703a"/>
    </g>
    <g class="ch-head-g">
      <path d="M32 34l6-16 12 9z" fill="#e2703a"/>
      <path d="M72 34l-6-16-12 9z" fill="#e2703a"/>
      <path d="M36 33l3-8 6 5z" fill="#3a2a22"/>
      <path d="M68 33l-3-8-6 5z" fill="#3a2a22"/>
      <ellipse cx="52" cy="40" rx="24" ry="21" fill="#f08a4b"/>
      <path d="M52 48c-9 0-16 4-16 9 0 6 7 10 16 10s16-4 16-10c0-5-7-9-16-9z" fill="#fff3e6"/>
      <ellipse class="ch-eye" cx="43" cy="38" rx="3.6" ry="4.4" fill="#3a2a22"/>
      <ellipse class="ch-eye" cx="61" cy="38" rx="3.6" ry="4.4" fill="#3a2a22"/>
      <ellipse cx="52" cy="52" rx="4" ry="3" fill="#3a2a22"/>
      <path class="ch-mouth" d="M46 58q6 6 12 0" stroke="#3a2a22" stroke-width="2" fill="none" stroke-linecap="round"/>
    </g>
  </g>
</svg>`;

const CAT = `
<svg viewBox="0 0 100 100" class="ch ch-cat" aria-hidden="true">
  <g class="ch-tail-g">
    <path class="ch-tail" d="M62 78c12 4 22 0 26-10 3-8 0-17-6-21 3 9 1 17-6 21-5 3-11 5-14 10z" fill="#8b93a7"/>
  </g>
  <g class="ch-body-g">
    <ellipse cx="50" cy="72" rx="22" ry="18" fill="#9aa2b6"/>
    <ellipse cx="50" cy="78" rx="12" ry="10" fill="#e8ebf2"/>
    <g class="ch-arm-g">
      <rect class="ch-arm" x="24" y="58" width="9" height="20" rx="4.5" fill="#8b93a7"/>
    </g>
    <g class="ch-head-g">
      <path d="M30 30l2-14 13 9z" fill="#9aa2b6"/>
      <path d="M70 30l-2-14-13 9z" fill="#9aa2b6"/>
      <path d="M34 29l1-7 6 4z" fill="#f2a9bd"/>
      <path d="M66 29l-1-7-6 4z" fill="#f2a9bd"/>
      <ellipse cx="50" cy="40" rx="23" ry="20" fill="#9aa2b6"/>
      <ellipse class="ch-eye" cx="41" cy="38" rx="4" ry="5" fill="#2f3545"/>
      <ellipse class="ch-eye" cx="59" cy="38" rx="4" ry="5" fill="#2f3545"/>
      <path d="M50 48l-4 3h8z" fill="#f2a9bd"/>
      <path class="ch-mouth" d="M44 54q6 5 12 0" stroke="#2f3545" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M22 44h12M22 48h12M66 44h12M66 48h12" stroke="#e8ebf2" stroke-width="1.6" stroke-linecap="round"/>
    </g>
  </g>
</svg>`;

const GHOST = `
<svg viewBox="0 0 100 100" class="ch ch-ghost" aria-hidden="true">
  <g class="ch-float-g">
    <path d="M50 12c-16 0-27 12-27 28v34c0 4 4 6 7 3l5-5 6 6c2 2 5 2 7 0l5-5 5 5c2 2 5 2 7 0l6-6 5 5c3 3 7 1 7-3V40c0-16-11-28-27-28z" fill="#f2f4fb"/>
    <ellipse class="ch-eye" cx="41" cy="38" rx="4.2" ry="5.2" fill="#2b3040"/>
    <ellipse class="ch-eye" cx="59" cy="38" rx="4.2" ry="5.2" fill="#2b3040"/>
    <ellipse class="ch-mouth-o" cx="50" cy="52" rx="6" ry="7" fill="#2b3040"/>
    <g class="ch-arm-g">
      <ellipse class="ch-arm" cx="80" cy="44" rx="7" ry="9" fill="#f2f4fb"/>
    </g>
    <ellipse cx="20" cy="46" rx="7" ry="9" fill="#f2f4fb"/>
    <ellipse cx="36" cy="48" rx="4" ry="2.6" fill="#ffd0dd" opacity="0.75"/>
    <ellipse cx="64" cy="48" rx="4" ry="2.6" fill="#ffd0dd" opacity="0.75"/>
  </g>
</svg>`;

const ROBOT = `
<svg viewBox="0 0 100 100" class="ch ch-robot" aria-hidden="true">
  <g class="ch-body-g">
    <line x1="50" y1="18" x2="50" y2="9" stroke="#8b93a7" stroke-width="2.5"/>
    <circle class="ch-blink-dot" cx="50" cy="7" r="4" fill="#4ade80"/>
    <rect x="26" y="18" width="48" height="38" rx="12" fill="#5b8def"/>
    <rect x="34" y="30" width="32" height="14" rx="7" fill="#12182a"/>
    <circle class="ch-eye-dot" cx="43" cy="37" r="3.4" fill="#7ee0ff"/>
    <circle class="ch-eye-dot" cx="57" cy="37" r="3.4" fill="#7ee0ff"/>
    <rect x="32" y="58" width="36" height="26" rx="8" fill="#4a7ade"/>
    <rect x="42" y="66" width="16" height="10" rx="3" fill="#12182a"/>
    <g class="ch-arm-g">
      <rect class="ch-arm" x="72" y="58" width="8" height="20" rx="4" fill="#5b8def"/>
    </g>
    <rect x="20" y="58" width="8" height="20" rx="4" fill="#5b8def"/>
  </g>
</svg>`;

const PENGUIN = `
<svg viewBox="0 0 100 100" class="ch ch-penguin" aria-hidden="true">
  <g class="ch-body-g">
    <ellipse cx="50" cy="58" rx="26" ry="32" fill="#2f3545"/>
    <ellipse cx="50" cy="64" rx="17" ry="24" fill="#f7f9ff"/>
    <g class="ch-arm-g">
      <ellipse class="ch-arm" cx="78" cy="56" rx="7" ry="15" fill="#2f3545"/>
    </g>
    <ellipse cx="22" cy="56" rx="7" ry="15" fill="#2f3545"/>
    <ellipse class="ch-eye" cx="42" cy="42" rx="3.6" ry="4.4" fill="#12182a"/>
    <ellipse class="ch-eye" cx="58" cy="42" rx="3.6" ry="4.4" fill="#12182a"/>
    <path d="M50 48l-6 5h12z" fill="#f5a623"/>
    <path d="M38 88l-6 5h14z" fill="#f5a623"/>
    <path d="M62 88l6 5h-14z" fill="#f5a623"/>
  </g>
</svg>`;

export const CHARACTERS = {
  fox: { markup: FOX, name: "Лис" },
  cat: { markup: CAT, name: "Кот" },
  ghost: { markup: GHOST, name: "Призрак" },
  robot: { markup: ROBOT, name: "Робот" },
  penguin: { markup: PENGUIN, name: "Пингвин" },
};

// Эмодзи, за которыми стоит показать персонажа вместо системной картинки.
// Список маленький намеренно: персонаж уместен там, где он и есть смысл
// сообщения, а не как замена всякому эмодзи подряд.
export const CHARACTER_FOR_EMOJI = {
  "🦊": "fox",
  "🐱": "cat",
  "🐈": "cat",
  "😺": "cat",
  "👻": "ghost",
  "🤖": "robot",
  "🐧": "penguin",
};

export function characterFor(emoji, preferred) {
  if (preferred && CHARACTERS[preferred]) return preferred;
  return CHARACTER_FOR_EMOJI[emoji] ?? null;
}

// Возвращает готовый элемент с персонажем. Размер задаётся в пикселях, всё
// внутри масштабируется само — рисунок векторный, поэтому одинаково чёткий и в
// списке стикеров, и на карточке подарка.
export function renderCharacter(id, { size = 84 } = {}) {
  const char = CHARACTERS[id];
  if (!char) return null;
  const wrap = document.createElement("div");
  wrap.className = `char-scene char-${id}`;
  wrap.style.width = `${size}px`;
  wrap.style.height = `${size}px`;
  wrap.innerHTML = char.markup;
  return wrap;
}
