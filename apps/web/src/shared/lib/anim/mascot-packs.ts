// Встроенные стикерпаки с персонажами (котик, лисёнок, утёнок, зайка) и готовые аватары из них.
// Рисунок собирается из частей: уши/хохолок, голова, лицо под эмоцию, лапки и анимированные детали.
// Анимации — классы anim.css (art-*, ch-*), как у остальных рисунков drawn-art.ts.
import type { ArtItem } from "./gift-art";
import type { Sticker } from "./stickers";

type Mascot = {
  id: string;
  name: string;
  packName: string;
  body: string;
  shade: string;
  muzzle: string | null;
  inner: string;
  line: string;
  cheek: string;
  /** Утёнок: клюв вместо рта. */
  beak?: string;
  /** Уши/хохолок/хвост — за головой. */
  back: (m: Mascot) => string;
};

const MASCOTS: readonly Mascot[] = [
  {
    id: "cat",
    name: "Котик",
    packName: "Котик Мурка",
    body: "#ffb562",
    shade: "#f39a3e",
    muzzle: "#fff1de",
    inner: "#ffb3c1",
    line: "#4a2c1a",
    cheek: "#ff8fa3",
    back: (m) => `
      <path class="ch-tail-g" d="M66 88c14 2 24-6 24-16 0-6-4-10-8-10 2 8-2 14-10 16z" fill="${m.shade}"/>
      <path d="M24 44L26 14l22 14z" fill="${m.body}"/><path d="M76 44L74 14 52 28z" fill="${m.body}"/>
      <path d="M29 36l1-14 11 8z" fill="${m.inner}"/><path d="M71 36l-1-14-11 8z" fill="${m.inner}"/>
      <path d="M44 27l3 6M50 25v7M56 27l-3 6" stroke="${m.shade}" stroke-width="2.4" stroke-linecap="round"/>`,
  },
  {
    id: "fox",
    name: "Лисёнок",
    packName: "Лисёнок Рыжик",
    body: "#ff8a3d",
    shade: "#e86f24",
    muzzle: "#fff4e8",
    inner: "#4a2c1a",
    line: "#3a2418",
    cheek: "#ff6f6f",
    back: (m) => `
      <g class="ch-tail-g"><path d="M64 90c18 2 30-10 28-24-1-8-6-12-10-12 2 14-6 22-18 24z" fill="${m.shade}"/>
      <path d="M86 58c4 4 6 10 4 16-2-6-6-8-10-8 2-3 4-6 6-8z" fill="#fff4e8"/></g>
      <path d="M22 46L24 8l26 18z" fill="${m.body}"/><path d="M78 46L76 8 50 26z" fill="${m.body}"/>
      <path d="M28 36l1-18 13 10z" fill="${m.inner}"/><path d="M72 36l-1-18-13 10z" fill="${m.inner}"/>`,
  },
  {
    id: "duck",
    name: "Утёнок",
    packName: "Утёнок Кряк",
    body: "#ffd84d",
    shade: "#f5c02a",
    muzzle: null,
    inner: "#ffd84d",
    line: "#3d3412",
    cheek: "#ff9f8a",
    beak: "#ff9a1f",
    back: (m) => `
      <path d="M50 26c-4-10 2-16 9-14-5 3-5 8-2 12zM46 27c-6-6-4-12 1-13-2 4-1 8 2 11z" fill="${m.shade}"/>`,
  },
  {
    id: "bunny",
    name: "Зайка",
    packName: "Зайка Пушок",
    body: "#f4f1fb",
    shade: "#dcd5ef",
    muzzle: "#ffffff",
    inner: "#ffb6c9",
    line: "#3d3556",
    cheek: "#ff9db8",
    back: (m) => `
      <g><ellipse cx="38" cy="16" rx="8" ry="20" fill="${m.body}" transform="rotate(-10 38 16)"/>
      <ellipse cx="38" cy="17" rx="4" ry="14" fill="${m.inner}" transform="rotate(-10 38 17)"/></g>
      <g><ellipse cx="62" cy="16" rx="8" ry="20" fill="${m.body}" transform="rotate(10 62 16)"/>
      <ellipse cx="62" cy="17" rx="4" ry="14" fill="${m.inner}" transform="rotate(10 62 17)"/></g>`,
  },
];

const heart = (cx: number, cy: number, s: number, fill: string, cls = "") =>
  `<path${cls ? ` class="${cls}"` : ""} transform="translate(${cx} ${cy}) scale(${s})" d="M0 4C-5 0-7-2.5-7-5c0-2 1.6-3.6 3.6-3.6 1.4 0 2.6.8 3.4 2 .8-1.2 2-2 3.4-2C5.4-8.6 7-7 7-5c0 2.5-2 5-7 9z" fill="${fill}"/>`;
const star = (cx: number, cy: number, r: number, fill: string, cls: string) =>
  `<path class="${cls}" d="M${cx} ${cy - r}l${r * 0.3} ${r * 0.7} ${r * 0.7} ${r * 0.3}-${r * 0.7} ${r * 0.3}-${r * 0.3} ${r * 0.7}-${r * 0.3}-${r * 0.7}-${r * 0.7}-${r * 0.3} ${r * 0.7}-${r * 0.3}z" fill="${fill}"/>`;

type Emotion = {
  id: string;
  emoji: string;
  name: string;
  /** Анимация всего персонажа. */
  anim: string;
  face: (m: Mascot) => string;
  /** Лапки (по умолчанию — обе внизу). */
  paws?: (m: Mascot) => string;
  /** Детали поверх: сердечки, слёзы, конфетти. */
  extra?: (m: Mascot) => string;
};

const stroke = (m: Mascot, d: string, w = 2.6) => `<path d="${d}" stroke="${m.line}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
const eyes = (m: Mascot, dy = 0) =>
  `<ellipse class="ch-eye" cx="40" cy="${50 + dy}" rx="3.8" ry="4.8" fill="${m.line}"/><ellipse class="ch-eye" cx="60" cy="${50 + dy}" rx="3.8" ry="4.8" fill="${m.line}"/>` +
  `<circle cx="41.3" cy="${48 + dy}" r="1.4" fill="#fff"/><circle cx="61.3" cy="${48 + dy}" r="1.4" fill="#fff"/>`;
const happyEyes = (m: Mascot) => stroke(m, "M35 51q5-6 10 0M55 51q5-6 10 0", 3);
const closedEyes = (m: Mascot) => stroke(m, "M35 50q5 4 10 0M55 50q5 4 10 0", 2.6);
const mouthColor = (m: Mascot) => (m.beak ? "#b85a00" : m.line);
const smile = (m: Mascot) => `<path d="M44 62q6 6 12 0" stroke="${mouthColor(m)}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
const openMouth = (m: Mascot, big = false) =>
  big
    ? `<path d="M40 60q10 18 20 0z" fill="${mouthColor(m)}"/><path d="M45 66q5 5 10 0z" fill="#ff7a8a"/>`
    : `<path d="M43 61q7 12 14 0z" fill="${mouthColor(m)}"/><path d="M46.5 65.5q3.5 3.5 7 0z" fill="#ff7a8a"/>`;
const frown = (m: Mascot) => `<path d="M44 66q6-6 12 0" stroke="${mouthColor(m)}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;

const pawsDown = (m: Mascot) => `<ellipse cx="32" cy="82" rx="7" ry="6" fill="${m.shade}"/><ellipse cx="68" cy="82" rx="7" ry="6" fill="${m.shade}"/>`;
const waving = (m: Mascot) =>
  `<ellipse cx="32" cy="82" rx="7" ry="6" fill="${m.shade}"/><g class="ch-arm-g"><ellipse cx="80" cy="56" rx="7" ry="9" fill="${m.shade}"/></g>`;
const pawsUp = (m: Mascot) =>
  `<g class="ch-arm-g"><ellipse cx="18" cy="52" rx="7" ry="9" fill="${m.shade}"/></g><g class="ch-arm-g"><ellipse cx="82" cy="52" rx="7" ry="9" fill="${m.shade}"/></g>`;
const pawsTogether = (m: Mascot) => `<ellipse cx="45" cy="80" rx="7" ry="8" fill="${m.shade}"/><ellipse cx="55" cy="80" rx="7" ry="8" fill="${m.shade}"/>`;

const EMOTIONS: readonly Emotion[] = [
  { id: "hi", emoji: "👋", name: "Привет", anim: "ch-body-g", face: (m) => eyes(m) + smile(m), paws: waving },
  {
    id: "yay",
    emoji: "🎉",
    name: "Ура",
    anim: "art-jump",
    face: (m) => happyEyes(m) + openMouth(m),
    paws: pawsUp,
    extra: () =>
      `<circle class="art-confetti-1" cx="24" cy="26" r="3.6" fill="#ff6b9a"/><rect class="art-confetti-2" x="72" y="20" width="6" height="6" rx="1.5" fill="#4dd4c0"/><circle class="art-confetti-3" cx="50" cy="12" r="3" fill="#7c5cf0"/>`,
  },
  {
    id: "love",
    emoji: "❤️",
    name: "Люблю",
    anim: "art-sway",
    face: (m) => heart(40, 50, 0.9, "#ff3d6b") + heart(60, 50, 0.9, "#ff3d6b") + smile(m),
    paws: (m) => pawsTogether(m) + `<g class="art-beat">${heart(50, 79, 1.3, "#ff4d6d")}</g>`,
    extra: () => heart(20, 40, 0.8, "#ff87a0", "art-rise-1") + heart(82, 34, 0.7, "#ffa8bb", "art-rise-2"),
  },
  {
    id: "cry",
    emoji: "😭",
    name: "Плачу",
    anim: "art-sway",
    face: (m) => closedEyes(m) + stroke(m, "M34 43l9-3M66 43l-9-3", 2.4) + frown(m),
    extra: () =>
      `<path class="art-tear-1" d="M38 55c3 5 4 8 2 10-2 2-5 0-5-3 0-2 1-4 3-7z" fill="#4aa8ff"/><path class="art-tear-2" d="M62 55c3 5 4 8 2 10-2 2-5 0-5-3 0-2 1-4 3-7z" fill="#4aa8ff"/>`,
  },
  {
    id: "angry",
    emoji: "😡",
    name: "Злюсь",
    anim: "art-shake",
    face: (m) => `<ellipse cx="50" cy="52" rx="27" ry="25" fill="#ff3b30" opacity="0.22"/>` + eyes(m, 1) + stroke(m, "M33 41l11 5M67 41l-11 5", 3.2) + frown(m),
    extra: () =>
      `<g class="art-twinkle-1"><circle cx="20" cy="24" r="5" fill="#e3e6ee"/><circle cx="14" cy="18" r="3.4" fill="#e3e6ee"/></g><g class="art-twinkle-2"><circle cx="80" cy="24" r="5" fill="#e3e6ee"/><circle cx="86" cy="18" r="3.4" fill="#e3e6ee"/></g>`,
  },
  {
    id: "think",
    emoji: "🤔",
    name: "Думаю",
    anim: "art-tilt",
    face: (m) =>
      `<ellipse class="ch-eye" cx="41" cy="48" rx="3.6" ry="4.4" fill="${m.line}"/><ellipse class="ch-eye" cx="61" cy="48" rx="3.6" ry="4.4" fill="${m.line}"/>` +
      stroke(m, "M35 41q5-2 10 0M56 38q5-4 10-1", 2.4) +
      `<path d="M46 64q5-2 9 1" stroke="${mouthColor(m)}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    paws: (m) => `<ellipse cx="32" cy="82" rx="7" ry="6" fill="${m.shade}"/><ellipse cx="58" cy="74" rx="7" ry="6" fill="${m.shade}"/>`,
    extra: () => `<text class="art-twinkle-1" x="82" y="30" text-anchor="middle" font-size="20" font-weight="800" fill="#7c5cf0">?</text>`,
  },
  {
    id: "ok",
    emoji: "👌",
    name: "Окей",
    anim: "art-pop",
    face: (m) =>
      `<ellipse class="ch-eye" cx="40" cy="50" rx="3.8" ry="4.8" fill="${m.line}"/><circle cx="41.3" cy="48" r="1.4" fill="#fff"/>` + stroke(m, "M55 51q5-5 10 0", 3) + smile(m),
    paws: (m) =>
      `<ellipse cx="32" cy="82" rx="7" ry="6" fill="${m.shade}"/><g class="ch-arm-g"><ellipse cx="80" cy="58" rx="7" ry="8" fill="${m.shade}"/><circle cx="80" cy="48" r="4" fill="none" stroke="${m.shade}" stroke-width="3"/></g>`,
    extra: () => star(18, 28, 6, "#ffd166", "art-twinkle-1") + star(84, 24, 5, "#fff0a8", "art-twinkle-2"),
  },
  {
    id: "thanks",
    emoji: "🙏",
    name: "Спасибо",
    anim: "art-bow",
    face: (m) => happyEyes(m) + `<path d="M46 62q4 4 8 0" stroke="${mouthColor(m)}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    paws: pawsTogether,
    extra: () => star(20, 26, 6, "#ffd166", "art-twinkle-1") + star(80, 20, 5, "#ffe9a8", "art-twinkle-2"),
  },
  {
    id: "sleep",
    emoji: "😴",
    name: "Сплю",
    anim: "art-breathe",
    face: (m) => closedEyes(m) + `<ellipse cx="50" cy="64" rx="3" ry="3.4" fill="${mouthColor(m)}"/>`,
    extra: () =>
      `<path d="M30 30c4-14 26-20 40-8l-6 6c-10-6-24-4-30 6z" fill="#7c5cf0"/><circle cx="74" cy="20" r="4.5" fill="#ffd166"/>` +
      `<text class="art-z-1" x="80" y="40" font-size="15" font-weight="800" fill="#9b7cff">Z</text><text class="art-z-2" x="88" y="28" font-size="11" font-weight="800" fill="#b39bff">z</text>`,
  },
  {
    id: "laugh",
    emoji: "😂",
    name: "Смеюсь",
    anim: "art-jump",
    face: (m) => stroke(m, "M35 45l8 5-8 5M65 45l-8 5 8 5", 3) + openMouth(m, true),
    extra: () =>
      `<path class="art-tear-1" d="M28 50c3 5 4 8 2 10-2 2-5 0-5-3 0-2 1-4 3-7z" fill="#7ec8ff"/><path class="art-tear-2" d="M72 50c3 5 4 8 2 10-2 2-5 0-5-3 0-2 1-4 3-7z" fill="#7ec8ff"/>`,
  },
  {
    id: "wow",
    emoji: "😱",
    name: "Ого",
    anim: "art-pop",
    face: (m) =>
      `<circle cx="40" cy="49" r="6" fill="#fff"/><circle cx="60" cy="49" r="6" fill="#fff"/><circle class="ch-eye" cx="40" cy="49" r="3.4" fill="${m.line}"/><circle class="ch-eye" cx="60" cy="49" r="3.4" fill="${m.line}"/>` +
      stroke(m, "M34 39q5-3 10 0M56 39q5-3 10 0", 2.4) +
      `<ellipse cx="50" cy="65" rx="4.5" ry="6" fill="${mouthColor(m)}"/>`,
    paws: (m) => `<ellipse cx="24" cy="62" rx="7" ry="8" fill="${m.shade}"/><ellipse cx="76" cy="62" rx="7" ry="8" fill="${m.shade}"/>`,
    extra: () => star(16, 30, 6, "#ffd166", "art-twinkle-1") + star(86, 30, 6, "#ffd166", "art-twinkle-2"),
  },
];

function mascotBody(m: Mascot, e: Emotion) {
  const muzzle = m.muzzle ? `<ellipse cx="50" cy="62" rx="15" ry="11" fill="${m.muzzle}"/>` : "";
  const nose = m.beak
    ? `<ellipse cx="50" cy="63" rx="12" ry="6.5" fill="${m.beak}"/>`
    : m.id === "bunny"
      ? `<path d="M47 56h6l-3 3z" fill="${m.inner}"/>`
      : `<ellipse cx="50" cy="57" rx="3.4" ry="2.4" fill="${m.id === "fox" ? m.line : m.inner}"/>`;
  return (
    m.back(m) +
    `<ellipse cx="50" cy="82" rx="22" ry="14" fill="${m.body}"/>` +
    (m.muzzle ? `<ellipse cx="50" cy="84" rx="12" ry="9" fill="${m.muzzle}"/>` : "") +
    `<circle cx="50" cy="52" r="28" fill="${m.body}"/>` +
    muzzle +
    `<ellipse cx="32" cy="60" rx="5" ry="3.2" fill="${m.cheek}" opacity="0.7"/><ellipse cx="68" cy="60" rx="5" ry="3.2" fill="${m.cheek}" opacity="0.7"/>` +
    nose +
    e.face(m) +
    (e.paws ?? pawsDown)(m)
  );
}

function mascotMarkup(m: Mascot, e: Emotion) {
  return `
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="${e.anim}">${mascotBody(m, e)}</g>
  ${e.extra?.(m) ?? ""}
</svg>`;
}

const artId = (m: Mascot, e: Emotion) => `${m.id}_${e.id}`;

/** Рисунки всех персонажей — в общий ART (drawn-art.ts), id вида «cat_hi». */
export const MASCOT_ART: Record<string, ArtItem> = Object.fromEntries(
  MASCOTS.flatMap((m) => EMOTIONS.map((e) => [artId(m, e), { markup: mascotMarkup(m, e), name: `${m.name}: ${e.name}` }]))
);

export type BuiltinStickerPack = { id: string; name: string; stickers: Sticker[] };

/** Встроенные паки: стикер уходит в сообщение эмодзи + сценой (id рисунка), как DRAWN_STICKERS. */
export const MASCOT_PACKS: readonly BuiltinStickerPack[] = MASCOTS.map((m) => ({
  id: `builtin_${m.id}`,
  name: m.packName,
  stickers: EMOTIONS.map((e) => ({ id: `art_${artId(m, e)}`, emoji: e.emoji, name: e.name, scene: artId(m, e) })),
}));

export type AvatarPreset = { id: string; name: string; stops: readonly [string, string]; image: string };

const PRESET_BG: readonly (readonly [string, string])[] = [
  ["#a18cd1", "#fbc2eb"],
  ["#4facfe", "#00f2fe"],
  ["#f6d365", "#fda085"],
  ["#43e97b", "#38f9d7"],
  ["#ff8a65", "#d81b60"],
  ["#30cfd0", "#330867"],
  ["#89f7fe", "#66a6ff"],
  ["#fddb92", "#d1fdff"],
];
const PRESET_EMOTIONS = ["hi", "love", "ok", "yay", "think", "wow"] as const;

/** Статичная картинка персонажа (SVG data URL) — для аватара на холсте. */
function staticImage(m: Mascot, e: Emotion) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 112 112" width="512" height="512">${mascotBody(m, e)}${e.extra?.(m) ?? ""}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Готовые аватары: персонаж с эмоцией на градиенте. */
export const AVATAR_PRESETS: readonly AvatarPreset[] = MASCOTS.flatMap((m, mi) =>
  PRESET_EMOTIONS.map((eid, ei) => {
    const e = EMOTIONS.find((x) => x.id === eid)!;
    return { id: `${m.id}_${eid}`, name: `${m.name}: ${e.name}`, stops: PRESET_BG[(mi * 2 + ei) % PRESET_BG.length]!, image: staticImage(m, e) };
  })
);
