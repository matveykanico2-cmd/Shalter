const MODELS = [
  { name: "Обычная", rarity: 40 },
  { name: "Морозная", rarity: 18 },
  { name: "Закатная", rarity: 14 },
  { name: "Неоновая", rarity: 10 },
  { name: "Золотая", rarity: 8 },
  { name: "Уютный космос", rarity: 5 },
  { name: "Вирус", rarity: 3 },
  { name: "Затмение", rarity: 2 },
];

// Фоны и узоры — настоящие из коллекций Telegram (scripts/import-telegram-gifts.js),
// редкость — их доля среди выпущенных подарков. Фоны приводим к той же форме,
// что и выбранные при отправке (giftBackground.js), чтобы рисовались одинаково.
const BACKDROPS = TG_BACKDROPS.map((b) => ({
  name: b.name,
  center: b.colors[0],
  edge: b.colors[1],
  pattern: b.pattern,
  rarity: b.rarity,
  symbol: null,
}));
const SYMBOLS = TG_SYMBOLS.map((sym) => ({ ...sym, image: `/gift-symbols/${sym.id}.webp` }));
// У подарков-коллекций из Telegram — свои модели.
const COLLECTION_MODELS = { tg_plush_pepe: TG_MODELS.plushpepe };

import { renderScene } from "./animScenes.js";
import { renderCustomScene } from "./customScene.js";
import { hash01 } from "./giftBackground.js";
import { lottieNameFor, emojiArtName, renderEmojiArt, renderLottie } from "./lottie.js";
import { TG_BACKDROPS, TG_SYMBOLS, TG_MODELS } from "./tgGiftData.js";

function pick(list, roll) {
  const total = list.reduce((sum, item) => sum + item.rarity, 0);
  let point = roll * total;
  for (const item of list) {
    point -= item.rarity;
    if (point <= 0) return item;
  }
  return list[list.length - 1];
}

export function giftTraits(gift) {
  const seed = `${gift?.giftId ?? gift?.id ?? gift?.emoji ?? "gift"}#${gift?.serial ?? 0}`;
  const symbol = pick(SYMBOLS, hash01(seed, 3));
  return {
    model: pick(COLLECTION_MODELS[gift?.giftId ?? gift?.id] ?? MODELS, hash01(seed, 1)),
    // Фон серии сразу со своим узором — как collectibleAttributes.backdrop + pattern в tweb.
    backdrop: { ...pick(BACKDROPS, hash01(seed, 2)), symbol },
    symbol,
  };
}

// Подарки каталога без своей анимации в tweb — нарисованы встроенной сценой
// (тот же движок, что у нарисованных подарков). «Утёнок на отдыхе» раньше
// показывался просто эмодзи пляжа 🏖️ — без утёнка.
const BUILTIN_GIFT_SCENES = {
  tw_duck_vacation: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 78, y: 20, r: 11, fill: "#ffd23f", anim: "pulse", dur: 2.6 },
      { type: "ellipse", x: 50, y: 70, w: 96, h: 18, fill: "#4fb6ea", opacity: 0.9, anim: "float", dur: 3.2 },
      { type: "ellipse", x: 50, y: 86, w: 94, h: 24, fill: "#f4d48f" },
      { type: "emoji", emoji: "⛱️", x: 28, y: 52, size: 44, anim: "swing", dur: 3.4 },
      { type: "emoji", emoji: "🐥", x: 60, y: 72, size: 34, anim: "bounce", dur: 1.8 },
      { type: "emoji", emoji: "🕶️", x: 61, y: 66, size: 15, anim: "bounce", dur: 1.8 },
      { type: "emoji", emoji: "🍹", x: 84, y: 80, size: 17, anim: "wiggle", dur: 2.2 },
    ],
  },
  shalter_crab_birthday: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 44, fill: "#ffd9e8", opacity: 0.6, anim: "pulse", dur: 3 },
      { type: "ellipse", x: 50, y: 70, w: 90, h: 20, fill: "#4fb6ea", opacity: 0.7, anim: "float", dur: 3.2 },
      { type: "emoji", emoji: "🦀", x: 30, y: 46, size: 38, anim: "bounce", dur: 2 },
      { type: "emoji", emoji: "🎂", x: 70, y: 36, size: 30, anim: "twinkle", dur: 2.2 },
      { type: "emoji", emoji: "🎉", x: 20, y: 28, size: 20, anim: "burst", delay: 0.8, dur: 1.5 },
      { type: "emoji", emoji: "🎈", x: 78, y: 52, size: 24, anim: "rise", delay: 0.5, dur: 2.6 },
    ],
  },
  shalter_crab_party: {
    v: 1,
    loop: 3.4,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 46, fill: "#fff0d6", opacity: 0.5, anim: "pulse", dur: 2.8 },
      { type: "emoji", emoji: "🦀", x: 50, y: 44, size: 40, anim: "wave", dur: 1.8 },
      { type: "emoji", emoji: "🍾", x: 22, y: 30, size: 24, anim: "pop", delay: 0.4, dur: 1.2 },
      { type: "emoji", emoji: "🥂", x: 74, y: 28, size: 22, anim: "pop", delay: 0.8, dur: 1.2 },
      { type: "emoji", emoji: "🎊", x: 30, y: 70, size: 20, anim: "burst", delay: 1.0, dur: 1 },
      { type: "emoji", emoji: "🎊", x: 72, y: 68, size: 18, anim: "burst", delay: 1.3, dur: 1 },
    ],
  },
  shalter_crab_hug: {
    v: 1,
    loop: 2.8,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#ffd6e0", opacity: 0.5, anim: "beat", dur: 2.2 },
      { type: "emoji", emoji: "🦀", x: 50, y: 46, size: 42, anim: "pulse", dur: 2 },
      { type: "emoji", emoji: "❤️", x: 50, y: 20, size: 28, anim: "rise", delay: 0.3, dur: 1.8 },
      { type: "emoji", emoji: "✨", x: 24, y: 70, size: 18, anim: "twinkle", delay: 0.5, dur: 1.6 },
      { type: "emoji", emoji: "✨", x: 78, y: 72, size: 16, anim: "twinkle", delay: 0.9, dur: 1.4 },
    ],
  },
};

export function renderGiftArt(gift, { size = 84, replay = true } = {}) {
  if (gift?.scene) {
    return renderCustomScene(gift.scene, { size, replay });
  }
  const builtin = BUILTIN_GIFT_SCENES[gift?.giftId] ?? BUILTIN_GIFT_SCENES[gift?.id];
  if (builtin && !gift?.mediaUrl) return renderCustomScene(builtin, { size, replay });
  const asEmoji = () => renderScene(gift?.emoji, { size, replay });
  const lottie = lottieNameFor(gift);
  // Подарки-эмодзи (rose, heart, nt_robot…): кадр покоя анимированного эмодзи берём из
  // середины — край бывает пустым. Не приехал lottie — статичная картинка из gift-emoji,
  // не приехала и она — сам символ эмодзи.
  const asPicture = () => renderEmojiArt(lottie ?? emojiArtName(gift?.emoji), { size, replay, fallback: asEmoji });
  const art = lottie?.startsWith("emoji/")
    ? () => renderLottie(lottie, { size, replay, rest: "mid", fallback: asPicture, placeholder: asEmoji })
    : lottie
      ? () => renderLottie(lottie, { size, replay, rest: "last", fallback: asEmoji, placeholder: asEmoji })
      : asPicture;
  if (!gift?.mediaUrl) return art();
  const img = document.createElement("img");
  img.src = gift.mediaUrl;
  img.alt = gift.name ?? "";
  img.className = "gift-media-art";
  img.style.width = `${size}px`;
  img.style.height = `${size}px`;
  if (!replay) img.classList.add("no-entrance");
  // Загруженная картинка может оказаться недоступной (файл уехал в S3, удалён) —
  // тогда показываем art подарка, а не «битое изображение».
  img.addEventListener("error", () => img.replaceWith(art()), { once: true });
  return img;
}
