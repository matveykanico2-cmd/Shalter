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
      { type: "emoji", emoji: "🎂", x: 70, y: 36, size: 30, anim: "blink", dur: 2.2 },
      { type: "emoji", emoji: "🎉", x: 20, y: 28, size: 20, anim: "pop", delay: 0.8, dur: 1.5 },
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
      { type: "emoji", emoji: "🎊", x: 30, y: 70, size: 20, anim: "pop", delay: 1.0, dur: 1 },
      { type: "emoji", emoji: "🎊", x: 72, y: 68, size: 18, anim: "pop", delay: 1.3, dur: 1 },
    ],
  },
  shalter_crab_hug: {
    v: 1,
    loop: 2.8,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#ffd6e0", opacity: 0.5, anim: "heartbeat", dur: 2.2 },
      { type: "emoji", emoji: "🦀", x: 50, y: 46, size: 42, anim: "pulse", dur: 2 },
      { type: "emoji", emoji: "❤️", x: 50, y: 20, size: 28, anim: "rise", delay: 0.3, dur: 1.8 },
      { type: "emoji", emoji: "✨", x: 24, y: 70, size: 18, anim: "blink", delay: 0.5, dur: 1.6 },
      { type: "emoji", emoji: "✨", x: 78, y: 72, size: 16, anim: "blink", delay: 0.9, dur: 1.4 },
    ],
  },
  // — Новые подарки с крабом для дней рождения —
  shalter_crab_hello: {
    v: 1,
    loop: 3.2,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 42, fill: "#e6f7ff", opacity: 0.5, anim: "float", dur: 3 },
      { type: "emoji", emoji: "🦀", x: 50, y: 44, size: 44, anim: "wave", dur: 1.6 },
      { type: "emoji", emoji: "👋", x: 26, y: 30, size: 22, anim: "pop", delay: 0.5, dur: 1.2 },
      { type: "emoji", emoji: "✨", x: 74, y: 48, size: 16, anim: "blink", delay: 0.8, dur: 1.4 },
    ],
  },
  crab_cake_slice: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#fff5e6", opacity: 0.5, anim: "pulse", dur: 2.8 },
      { type: "emoji", emoji: "🦀", x: 30, y: 42, size: 36, anim: "bounce", dur: 2 },
      { type: "emoji", emoji: "🍰", x: 68, y: 40, size: 28, anim: "blink", delay: 0.6, dur: 1.8 },
      { type: "emoji", emoji: "🕯️", x: 72, y: 24, size: 12, anim: "blink", delay: 0.3, dur: 1 },
    ],
  },
  crab_cake_whole: {
    v: 1,
    loop: 3.6,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 44, fill: "#ffd6e8", opacity: 0.6, anim: "pulse", dur: 3 },
      { type: "emoji", emoji: "🦀", x: 50, y: 48, size: 40, anim: "wave", dur: 1.8 },
      { type: "emoji", emoji: "🎂", x: 50, y: 28, size: 32, anim: "blink", delay: 0.4, dur: 2 },
      { type: "emoji", emoji: "🕯️", x: 48, y: 14, size: 14, anim: "blink", delay: 0.2, dur: 0.9 },
      { type: "emoji", emoji: "🎉", x: 24, y: 28, size: 18, anim: "pop", delay: 0.8, dur: 1.4 },
      { type: "emoji", emoji: "🎉", x: 76, y: 28, size: 18, anim: "pop", delay: 1.1, dur: 1.4 },
    ],
  },
  crab_ice_cream: {
    v: 1,
    loop: 2.8,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#fff0f6", opacity: 0.5, anim: "float", dur: 2.5 },
      { type: "emoji", emoji: "🦀", x: 32, y: 44, size: 32, anim: "wiggle", dur: 2 },
      { type: "emoji", emoji: "🍦", x: 70, y: 40, size: 28, anim: "rise", delay: 0.7, dur: 1.6 },
      { type: "emoji", emoji: "✨", x: 28, y: 22, size: 14, anim: "blink", delay: 0.4, dur: 1.2 },
    ],
  },
  crab_cupcake: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#ffe6e6", opacity: 0.5, anim: "heartbeat", dur: 2.5 },
      { type: "emoji", emoji: "🦀", x: 28, y: 46, size: 32, anim: "bounce", dur: 2.2 },
      { type: "emoji", emoji: "🧁", x: 70, y: 44, size: 28, anim: "blink", delay: 0.6, dur: 1.8 },
      { type: "emoji", emoji: "❤️", x: 50, y: 20, size: 16, anim: "rise", delay: 0.4, dur: 1.4 },
    ],
  },
  crab_candy: {
    v: 1,
    loop: 2.4,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 38, fill: "#fff9c4", opacity: 0.5, anim: "pulse", dur: 2 },
      { type: "emoji", emoji: "🦀", x: 40, y: 48, size: 30, anim: "wiggle", dur: 1.8 },
      { type: "emoji", emoji: "🍬", x: 20, y: 30, size: 18, anim: "pop", delay: 0.5, dur: 1.2 },
      { type: "emoji", emoji: "🍭", x: 68, y: 30, size: 20, anim: "pop", delay: 0.9, dur: 1.2 },
    ],
  },
  crab_lollipop: {
    v: 1,
    loop: 2.6,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 38, fill: "#fff0f6", opacity: 0.5, anim: "pulse", dur: 2.3 },
      { type: "emoji", emoji: "🦀", x: 42, y: 48, size: 30, anim: "wiggle", dur: 2 },
      { type: "emoji", emoji: "🍭", x: 18, y: 40, size: 22, anim: "pulse", delay: 0.4, dur: 1.5 },
      { type: "emoji", emoji: "✨", x: 76, y: 32, size: 16, anim: "blink", delay: 0.8, dur: 1.2 },
    ],
  },
  crab_chocolate: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#f3e5f5", opacity: 0.5, anim: "heartbeat", dur: 2.6 },
      { type: "emoji", emoji: "🦀", x: 34, y: 44, size: 32, anim: "wiggle", dur: 2 },
      { type: "emoji", emoji: "🍫", x: 68, y: 42, size: 26, anim: "blink", delay: 0.6, dur: 1.8 },
      { type: "emoji", emoji: "❤️", x: 50, y: 20, size: 14, anim: "rise", delay: 0.3, dur: 1.5 },
    ],
  },
  crab_donut: {
    v: 1,
    loop: 2.8,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#fff3e0", opacity: 0.5, anim: "float", dur: 2.5 },
      { type: "emoji", emoji: "🦀", x: 30, y: 46, size: 34, anim: "bounce", dur: 2 },
      { type: "emoji", emoji: "🍩", x: 70, y: 44, size: 26, anim: "spin", delay: 0.5, dur: 1.8 },
      { type: "emoji", emoji: "🍓", x: 70, y: 36, size: 10, anim: "blink", delay: 0.2, dur: 1 },
    ],
  },
  crab_pizza: {
    v: 1,
    loop: 2.6,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#fff5e6", opacity: 0.5, anim: "pulse", dur: 2.3 },
      { type: "emoji", emoji: "🦀", x: 28, y: 44, size: 32, anim: "wiggle", dur: 2 },
      { type: "emoji", emoji: "🍕", x: 70, y: 44, size: 28, anim: "pop", delay: 0.7, dur: 1.4 },
      { type: "emoji", emoji: "🌶️", x: 72, y: 32, size: 12, anim: "pop", delay: 0.5, dur: 1 },
    ],
  },
  crab_popcorn: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#fff8e1", opacity: 0.6, anim: "float", dur: 2.8 },
      { type: "emoji", emoji: "🦀", x: 36, y: 44, size: 32, anim: "bounce", dur: 2.2 },
      { type: "emoji", emoji: "🍿", x: 70, y: 40, size: 26, anim: "pop", delay: 0.6, dur: 1.4 },
      { type: "emoji", emoji: "✨", x: 24, y: 28, size: 14, anim: "blink", delay: 0.4, dur: 1.2 },
    ],
  },
  crab_cocktail: {
    v: 1,
    loop: 3.2,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#e1f5fe", opacity: 0.5, anim: "swing", dur: 3 },
      { type: "emoji", emoji: "🦀", x: 30, y: 46, size: 34, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "🍹", x: 70, y: 42, size: 28, anim: "rise", delay: 0.8, dur: 1.8 },
      { type: "emoji", emoji: "🍸", x: 66, y: 30, size: 14, anim: "blink", delay: 0.5, dur: 1.2 },
    ],
  },
  crab_champagne: {
    v: 1,
    loop: 3.4,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 44, fill: "#fff9c4", opacity: 0.5, anim: "pulse", dur: 3 },
      { type: "emoji", emoji: "🦀", x: 32, y: 46, size: 36, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "🍾", x: 68, y: 44, size: 28, anim: "pop", delay: 0.6, dur: 1.5 },
      { type: "emoji", emoji: "🥂", x: 64, y: 30, size: 18, anim: "blink", delay: 0.4, dur: 1.2 },
      { type: "emoji", emoji: "✨", x: 22, y: 28, size: 12, anim: "pop", delay: 0.9, dur: 1 },
    ],
  },
  crab_toast: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#fff0f6", opacity: 0.5, anim: "heartbeat", dur: 2.6 },
      { type: "emoji", emoji: "🦀", x: 34, y: 44, size: 34, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "🥂", x: 70, y: 42, size: 28, anim: "blink", delay: 0.6, dur: 1.8 },
      { type: "emoji", emoji: "🍾", x: 20, y: 30, size: 18, anim: "pop", delay: 0.9, dur: 1.3 },
    ],
  },
  crab_candle: {
    v: 1,
    loop: 2.8,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 38, fill: "#fff0f6", opacity: 0.4, anim: "blink", dur: 2.5 },
      { type: "emoji", emoji: "🦀", x: 36, y: 48, size: 32, anim: "wiggle", dur: 2 },
      { type: "emoji", emoji: "🕯️", x: 70, y: 30, size: 26, anim: "blink", delay: 0.3, dur: 0.8 },
      { type: "emoji", emoji: "🔥", x: 70, y: 14, size: 20, anim: "blink", delay: 0.2, dur: 0.7 },
    ],
  },
  crab_party_hat: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#e8f5e9", opacity: 0.5, anim: "pulse", dur: 2.8 },
      { type: "emoji", emoji: "🎩", x: 50, y: 18, size: 36, anim: "bounce", delay: 0.3, dur: 1.5 },
      { type: "emoji", emoji: "🦀", x: 50, y: 52, size: 36, anim: "wave", dur: 1.8 },
      { type: "emoji", emoji: "🎉", x: 22, y: 50, size: 18, anim: "pop", delay: 0.8, dur: 1.4 },
      { type: "emoji", emoji: "🎉", x: 78, y: 50, size: 18, anim: "pop", delay: 1.2, dur: 1.4 },
    ],
  },
  crab_present: {
    v: 1,
    loop: 3.2,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#f3e5f5", opacity: 0.5, anim: "pulse", dur: 2.8 },
      { type: "emoji", emoji: "🦀", x: 34, y: 46, size: 32, anim: "wiggle", dur: 2 },
      { type: "emoji", emoji: "🎁", x: 68, y: 42, size: 28, anim: "pop", delay: 0.7, dur: 1.6 },
      { type: "emoji", emoji: "🎀", x: 66, y: 30, size: 12, anim: "blink", delay: 0.3, dur: 1.2 },
    ],
  },
  crab_balloon: {
    v: 1,
    loop: 3.6,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 44, fill: "#fff9c4", opacity: 0.5, anim: "float", dur: 3.2 },
      { type: "emoji", emoji: "🦀", x: 50, y: 52, size: 36, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "🎈", x: 24, y: 24, size: 28, anim: "rise", delay: 0.2, dur: 2 },
      { type: "emoji", emoji: "🎈", x: 76, y: 20, size: 24, anim: "rise", delay: 0.7, dur: 2.4 },
    ],
  },
  crab_confetti: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#ffd6e8", opacity: 0.5, anim: "pulse", dur: 2.6 },
      { type: "emoji", emoji: "🦀", x: 36, y: 48, size: 34, anim: "wiggle", dur: 2.2 },
      { type: "emoji", emoji: "🎊", x: 20, y: 28, size: 18, anim: "pop", delay: 0.4, dur: 1.4 },
      { type: "emoji", emoji: "🎊", x: 72, y: 26, size: 16, anim: "pop", delay: 0.8, dur: 1.4 },
      { type: "emoji", emoji: "✨", x: 50, y: 18, size: 14, anim: "pop", delay: 0.6, dur: 1.2 },
    ],
  },
  crab_fireworks: {
    v: 1,
    loop: 3.8,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 46, fill: "#000", opacity: 0.2, anim: "pop", dur: 3 },
      { type: "emoji", emoji: "🦀", x: 50, y: 60, size: 36, anim: "bounce", dur: 2.5 },
      { type: "emoji", emoji: "🎆", x: 50, y: 20, size: 30, anim: "pop", delay: 0.5, dur: 2 },
      { type: "emoji", emoji: "✨", x: 30, y: 15, size: 16, anim: "blink", delay: 0.6, dur: 1.4 },
      { type: "emoji", emoji: "✨", x: 72, y: 22, size: 14, anim: "blink", delay: 0.9, dur: 1.2 },
    ],
  },
  crab_star: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 42, fill: "#fff9c4", opacity: 0.6, anim: "blink", dur: 2.8 },
      { type: "emoji", emoji: "🦀", x: 50, y: 48, size: 36, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "⭐", x: 50, y: 18, size: 28, anim: "blink", delay: 0.3, dur: 1.8 },
      { type: "emoji", emoji: "✨", x: 24, y: 60, size: 14, anim: "blink", delay: 0.7, dur: 1.4 },
      { type: "emoji", emoji: "✨", x: 76, y: 62, size: 14, anim: "blink", delay: 1.0, dur: 1.4 },
    ],
  },
  crab_heart: {
    v: 1,
    loop: 2.8,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#ffd6e8", opacity: 0.5, anim: "heartbeat", dur: 2.4 },
      { type: "emoji", emoji: "🦀", x: 50, y: 50, size: 34, anim: "wiggle", dur: 2 },
      { type: "emoji", emoji: "💖", x: 50, y: 20, size: 28, anim: "rise", delay: 0.3, dur: 1.6 },
      { type: "emoji", emoji: "❤️", x: 30, y: 60, size: 16, anim: "blink", delay: 0.5, dur: 1.4 },
      { type: "emoji", emoji: "❤️", x: 70, y: 58, size: 16, anim: "blink", delay: 0.8, dur: 1.4 },
    ],
  },
  crab_kiss: {
    v: 1,
    loop: 2.6,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 38, fill: "#fff0f6", opacity: 0.5, anim: "pulse", dur: 2.2 },
      { type: "emoji", emoji: "🦀", x: 34, y: 48, size: 32, anim: "wiggle", dur: 2 },
      { type: "emoji", emoji: "💋", x: 68, y: 44, size: 26, anim: "blink", delay: 0.5, dur: 1.6 },
      { type: "emoji", emoji: "💖", x: 50, y: 22, size: 14, anim: "rise", delay: 0.4, dur: 1.4 },
    ],
  },
  crab_dance_slow: {
    v: 1,
    loop: 4,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 42, fill: "#e8f5e9", opacity: 0.4, anim: "pulse", dur: 3.5 },
      { type: "emoji", emoji: "🦀", x: 50, y: 48, size: 38, anim: "wave", dur: 3.6 },
      { type: "emoji", emoji: "🦗", x: 22, y: 30, size: 18, anim: "pop", delay: 1.0, dur: 1.2 },
      { type: "emoji", emoji: "✨", x: 72, y: 60, size: 14, anim: "blink", delay: 0.7, dur: 1.4 },
    ],
  },
  crab_dance_fast: {
    v: 1,
    loop: 2.2,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#fff0f6", opacity: 0.5, anim: "pulse", dur: 2 },
      { type: "emoji", emoji: "🦀", x: 50, y: 48, size: 38, anim: "wiggle", dur: 1.5 },
      { type: "emoji", emoji: "🦘", x: 24, y: 32, size: 20, anim: "bounce", delay: 0.5, dur: 1.2 },
      { type: "emoji", emoji: "🎉", x: 72, y: 55, size: 18, anim: "pop", delay: 0.3, dur: 1 },
    ],
  },
  crab_dj: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 44, fill: "#e1f5fe", opacity: 0.5, anim: "pulse", dur: 2.8 },
      { type: "emoji", emoji: "🦀", x: 34, y: 46, size: 32, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "🎧", x: 68, y: 30, size: 26, anim: "blink", delay: 0.4, dur: 1.6 },
      { type: "emoji", emoji: "🎵", x: 50, y: 20, size: 20, anim: "rise", delay: 0.8, dur: 1.4 },
      { type: "emoji", emoji: "🎶", x: 30, y: 18, size: 18, anim: "rise", delay: 1.0, dur: 1.4 },
      { type: "emoji", emoji: "✨", x: 28, y: 64, size: 12, anim: "blink", delay: 0.6, dur: 1.2 },
    ],
  },
  crab_guitar: {
    v: 1,
    loop: 3.2,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#f3e5f5", opacity: 0.5, anim: "pulse", dur: 2.8 },
      { type: "emoji", emoji: "🦀", x: 30, y: 50, size: 34, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "🎸", x: 68, y: 40, size: 28, anim: "blink", delay: 0.5, dur: 1.6 },
      { type: "emoji", emoji: "🎵", x: 40, y: 20, size: 16, anim: "rise", delay: 0.3, dur: 1.2 },
    ],
  },
  crab_drums: {
    v: 1,
    loop: 2.6,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#fff8e1", opacity: 0.5, anim: "heartbeat", dur: 2.2 },
      { type: "emoji", emoji: "🦀", x: 50, y: 42, size: 32, anim: "wiggle", dur: 1.8 },
      { type: "emoji", emoji: "🥁", x: 60, y: 70, size: 28, anim: "pop", delay: 0.4, dur: 1 },
      { type: "emoji", emoji: "🎶", x: 28, y: 28, size: 14, anim: "rise", delay: 0.5, dur: 1.2 },
    ],
  },
  crab_trumpet: {
    v: 1,
    loop: 2.8,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#fff0f6", opacity: 0.5, anim: "pulse", dur: 2.4 },
      { type: "emoji", emoji: "🦀", x: 32, y: 50, size: 32, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "🎺", x: 68, y: 36, size: 28, anim: "blink", delay: 0.5, dur: 1.6 },
      { type: "emoji", emoji: "🎵", x: 64, y: 20, size: 14, anim: "rise", delay: 0.6, dur: 1.2 },
    ],
  },
  crab_microphone: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#e1f5fe", opacity: 0.5, anim: "swing", dur: 2.8 },
      { type: "emoji", emoji: "🦀", x: 34, y: 48, size: 32, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "🎤", x: 68, y: 32, size: 28, anim: "blink", delay: 0.4, dur: 1.6 },
      { type: "emoji", emoji: "🎵", x: 55, y: 16, size: 14, anim: "rise", delay: 0.5, dur: 1.4 },
    ],
  },
  crab_sunhat: {
    v: 1,
    loop: 2.8,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#fff9c4", opacity: 0.6, anim: "float", dur: 2.6 },
      { type: "emoji", emoji: "👒", x: 50, y: 18, size: 32, anim: "bounce", dur: 2 },
      { type: "emoji", emoji: "🦀", x: 50, y: 52, size: 34, anim: "wiggle", dur: 2.2 },
      { type: "emoji", emoji: "🌞", x: 22, y: 20, size: 18, anim: "blink", delay: 0.5, dur: 1.6 },
    ],
  },
  crab_sunglasses: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#e8f5e9", opacity: 0.4, anim: "pulse", dur: 2.6 },
      { type: "emoji", emoji: "🕶️", x: 50, y: 28, size: 30, anim: "blink", delay: 0.3, dur: 1.8 },
      { type: "emoji", emoji: "🦀", x: 50, y: 52, size: 36, anim: "wave", dur: 2.2 },
      { type: "emoji", emoji: "🎉", x: 20, y: 55, size: 16, anim: "pop", delay: 0.7, dur: 1.2 },
    ],
  },
  crab_crown: {
    v: 1,
    loop: 3.2,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 44, fill: "#fff9c4", opacity: 0.6, anim: "blink", dur: 2.8 },
      { type: "emoji", emoji: "👑", x: 50, y: 16, size: 32, anim: "blink", delay: 0.2, dur: 2 },
      { type: "emoji", emoji: "🦀", x: 50, y: 52, size: 34, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "✨", x: 30, y: 28, size: 12, anim: "blink", delay: 0.5, dur: 1.4 },
      { type: "emoji", emoji: "✨", x: 72, y: 26, size: 12, anim: "blink", delay: 0.9, dur: 1.4 },
    ],
  },
  crab_scepter: {
    v: 1,
    loop: 2.8,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#e1f5fe", opacity: 0.5, anim: "pulse", dur: 2.4 },
      { type: "emoji", emoji: "🦀", x: 50, y: 50, size: 32, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "🪄", x: 68, y: 34, size: 26, anim: "blink", delay: 0.4, dur: 1.6 },
      { type: "emoji", emoji: "✨", x: 30, y: 20, size: 14, anim: "blink", delay: 0.6, dur: 1.2 },
    ],
  },
  crab_helmet: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#fff8e1", opacity: 0.5, anim: "pulse", dur: 2.6 },
      { type: "emoji", emoji: "🪖", x: 50, y: 22, size: 30, anim: "bounce", dur: 2 },
      { type: "emoji", emoji: "🦀", x: 50, y: 52, size: 34, anim: "wiggle", dur: 2.2 },
      { type: "emoji", emoji: "✨", x: 24, y: 40, size: 14, anim: "blink", delay: 0.5, dur: 1.2 },
    ],
  },
  crab_anchor: {
    v: 1,
    loop: 3.2,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 42, fill: "#e1f5fe", opacity: 0.4, anim: "float", dur: 2.8 },
      { type: "emoji", emoji: "🦀", x: 34, y: 48, size: 34, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "⚓", x: 68, y: 44, size: 28, anim: "swing", delay: 0.6, dur: 2 },
      { type: "emoji", emoji: "🌊", x: 20, y: 60, size: 20, anim: "float", delay: 0.8, dur: 2.4 },
    ],
  },
  crab_boat: {
    v: 1,
    loop: 3.6,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 44, fill: "#e1f5fe", opacity: 0.3, anim: "float", dur: 3 },
      { type: "emoji", emoji: "🦀", x: 50, y: 52, size: 32, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "⛵", x: 50, y: 22, size: 32, anim: "rise", delay: 0.4, dur: 2 },
      { type: "emoji", emoji: "🌊", x: 18, y: 65, size: 16, anim: "float", delay: 0.6, dur: 2.2 },
      { type: "emoji", emoji: "🌊", x: 82, y: 68, size: 16, anim: "float", delay: 1.0, dur: 2.4 },
    ],
  },
  crab_seashell: {
    v: 1,
    loop: 2.8,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 38, fill: "#fff9c4", opacity: 0.6, anim: "pulse", dur: 2.4 },
      { type: "emoji", emoji: "🦀", x: 40, y: 48, size: 30, anim: "wiggle", dur: 2 },
      { type: "emoji", emoji: "🐚", x: 20, y: 38, size: 22, anim: "blink", delay: 0.5, dur: 1.6 },
      { type: "emoji", emoji: "🌊", x: 60, y: 68, size: 12, anim: "float", delay: 0.8, dur: 2 },
    ],
  },
  crab_seaweed: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#e8f5e9", opacity: 0.5, anim: "swing", dur: 2.6 },
      { type: "emoji", emoji: "🦀", x: 50, y: 50, size: 34, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "🌿", x: 24, y: 30, size: 20, anim: "swing", delay: 0.3, dur: 1.8 },
      { type: "emoji", emoji: "🌿", x: 76, y: 34, size: 18, anim: "swing", delay: 0.6, dur: 2 },
      { type: "emoji", emoji: "🌿", x: 30, y: 72, size: 16, anim: "swing", delay: 0.9, dur: 1.6 },
    ],
  },
  crab_pearl: {
    v: 1,
    loop: 3.4,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 42, fill: "#fff9c4", opacity: 0.6, anim: "blink", dur: 2.8 },
      { type: "emoji", emoji: "🦀", x: 36, y: 48, size: 34, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "🦪", x: 66, y: 42, size: 26, anim: "pop", delay: 0.7, dur: 1.6 },
      { type: "emoji", emoji: "✨", x: 50, y: 20, size: 16, anim: "blink", delay: 0.4, dur: 1.4 },
    ],
  },
  crab_lifebuoy: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#e1f5fe", opacity: 0.5, anim: "swing", dur: 2.6 },
      { type: "emoji", emoji: "🦀", x: 50, y: 48, size: 32, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "🛟", x: 50, y: 30, size: 28, anim: "blink", delay: 0.3, dur: 1.8 },
      { type: "emoji", emoji: "🌊", x: 20, y: 70, size: 14, anim: "float", delay: 0.8, dur: 2 },
    ],
  },
  crab_sandcastle: {
    v: 1,
    loop: 3.6,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 44, fill: "#fff9c4", opacity: 0.6, anim: "float", dur: 3 },
      { type: "emoji", emoji: "🏖️", x: 50, y: 70, size: 32, anim: "rise", delay: 0.2, dur: 2 },
      { type: "emoji", emoji: "🦀", x: 50, y: 46, size: 32, anim: "wiggle", dur: 2.2 },
      { type: "emoji", emoji: "🏰", x: 50, y: 40, size: 24, anim: "blink", delay: 0.5, dur: 1.6 },
      { type: "emoji", emoji: "⛵", x: 28, y: 55, size: 16, anim: "rise", delay: 1.0, dur: 1.4 },
    ],
  },
  crab_towel: {
    v: 1,
    loop: 2.8,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 40, fill: "#fff0f6", opacity: 0.5, anim: "swing", dur: 2.4 },
      { type: "emoji", emoji: "🧻", x: 50, y: 32, size: 30, anim: "rise", dur: 2 },
      { type: "emoji", emoji: "🦀", x: 36, y: 60, size: 30, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "🌞", x: 20, y: 22, size: 18, anim: "blink", delay: 0.6, dur: 1.6 },
    ],
  },
  crab_sunscreen: {
    v: 1,
    loop: 2.6,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 38, fill: "#fff9c4", opacity: 0.6, anim: "pulse", dur: 2.2 },
      { type: "emoji", emoji: "🧴", x: 30, y: 42, size: 26, anim: "blink", delay: 0.4, dur: 1.6 },
      { type: "emoji", emoji: "🦀", x: 60, y: 52, size: 32, anim: "wiggle", dur: 2 },
      { type: "emoji", emoji: "☀️", x: 50, y: 20, size: 20, anim: "blink", delay: 0.2, dur: 1 },
    ],
  },
  crab_umbrella: {
    v: 1,
    loop: 3.4,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, r: 42, fill: "#e1f5fe", opacity: 0.3, anim: "swing", dur: 3 },
      { type: "emoji", emoji: "☂️", x: 50, y: 18, size: 32, anim: "swing", dur: 2.2 },
      { type: "emoji", emoji: "🦀", x: 50, y: 54, size: 34, anim: "wave", dur: 2 },
      { type: "emoji", emoji: "🌧️", x: 24, y: 30, size: 16, anim: "float", delay: 0.8, dur: 1.8 },
      { type: "emoji", emoji: "🌧️", x: 76, y: 28, size: 16, anim: "float", delay: 1.2, dur: 2 },
    ],
  },
  crab_party_0_0: {
    v: 1,
    loop: 2.76,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff3e0", opacity: 0.31, anim: "float", dur: 2.78, w: 96.24, h: 22.4 },
      { type: "emoji", emoji: "🦀", x: 56, y: 53, size: 43, anim: "float", dur: 3.05 },
      { type: "emoji", emoji: "👷", x: 50, y: 15, size: 31, anim: "bounce", delay: 0.501, dur: 1.86 },
      { type: "emoji", emoji: "🍭", x: 73, y: 42, size: 26, anim: "blink", delay: 0.634, dur: 1.78 },
      { type: "emoji", emoji: "⭐", x: 60, y: 61, size: 22, anim: "pop", delay: 1.142, dur: 1.31 },
      { type: "emoji", emoji: "💫", x: 16, y: 63, size: 23, anim: "float", delay: 1.367, dur: 2.37 },
      { type: "emoji", emoji: "🍂", x: 71, y: 70, size: 14, anim: "pop", delay: 1.276, dur: 1.99 },
      { type: "emoji", emoji: "🌟", x: 76, y: 56, size: 18, anim: "blink", delay: 1.361, dur: 1.98 },
      { type: "emoji", emoji: "💫", x: 74, y: 64, size: 16, anim: "blink", delay: 1.663, dur: 1.14 }
    ],
  },
  crab_beach_0_1: {
    v: 1,
    loop: 2.73,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#81d4fa", opacity: 0.58, anim: "wave", dur: 1.56, w: 100.52, h: 25.16 },
      { type: "emoji", emoji: "🦀", x: 33, y: 49, size: 39, anim: "wave", dur: 1.75 },
      { type: "emoji", emoji: "🍩", x: 69, y: 40, size: 27, anim: "pop", delay: 0.663, dur: 1.59 },
      { type: "emoji", emoji: "💖", x: 19, y: 63, size: 14, anim: "float", delay: 0.539, dur: 2.39 },
      { type: "emoji", emoji: "⭐", x: 63, y: 12, size: 19, anim: "pop", delay: 0.439, dur: 1.6 },
      { type: "emoji", emoji: "✨", x: 74, y: 78, size: 14, anim: "blink", delay: 1.189, dur: 1.88 },
      { type: "emoji", emoji: "⭐", x: 20, y: 67, size: 14, anim: "blink", delay: 1.731, dur: 1.35 }
    ],
  },
  crab_winter_0_2: {
    v: 1,
    loop: 2.24,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f57c00", opacity: 0.3, anim: "bounce", dur: 1.53, r: 44.07 },
      { type: "emoji", emoji: "🦀", x: 51, y: 45, size: 39, anim: "bounce", dur: 1.52 },
      { type: "emoji", emoji: "🎩", x: 51, y: 13, size: 32, anim: "bounce", delay: 0.317, dur: 1.8 },
      { type: "emoji", emoji: "🍪", x: 70, y: 41, size: 25, anim: "rise", delay: 0.499, dur: 1.99 },
      { type: "emoji", emoji: "🍃", x: 70, y: 50, size: 15, anim: "rise", delay: 0.931, dur: 1.69 },
      { type: "emoji", emoji: "🔥", x: 44, y: 88, size: 13, anim: "rise", delay: 0.224, dur: 1.28 },
      { type: "emoji", emoji: "✨", x: 52, y: 48, size: 15, anim: "wiggle", delay: 1.312, dur: 2.19 },
      { type: "emoji", emoji: "⭐", x: 21, y: 83, size: 11, anim: "blink", delay: 0.808, dur: 1.94 },
      { type: "emoji", emoji: "💫", x: 62, y: 61, size: 19, anim: "blink", delay: 1.367, dur: 1.78 }
    ],
  },
  crab_spring_0_3: {
    v: 1,
    loop: 2.1,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#43a047", opacity: 0.58, anim: "wiggle", dur: 1.36, r: 47.21 },
      { type: "emoji", emoji: "🦀", x: 58, y: 50, size: 33, anim: "wiggle", dur: 1.38 },
      { type: "emoji", emoji: "🧣", x: 50, y: 59, size: 26, anim: "bounce", delay: 0.68, dur: 1.87 },
      { type: "emoji", emoji: "💌", x: 68, y: 39, size: 24, anim: "rise", delay: 0.448, dur: 1.48 },
      { type: "emoji", emoji: "❄️", x: 68, y: 29, size: 12, anim: "wiggle", delay: 1.432, dur: 1.6 },
      { type: "emoji", emoji: "🍂", x: 30, y: 25, size: 25, anim: "float", delay: 1.308, dur: 2.33 },
      { type: "emoji", emoji: "💫", x: 32, y: 75, size: 21, anim: "float", delay: 0.339, dur: 1.48 },
      { type: "emoji", emoji: "💖", x: 54, y: 66, size: 13, anim: "blink", delay: 0.957, dur: 1.31 },
      { type: "emoji", emoji: "🌟", x: 54, y: 29, size: 14, anim: "blink", delay: 0.927, dur: 1.64 }
    ],
  },
  crab_halloween_0_4: {
    v: 1,
    loop: 3.85,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 36, y: 51, size: 42, anim: "breathe", dur: 3.39 },
      { type: "emoji", emoji: "❄️", x: 14, y: 16, size: 12, anim: "blink", delay: 0.298, dur: 1.29 },
      { type: "emoji", emoji: "❄️", x: 40, y: 26, size: 14, anim: "blink", delay: 1.188, dur: 1.73 },
      { type: "emoji", emoji: "🌿", x: 72, y: 57, size: 12, anim: "rise", delay: 0.185, dur: 2.38 },
      { type: "emoji", emoji: "🔥", x: 54, y: 46, size: 23, anim: "pop", delay: 0.906, dur: 1.23 },
      { type: "emoji", emoji: "⭐", x: 28, y: 50, size: 21, anim: "float", delay: 0.226, dur: 1.95 },
      { type: "emoji", emoji: "✨", x: 16, y: 65, size: 10, anim: "blink", delay: 0.651, dur: 1.79 },
      { type: "emoji", emoji: "💖", x: 37, y: 23, size: 11, anim: "blink", delay: 1.892, dur: 1.61 }
    ],
  },
  crab_christmas_0_5: {
    v: 1,
    loop: 2.73,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ff5722", opacity: 0.58, anim: "pulse", dur: 2, r: 44.21 },
      { type: "emoji", emoji: "🦀", x: 44, y: 50, size: 34, anim: "pulse", dur: 1.89 },
      { type: "emoji", emoji: "🎓", x: 51, y: 14, size: 26, anim: "bounce", delay: 0.541, dur: 1.51 },
      { type: "emoji", emoji: "💖", x: 44, y: 78, size: 24, anim: "blink", delay: 0.68, dur: 1.63 },
      { type: "emoji", emoji: "✨", x: 83, y: 32, size: 24, anim: "float", delay: 0.615, dur: 1.37 },
      { type: "emoji", emoji: "💫", x: 20, y: 44, size: 12, anim: "blink", delay: 1.477, dur: 1.28 },
      { type: "emoji", emoji: "⭐", x: 79, y: 72, size: 10, anim: "blink", delay: 1.014, dur: 1.73 }
    ],
  },
  crab_coding_0_6: {
    v: 1,
    loop: 2.52,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#c2185b", opacity: 0.41, anim: "pulse", dur: 2.35, r: 40.23 },
      { type: "emoji", emoji: "🦀", x: 70, y: 46, size: 40, anim: "pulse", dur: 2.07 },
      { type: "emoji", emoji: "👑", x: 50, y: 14, size: 29, anim: "bounce", delay: 0.504, dur: 1.73 },
      { type: "emoji", emoji: "🍰", x: 65, y: 42, size: 27, anim: "float", delay: 0.743, dur: 1.62 },
      { type: "emoji", emoji: "💖", x: 34, y: 29, size: 16, anim: "float", delay: 0.806, dur: 2.25 },
      { type: "emoji", emoji: "🌊", x: 18, y: 37, size: 16, anim: "wiggle", delay: 0.091, dur: 1.83 },
      { type: "emoji", emoji: "⭐", x: 46, y: 64, size: 10, anim: "blink", delay: 1.998, dur: 1.49 },
      { type: "emoji", emoji: "✨", x: 63, y: 26, size: 11, anim: "blink", delay: 1.192, dur: 1.76 }
    ],
  },
  crab_music_0_7: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ba68c8", opacity: 0.35, anim: "float", dur: 2.61, r: 45.06 },
      { type: "emoji", emoji: "🦀", x: 41, y: 48, size: 40, anim: "float", dur: 2.84 },
      { type: "emoji", emoji: "👷", x: 51, y: 16, size: 31, anim: "bounce", delay: 0.547, dur: 1.5 },
      { type: "emoji", emoji: "⭐", x: 24, y: 53, size: 16, anim: "wiggle", delay: 0.672, dur: 1.2 },
      { type: "emoji", emoji: "💫", x: 88, y: 19, size: 22, anim: "blink", delay: 1.341, dur: 2.25 },
      { type: "emoji", emoji: "💖", x: 36, y: 16, size: 11, anim: "blink", delay: 1.246, dur: 1.03 },
      { type: "emoji", emoji: "💖", x: 15, y: 71, size: 15, anim: "blink", delay: 1.369, dur: 1.87 }
    ],
  },
  crab_sports_0_8: {
    v: 1,
    loop: 3.54,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fdd835", opacity: 0.66, anim: "settle", dur: 3.11, r: 42.81 },
      { type: "emoji", emoji: "🦀", x: 69, y: 52, size: 44, anim: "settle", dur: 3 },
      { type: "emoji", emoji: "👷", x: 49, y: 15, size: 31, anim: "bounce", delay: 0.411, dur: 1.83 },
      { type: "emoji", emoji: "🎉", x: 55, y: 74, size: 14, anim: "wiggle", delay: 1.492, dur: 2.39 },
      { type: "emoji", emoji: "✨", x: 71, y: 82, size: 20, anim: "rise", delay: 0.767, dur: 1.38 },
      { type: "emoji", emoji: "💖", x: 22, y: 68, size: 16, anim: "blink", delay: 0.974, dur: 1.32 },
      { type: "emoji", emoji: "🌟", x: 64, y: 35, size: 11, anim: "blink", delay: 0.618, dur: 1.86 }
    ],
  },
  crab_food_0_9: {
    v: 1,
    loop: 1.86,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 68, y: 56, size: 39, anim: "bounce", dur: 1.26 },
      { type: "emoji", emoji: "🔥", x: 64, y: 14, size: 16, anim: "blink", delay: 0.484, dur: 1.36 },
      { type: "emoji", emoji: "🎉", x: 64, y: 78, size: 23, anim: "rise", delay: 1.16, dur: 1.3 },
      { type: "emoji", emoji: "💖", x: 84, y: 57, size: 25, anim: "float", delay: 1.325, dur: 1.61 },
      { type: "emoji", emoji: "🌟", x: 63, y: 35, size: 14, anim: "blink", delay: 0.55, dur: 1.94 },
      { type: "emoji", emoji: "⭐", x: 18, y: 80, size: 10, anim: "blink", delay: 1.093, dur: 1.26 }
    ],
  },
  crab_space_0_10: {
    v: 1,
    loop: 2.79,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e6f7ff", opacity: 0.53, anim: "twinkle", dur: 2.7, r: 45.81 },
      { type: "emoji", emoji: "🦀", x: 50, y: 51, size: 43, anim: "twinkle", dur: 2.44 },
      { type: "emoji", emoji: "🎓", x: 49, y: 16, size: 27, anim: "bounce", delay: 0.628, dur: 1.91 },
      { type: "emoji", emoji: "🍰", x: 68, y: 43, size: 26, anim: "rise", delay: 0.821, dur: 1.42 },
      { type: "emoji", emoji: "🎉", x: 46, y: 34, size: 17, anim: "blink", delay: 0.253, dur: 2.25 },
      { type: "emoji", emoji: "🎊", x: 27, y: 79, size: 22, anim: "rise", delay: 1.386, dur: 2.38 },
      { type: "emoji", emoji: "⭐", x: 16, y: 65, size: 19, anim: "pop", delay: 0.535, dur: 1.37 },
      { type: "emoji", emoji: "🍃", x: 76, y: 69, size: 19, anim: "rise", delay: 1.074, dur: 1.68 },
      { type: "emoji", emoji: "💫", x: 66, y: 21, size: 12, anim: "blink", delay: 1.993, dur: 1.28 },
      { type: "emoji", emoji: "⭐", x: 39, y: 61, size: 11, anim: "blink", delay: 0.87, dur: 1.85 }
    ],
  },
  crab_fantasy_0_11: {
    v: 1,
    loop: 3.08,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#29b6f6", opacity: 0.67, anim: "float", dur: 3.17, w: 101.92, h: 18.17 },
      { type: "emoji", emoji: "🦀", x: 68, y: 54, size: 32, anim: "float", dur: 3.02 },
      { type: "emoji", emoji: "👒", x: 51, y: 13, size: 34, anim: "bounce", delay: 0.669, dur: 1.95 },
      { type: "emoji", emoji: "🍰", x: 71, y: 42, size: 28, anim: "rise", delay: 0.448, dur: 1.93 },
      { type: "emoji", emoji: "🌿", x: 53, y: 59, size: 24, anim: "pop", delay: 0.519, dur: 2.02 },
      { type: "emoji", emoji: "🌸", x: 54, y: 56, size: 16, anim: "blink", delay: 0.796, dur: 2.11 },
      { type: "emoji", emoji: "❄️", x: 64, y: 27, size: 17, anim: "blink", delay: 0.765, dur: 1.33 },
      { type: "emoji", emoji: "💖", x: 82, y: 76, size: 10, anim: "blink", delay: 1.813, dur: 1.97 },
      { type: "emoji", emoji: "💫", x: 76, y: 52, size: 10, anim: "blink", delay: 1.551, dur: 1.25 }
    ],
  },
  crab_office_0_12: {
    v: 1,
    loop: 2.44,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 58, y: 53, size: 34, anim: "pop", dur: 1.7 },
      { type: "emoji", emoji: "🍰", x: 71, y: 38, size: 27, anim: "blink", delay: 0.914, dur: 1.5 },
      { type: "emoji", emoji: "🌊", x: 75, y: 29, size: 18, anim: "pop", delay: 1.304, dur: 2.3 },
      { type: "emoji", emoji: "🍂", x: 67, y: 37, size: 21, anim: "wiggle", delay: 0.835, dur: 2.33 },
      { type: "emoji", emoji: "✨", x: 66, y: 29, size: 11, anim: "blink", delay: 0.557, dur: 1.96 },
      { type: "emoji", emoji: "🌟", x: 70, y: 49, size: 16, anim: "blink", delay: 1.178, dur: 1.65 }
    ],
  },
  crab_fitness_0_13: {
    v: 1,
    loop: 3.1,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#4caf50", opacity: 0.7, anim: "heartbeat", dur: 2.26, r: 46.14 },
      { type: "emoji", emoji: "🦀", x: 69, y: 45, size: 40, anim: "heartbeat", dur: 2.41 },
      { type: "emoji", emoji: "🪖", x: 50, y: 17, size: 28, anim: "bounce", delay: 0.351, dur: 1.6 },
      { type: "emoji", emoji: "🍪", x: 71, y: 46, size: 22, anim: "rise", delay: 0.921, dur: 1.42 },
      { type: "emoji", emoji: "🌿", x: 62, y: 65, size: 12, anim: "wiggle", delay: 0.148, dur: 2.37 },
      { type: "emoji", emoji: "🎉", x: 53, y: 48, size: 12, anim: "wiggle", delay: 1.387, dur: 1.78 },
      { type: "emoji", emoji: "🎉", x: 29, y: 85, size: 15, anim: "rise", delay: 0.094, dur: 1.76 },
      { type: "emoji", emoji: "✨", x: 43, y: 84, size: 11, anim: "blink", delay: 1.631, dur: 1.98 },
      { type: "emoji", emoji: "🌟", x: 69, y: 79, size: 16, anim: "blink", delay: 0.525, dur: 1.06 }
    ],
  },
  crab_travel_0_14: {
    v: 1,
    loop: 3.96,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#d1c4e9", opacity: 0.62, anim: "float", dur: 3.67, w: 97.51, h: 22.25 },
      { type: "emoji", emoji: "🦀", x: 38, y: 46, size: 44, anim: "float", dur: 3.47 },
      { type: "emoji", emoji: "👮", x: 51, y: 17, size: 29, anim: "bounce", delay: 0.373, dur: 1.72 },
      { type: "emoji", emoji: "🎉", x: 53, y: 69, size: 19, anim: "wiggle", delay: 0.302, dur: 2 },
      { type: "emoji", emoji: "✨", x: 84, y: 40, size: 14, anim: "blink", delay: 1.593, dur: 1.46 },
      { type: "emoji", emoji: "🌟", x: 44, y: 20, size: 13, anim: "blink", delay: 0.881, dur: 1.51 }
    ],
  },
  crab_art_0_15: {
    v: 1,
    loop: 2.77,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 36, y: 45, size: 38, anim: "float", dur: 2.95 },
      { type: "emoji", emoji: "🎩", x: 50, y: 10, size: 32, anim: "bounce", delay: 0.359, dur: 1.5 },
      { type: "emoji", emoji: "🍭", x: 72, y: 42, size: 25, anim: "float", delay: 0.63, dur: 1.46 },
      { type: "emoji", emoji: "🌸", x: 42, y: 70, size: 18, anim: "pop", delay: 0.921, dur: 2.15 },
      { type: "emoji", emoji: "🌟", x: 80, y: 14, size: 25, anim: "float", delay: 1.088, dur: 2.1 },
      { type: "emoji", emoji: "💫", x: 34, y: 66, size: 10, anim: "blink", delay: 1.947, dur: 1.56 },
      { type: "emoji", emoji: "⭐", x: 36, y: 48, size: 14, anim: "blink", delay: 1.935, dur: 1.1 }
    ],
  },
  crab_science_0_16: {
    v: 1,
    loop: 2.31,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fce4ec", opacity: 0.6, anim: "wave", dur: 1.74, w: 100.06, h: 23.51 },
      { type: "emoji", emoji: "🦀", x: 63, y: 51, size: 37, anim: "wave", dur: 1.88 },
      { type: "emoji", emoji: "🍫", x: 68, y: 42, size: 25, anim: "rise", delay: 0.611, dur: 1.73 },
      { type: "emoji", emoji: "🌟", x: 70, y: 35, size: 14, anim: "blink", delay: 0.314, dur: 1.48 },
      { type: "emoji", emoji: "🌟", x: 30, y: 40, size: 25, anim: "rise", delay: 0.162, dur: 2.38 },
      { type: "emoji", emoji: "🌸", x: 74, y: 49, size: 24, anim: "rise", delay: 1.157, dur: 1.43 },
      { type: "emoji", emoji: "❤️", x: 53, y: 32, size: 18, anim: "float", delay: 0.395, dur: 1.48 },
      { type: "emoji", emoji: "✨", x: 22, y: 28, size: 14, anim: "blink", delay: 0.861, dur: 1.87 },
      { type: "emoji", emoji: "⭐", x: 53, y: 55, size: 14, anim: "blink", delay: 1.08, dur: 1.87 }
    ],
  },
  crab_pets_0_17: {
    v: 1,
    loop: 1.95,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ab47bc", opacity: 0.61, anim: "bounce", dur: 1.57, r: 44.54 },
      { type: "emoji", emoji: "🦀", x: 55, y: 54, size: 35, anim: "bounce", dur: 1.39 },
      { type: "emoji", emoji: "👒", x: 49, y: 15, size: 34, anim: "bounce", delay: 0.527, dur: 1.56 },
      { type: "emoji", emoji: "⭐", x: 68, y: 32, size: 23, anim: "float", delay: 0.528, dur: 1.83 },
      { type: "emoji", emoji: "🌊", x: 24, y: 42, size: 17, anim: "rise", delay: 0.867, dur: 1.7 },
      { type: "emoji", emoji: "🎊", x: 31, y: 15, size: 24, anim: "wiggle", delay: 0.461, dur: 2.29 },
      { type: "emoji", emoji: "🌊", x: 28, y: 53, size: 20, anim: "wiggle", delay: 1.245, dur: 1.21 },
      { type: "emoji", emoji: "🍃", x: 61, y: 60, size: 12, anim: "blink", delay: 0.123, dur: 1.93 },
      { type: "emoji", emoji: "💫", x: 21, y: 21, size: 12, anim: "blink", delay: 1.35, dur: 1.47 },
      { type: "emoji", emoji: "⭐", x: 69, y: 38, size: 10, anim: "blink", delay: 1.754, dur: 1.05 }
    ],
  },
  crab_magic_0_18: {
    v: 1,
    loop: 2.25,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fffde7", opacity: 0.45, anim: "wiggle", dur: 1.51, r: 44.64 },
      { type: "emoji", emoji: "🦀", x: 48, y: 45, size: 44, anim: "wiggle", dur: 1.48 },
      { type: "emoji", emoji: "🌟", x: 72, y: 28, size: 24, anim: "blink", delay: 0.663, dur: 1.98 },
      { type: "emoji", emoji: "🔥", x: 18, y: 23, size: 21, anim: "pop", delay: 0.616, dur: 1.76 },
      { type: "emoji", emoji: "❄️", x: 47, y: 41, size: 21, anim: "wiggle", delay: 1.208, dur: 1.73 },
      { type: "emoji", emoji: "⭐", x: 35, y: 33, size: 15, anim: "blink", delay: 1.644, dur: 1.43 },
      { type: "emoji", emoji: "💖", x: 80, y: 60, size: 18, anim: "blink", delay: 1.535, dur: 1.29 }
    ],
  },
  crab_retro_0_19: {
    v: 1,
    loop: 3.88,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#c5cae9", opacity: 0.47, anim: "breathe", dur: 3.53, r: 41.96 },
      { type: "emoji", emoji: "🦀", x: 48, y: 56, size: 41, anim: "breathe", dur: 3.53 },
      { type: "emoji", emoji: "🎓", x: 52, y: 14, size: 28, anim: "bounce", delay: 0.334, dur: 1.56 },
      { type: "emoji", emoji: "🍀", x: 71, y: 43, size: 25, anim: "blink", delay: 0.858, dur: 1.59 },
      { type: "emoji", emoji: "🎉", x: 23, y: 15, size: 21, anim: "rise", delay: 0.245, dur: 2.26 },
      { type: "emoji", emoji: "🔥", x: 83, y: 23, size: 14, anim: "blink", delay: 0.115, dur: 2.26 },
      { type: "emoji", emoji: "🌊", x: 61, y: 58, size: 17, anim: "pop", delay: 0.326, dur: 1.65 },
      { type: "emoji", emoji: "✨", x: 20, y: 29, size: 14, anim: "blink", delay: 1.107, dur: 1.15 },
      { type: "emoji", emoji: "💖", x: 15, y: 84, size: 16, anim: "blink", delay: 1.08, dur: 1.88 }
    ],
  },
  crab_cyber_0_20: {
    v: 1,
    loop: 2.71,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff0f6", opacity: 0.64, anim: "pulse", dur: 1.81, w: 103.3, h: 21.72 },
      { type: "emoji", emoji: "🦀", x: 39, y: 46, size: 43, anim: "pulse", dur: 1.89 },
      { type: "emoji", emoji: "🍳", x: 49, y: 15, size: 27, anim: "bounce", delay: 0.659, dur: 1.71 },
      { type: "emoji", emoji: "🌸", x: 79, y: 16, size: 12, anim: "float", delay: 0.677, dur: 1.22 },
      { type: "emoji", emoji: "❤️", x: 16, y: 48, size: 15, anim: "wiggle", delay: 0.446, dur: 2.22 },
      { type: "emoji", emoji: "🌊", x: 65, y: 18, size: 21, anim: "blink", delay: 0.241, dur: 1.38 },
      { type: "emoji", emoji: "❄️", x: 76, y: 66, size: 13, anim: "blink", delay: 0.61, dur: 1.27 },
      { type: "emoji", emoji: "⭐", x: 16, y: 55, size: 19, anim: "blink", delay: 1.743, dur: 1.01 },
      { type: "emoji", emoji: "💖", x: 77, y: 59, size: 13, anim: "blink", delay: 1.728, dur: 1.1 }
    ],
  },
  crab_nature_0_21: {
    v: 1,
    loop: 2.28,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 46, y: 47, size: 40, anim: "pulse", dur: 2.22 },
      { type: "emoji", emoji: "🌻", x: 67, y: 40, size: 27, anim: "float", delay: 0.63, dur: 1.82 },
      { type: "emoji", emoji: "💖", x: 73, y: 25, size: 14, anim: "blink", delay: 0.575, dur: 1.88 },
      { type: "emoji", emoji: "❤️", x: 49, y: 85, size: 12, anim: "float", delay: 1.065, dur: 1.71 },
      { type: "emoji", emoji: "✨", x: 66, y: 60, size: 19, anim: "blink", delay: 1.472, dur: 1.07 },
      { type: "emoji", emoji: "⭐", x: 69, y: 74, size: 17, anim: "blink", delay: 1.521, dur: 1.56 }
    ],
  },
  crab_underwater_0_22: {
    v: 1,
    loop: 2.86,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffb74d", opacity: 0.42, anim: "float", dur: 3, w: 99.89, h: 21.73 },
      { type: "emoji", emoji: "🦀", x: 61, y: 46, size: 42, anim: "float", dur: 2.66 },
      { type: "emoji", emoji: "🎩", x: 52, y: 12, size: 33, anim: "bounce", delay: 0.483, dur: 1.97 },
      { type: "emoji", emoji: "🍀", x: 73, y: 47, size: 24, anim: "float", delay: 0.825, dur: 1.89 },
      { type: "emoji", emoji: "🌿", x: 83, y: 51, size: 12, anim: "float", delay: 0.675, dur: 1.29 },
      { type: "emoji", emoji: "⭐", x: 36, y: 82, size: 17, anim: "rise", delay: 1.159, dur: 1.41 },
      { type: "emoji", emoji: "🌸", x: 52, y: 27, size: 25, anim: "pop", delay: 0.23, dur: 2.33 },
      { type: "emoji", emoji: "🌸", x: 12, y: 13, size: 23, anim: "float", delay: 0.079, dur: 1.88 },
      { type: "emoji", emoji: "✨", x: 78, y: 72, size: 18, anim: "blink", delay: 1.234, dur: 1.18 },
      { type: "emoji", emoji: "✨", x: 30, y: 63, size: 10, anim: "blink", delay: 1.13, dur: 1.75 }
    ],
  },
  crab_sky_0_23: {
    v: 1,
    loop: 3.32,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#4caf50", opacity: 0.43, anim: "settle", dur: 2.9, r: 44.88 },
      { type: "emoji", emoji: "🦀", x: 39, y: 53, size: 44, anim: "settle", dur: 3.03 },
      { type: "emoji", emoji: "⭐", x: 20, y: 45, size: 16, anim: "float", delay: 1.497, dur: 1.95 },
      { type: "emoji", emoji: "✨", x: 19, y: 76, size: 22, anim: "float", delay: 0.243, dur: 1.63 },
      { type: "emoji", emoji: "🎉", x: 84, y: 83, size: 21, anim: "rise", delay: 0.768, dur: 1.58 },
      { type: "emoji", emoji: "🎉", x: 68, y: 18, size: 24, anim: "rise", delay: 0.652, dur: 1.81 },
      { type: "emoji", emoji: "🎈", x: 59, y: 71, size: 14, anim: "rise", delay: 1.056, dur: 2.27 },
      { type: "emoji", emoji: "🌟", x: 52, y: 67, size: 17, anim: "blink", delay: 0.787, dur: 1.22 },
      { type: "emoji", emoji: "✨", x: 61, y: 44, size: 17, anim: "blink", delay: 0.901, dur: 1.21 }
    ],
  },
  crab_party_1_24: {
    v: 1,
    loop: 1.95,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 41, y: 52, size: 35, anim: "bounce", dur: 1.43 },
      { type: "emoji", emoji: "👮", x: 50, y: 18, size: 29, anim: "bounce", delay: 0.585, dur: 1.93 },
      { type: "emoji", emoji: "🍭", x: 68, y: 38, size: 24, anim: "rise", delay: 0.5, dur: 1.73 },
      { type: "emoji", emoji: "🎊", x: 62, y: 82, size: 14, anim: "rise", delay: 0.619, dur: 1.58 },
      { type: "emoji", emoji: "❄️", x: 45, y: 49, size: 17, anim: "rise", delay: 1.309, dur: 1.89 },
      { type: "emoji", emoji: "💖", x: 49, y: 40, size: 13, anim: "blink", delay: 0.519, dur: 1.88 },
      { type: "emoji", emoji: "⭐", x: 45, y: 29, size: 19, anim: "blink", delay: 1.72, dur: 1.45 }
    ],
  },
  crab_beach_1_25: {
    v: 1,
    loop: 2.96,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 55, y: 50, size: 39, anim: "twinkle", dur: 2.58 },
      { type: "emoji", emoji: "🤠", x: 49, y: 14, size: 31, anim: "bounce", delay: 0.332, dur: 1.58 },
      { type: "emoji", emoji: "🍪", x: 73, y: 42, size: 22, anim: "blink", delay: 0.67, dur: 1.64 },
      { type: "emoji", emoji: "🌿", x: 78, y: 52, size: 14, anim: "blink", delay: 0.661, dur: 1.71 },
      { type: "emoji", emoji: "🎈", x: 41, y: 78, size: 13, anim: "rise", delay: 0.828, dur: 1.28 },
      { type: "emoji", emoji: "⭐", x: 23, y: 53, size: 16, anim: "blink", delay: 1.411, dur: 1.59 },
      { type: "emoji", emoji: "💫", x: 60, y: 49, size: 19, anim: "blink", delay: 1.499, dur: 1.02 }
    ],
  },
  crab_winter_1_26: {
    v: 1,
    loop: 3.27,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fce4ec", opacity: 0.32, anim: "float", dur: 2.96, w: 104.8, h: 21.75 },
      { type: "emoji", emoji: "🦀", x: 68, y: 48, size: 37, anim: "float", dur: 2.94 },
      { type: "emoji", emoji: "🪖", x: 52, y: 17, size: 29, anim: "bounce", delay: 0.391, dur: 1.9 },
      { type: "emoji", emoji: "🌻", x: 67, y: 42, size: 27, anim: "blink", delay: 0.974, dur: 1.72 },
      { type: "emoji", emoji: "🌿", x: 51, y: 18, size: 17, anim: "wiggle", delay: 1.262, dur: 1.94 },
      { type: "emoji", emoji: "🎈", x: 29, y: 28, size: 19, anim: "rise", delay: 1.129, dur: 1.88 },
      { type: "emoji", emoji: "🌟", x: 58, y: 28, size: 20, anim: "float", delay: 1.061, dur: 1.28 },
      { type: "emoji", emoji: "🎊", x: 78, y: 55, size: 18, anim: "pop", delay: 0.918, dur: 2.3 },
      { type: "emoji", emoji: "🌊", x: 32, y: 89, size: 17, anim: "float", delay: 1.486, dur: 1.9 },
      { type: "emoji", emoji: "🌟", x: 34, y: 25, size: 16, anim: "blink", delay: 1.474, dur: 1.02 },
      { type: "emoji", emoji: "✨", x: 76, y: 41, size: 19, anim: "blink", delay: 0.697, dur: 1.57 }
    ],
  },
  crab_spring_1_27: {
    v: 1,
    loop: 2.41,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ba68c8", opacity: 0.4, anim: "pop", dur: 1.38, w: 93.56, h: 20.35 },
      { type: "emoji", emoji: "🦀", x: 32, y: 48, size: 43, anim: "pop", dur: 1.66 },
      { type: "emoji", emoji: "🍩", x: 68, y: 39, size: 25, anim: "blink", delay: 0.562, dur: 1.93 },
      { type: "emoji", emoji: "💖", x: 76, y: 85, size: 24, anim: "rise", delay: 0.987, dur: 2.17 },
      { type: "emoji", emoji: "🎉", x: 75, y: 49, size: 18, anim: "pop", delay: 0.23, dur: 1.85 },
      { type: "emoji", emoji: "💖", x: 74, y: 55, size: 12, anim: "blink", delay: 0.066, dur: 1.91 },
      { type: "emoji", emoji: "🌸", x: 21, y: 28, size: 22, anim: "pop", delay: 0.221, dur: 1.29 },
      { type: "emoji", emoji: "⭐", x: 67, y: 28, size: 15, anim: "blink", delay: 1.195, dur: 1.97 },
      { type: "emoji", emoji: "✨", x: 38, y: 73, size: 19, anim: "blink", delay: 1.431, dur: 1.55 }
    ],
  },
  crab_halloween_1_28: {
    v: 1,
    loop: 2.77,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 59, y: 55, size: 36, anim: "heartbeat", dur: 2.5 },
      { type: "emoji", emoji: "👑", x: 49, y: 15, size: 31, anim: "bounce", delay: 0.505, dur: 1.79 },
      { type: "emoji", emoji: "🍃", x: 88, y: 68, size: 15, anim: "pop", delay: 1.402, dur: 1.53 },
      { type: "emoji", emoji: "🍂", x: 82, y: 32, size: 18, anim: "wiggle", delay: 0.497, dur: 1.55 },
      { type: "emoji", emoji: "🍂", x: 21, y: 57, size: 13, anim: "rise", delay: 0.704, dur: 2.27 },
      { type: "emoji", emoji: "❤️", x: 81, y: 71, size: 25, anim: "rise", delay: 0.808, dur: 1.68 },
      { type: "emoji", emoji: "⭐", x: 56, y: 28, size: 10, anim: "blink", delay: 1.718, dur: 1.98 },
      { type: "emoji", emoji: "✨", x: 60, y: 36, size: 12, anim: "blink", delay: 1.744, dur: 1.72 }
    ],
  },
  crab_christmas_1_29: {
    v: 1,
    loop: 4.12,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 32, y: 53, size: 42, anim: "float", dur: 3.44 },
      { type: "emoji", emoji: "🎓", x: 51, y: 14, size: 26, anim: "bounce", delay: 0.483, dur: 1.6 },
      { type: "emoji", emoji: "🎀", x: 70, y: 30, size: 19, anim: "pop", delay: 0.453, dur: 1.6 },
      { type: "emoji", emoji: "🔥", x: 35, y: 13, size: 15, anim: "wiggle", delay: 0.518, dur: 2.1 },
      { type: "emoji", emoji: "🍂", x: 74, y: 13, size: 23, anim: "blink", delay: 0.083, dur: 1.26 },
      { type: "emoji", emoji: "🌟", x: 55, y: 33, size: 17, anim: "blink", delay: 0.617, dur: 1.36 },
      { type: "emoji", emoji: "🌟", x: 40, y: 62, size: 19, anim: "blink", delay: 1.333, dur: 1.89 }
    ],
  },
  crab_coding_1_30: {
    v: 1,
    loop: 2.89,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#f3e5f5", opacity: 0.6, anim: "float", dur: 2.91, r: 45.52 },
      { type: "emoji", emoji: "🦀", x: 50, y: 51, size: 41, anim: "float", dur: 3.08 },
      { type: "emoji", emoji: "👒", x: 50, y: 14, size: 35, anim: "bounce", delay: 0.653, dur: 1.82 },
      { type: "emoji", emoji: "🍪", x: 73, y: 42, size: 23, anim: "rise", delay: 0.446, dur: 1.59 },
      { type: "emoji", emoji: "❤️", x: 78, y: 87, size: 23, anim: "float", delay: 0.188, dur: 1.33 },
      { type: "emoji", emoji: "✨", x: 69, y: 15, size: 15, anim: "rise", delay: 0.823, dur: 2.03 },
      { type: "emoji", emoji: "🌟", x: 20, y: 82, size: 17, anim: "blink", delay: 1.952, dur: 1.54 },
      { type: "emoji", emoji: "💫", x: 66, y: 44, size: 16, anim: "blink", delay: 1.842, dur: 1.33 }
    ],
  },
  crab_music_1_31: {
    v: 1,
    loop: 2.35,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#e1f5fe", opacity: 0.38, anim: "wave", dur: 1.79, w: 100.97, h: 26.58 },
      { type: "emoji", emoji: "🦀", x: 69, y: 52, size: 40, anim: "wave", dur: 1.8 },
      { type: "emoji", emoji: "🍬", x: 70, y: 43, size: 22, anim: "float", delay: 0.454, dur: 1.55 },
      { type: "emoji", emoji: "🎊", x: 49, y: 24, size: 22, anim: "float", delay: 0.963, dur: 1.96 },
      { type: "emoji", emoji: "🎊", x: 61, y: 13, size: 25, anim: "blink", delay: 1.027, dur: 1.3 },
      { type: "emoji", emoji: "🌿", x: 71, y: 58, size: 12, anim: "pop", delay: 1.397, dur: 2.02 },
      { type: "emoji", emoji: "💖", x: 18, y: 57, size: 18, anim: "blink", delay: 1.301, dur: 1.19 },
      { type: "emoji", emoji: "🌟", x: 74, y: 66, size: 15, anim: "blink", delay: 1.927, dur: 1.79 }
    ],
  },
  crab_sports_1_32: {
    v: 1,
    loop: 1.97,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff3e0", opacity: 0.61, anim: "bounce", dur: 1.51, w: 96.86, h: 27.73 },
      { type: "emoji", emoji: "🦀", x: 54, y: 49, size: 40, anim: "bounce", dur: 1.55 },
      { type: "emoji", emoji: "👷", x: 52, y: 18, size: 31, anim: "bounce", delay: 0.564, dur: 1.53 },
      { type: "emoji", emoji: "🌿", x: 66, y: 68, size: 24, anim: "rise", delay: 1.259, dur: 1.93 },
      { type: "emoji", emoji: "🌸", x: 59, y: 71, size: 17, anim: "rise", delay: 0.492, dur: 1.87 },
      { type: "emoji", emoji: "🔥", x: 64, y: 73, size: 20, anim: "wiggle", delay: 1.028, dur: 1.36 },
      { type: "emoji", emoji: "⭐", x: 33, y: 17, size: 15, anim: "blink", delay: 1.489, dur: 1.37 },
      { type: "emoji", emoji: "💖", x: 18, y: 78, size: 19, anim: "blink", delay: 0.521, dur: 1.85 }
    ],
  },
  crab_food_1_33: {
    v: 1,
    loop: 2.35,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 43, y: 52, size: 43, anim: "wiggle", dur: 1.51 },
      { type: "emoji", emoji: "🍬", x: 74, y: 43, size: 20, anim: "float", delay: 0.748, dur: 1.73 },
      { type: "emoji", emoji: "💖", x: 45, y: 11, size: 23, anim: "blink", delay: 0.2, dur: 2.08 },
      { type: "emoji", emoji: "🔥", x: 45, y: 52, size: 16, anim: "rise", delay: 0.51, dur: 2.14 },
      { type: "emoji", emoji: "🎈", x: 70, y: 84, size: 22, anim: "blink", delay: 0.809, dur: 2.31 },
      { type: "emoji", emoji: "🍂", x: 70, y: 74, size: 20, anim: "wiggle", delay: 0.711, dur: 1.34 },
      { type: "emoji", emoji: "💖", x: 57, y: 14, size: 14, anim: "pop", delay: 0.111, dur: 1.57 },
      { type: "emoji", emoji: "⭐", x: 59, y: 76, size: 17, anim: "blink", delay: 0.797, dur: 1.41 },
      { type: "emoji", emoji: "✨", x: 69, y: 28, size: 18, anim: "blink", delay: 1.298, dur: 1.47 }
    ],
  },
  crab_space_1_34: {
    v: 1,
    loop: 4.21,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 45, y: 48, size: 42, anim: "breathe", dur: 3.53 },
      { type: "emoji", emoji: "👒", x: 50, y: 14, size: 34, anim: "bounce", delay: 0.437, dur: 1.68 },
      { type: "emoji", emoji: "🍩", x: 72, y: 41, size: 25, anim: "pop", delay: 0.857, dur: 1.79 },
      { type: "emoji", emoji: "🎊", x: 57, y: 35, size: 18, anim: "pop", delay: 1.313, dur: 2.03 },
      { type: "emoji", emoji: "🔥", x: 52, y: 84, size: 21, anim: "blink", delay: 1.248, dur: 1.45 },
      { type: "emoji", emoji: "💫", x: 17, y: 72, size: 22, anim: "pop", delay: 0.229, dur: 2.08 },
      { type: "emoji", emoji: "💫", x: 20, y: 71, size: 17, anim: "blink", delay: 1.173, dur: 1.23 },
      { type: "emoji", emoji: "🌟", x: 57, y: 33, size: 13, anim: "blink", delay: 1.677, dur: 1.49 }
    ],
  },
  crab_fantasy_1_35: {
    v: 1,
    loop: 2.84,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffab91", opacity: 0.41, anim: "pulse", dur: 1.95, r: 48.58 },
      { type: "emoji", emoji: "🦀", x: 51, y: 52, size: 32, anim: "pulse", dur: 2.09 },
      { type: "emoji", emoji: "🍦", x: 69, y: 43, size: 27, anim: "blink", delay: 0.664, dur: 1.72 },
      { type: "emoji", emoji: "⭐", x: 47, y: 71, size: 17, anim: "pop", delay: 0.011, dur: 1.58 },
      { type: "emoji", emoji: "🌊", x: 81, y: 67, size: 12, anim: "rise", delay: 1.008, dur: 1.24 },
      { type: "emoji", emoji: "❤️", x: 84, y: 63, size: 13, anim: "blink", delay: 0.13, dur: 1.33 },
      { type: "emoji", emoji: "✨", x: 56, y: 44, size: 11, anim: "blink", delay: 1.268, dur: 1.72 },
      { type: "emoji", emoji: "💫", x: 72, y: 36, size: 14, anim: "blink", delay: 0.976, dur: 1.38 }
    ],
  },
  crab_office_1_36: {
    v: 1,
    loop: 2.4,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#f48fb1", opacity: 0.42, anim: "pulse", dur: 1.98, r: 41.87 },
      { type: "emoji", emoji: "🦀", x: 36, y: 55, size: 39, anim: "pulse", dur: 2.29 },
      { type: "emoji", emoji: "🧙", x: 50, y: 11, size: 33, anim: "bounce", delay: 0.438, dur: 1.52 },
      { type: "emoji", emoji: "🍩", x: 69, y: 42, size: 27, anim: "float", delay: 0.709, dur: 2 },
      { type: "emoji", emoji: "🎊", x: 19, y: 20, size: 16, anim: "float", delay: 0.733, dur: 1.48 },
      { type: "emoji", emoji: "🍂", x: 63, y: 44, size: 17, anim: "pop", delay: 0.446, dur: 1.34 },
      { type: "emoji", emoji: "❤️", x: 73, y: 50, size: 14, anim: "blink", delay: 0.41, dur: 1.31 },
      { type: "emoji", emoji: "🍂", x: 21, y: 21, size: 25, anim: "rise", delay: 1.376, dur: 2.23 },
      { type: "emoji", emoji: "⭐", x: 19, y: 22, size: 16, anim: "blink", delay: 0.686, dur: 1.79 },
      { type: "emoji", emoji: "⭐", x: 44, y: 77, size: 17, anim: "blink", delay: 1.1, dur: 1.52 }
    ],
  },
  crab_fitness_1_37: {
    v: 1,
    loop: 3.08,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 68, y: 54, size: 35, anim: "float", dur: 2.69 },
      { type: "emoji", emoji: "💫", x: 13, y: 56, size: 14, anim: "blink", delay: 0.118, dur: 1.7 },
      { type: "emoji", emoji: "🎉", x: 20, y: 79, size: 19, anim: "blink", delay: 0.479, dur: 1.81 },
      { type: "emoji", emoji: "❤️", x: 52, y: 85, size: 13, anim: "rise", delay: 0.607, dur: 1.99 },
      { type: "emoji", emoji: "✨", x: 25, y: 58, size: 18, anim: "blink", delay: 1.284, dur: 1.52 },
      { type: "emoji", emoji: "🌟", x: 35, y: 32, size: 18, anim: "blink", delay: 1.604, dur: 1.49 }
    ],
  },
  crab_travel_1_38: {
    v: 1,
    loop: 3.65,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 48, y: 56, size: 38, anim: "settle", dur: 3.11 },
      { type: "emoji", emoji: "🧣", x: 51, y: 57, size: 26, anim: "bounce", delay: 0.568, dur: 1.71 },
      { type: "emoji", emoji: "🎈", x: 19, y: 53, size: 20, anim: "rise", delay: 0.818, dur: 1.73 },
      { type: "emoji", emoji: "🌟", x: 19, y: 57, size: 15, anim: "rise", delay: 0.757, dur: 1.7 },
      { type: "emoji", emoji: "❄️", x: 61, y: 82, size: 21, anim: "float", delay: 1.348, dur: 1.7 },
      { type: "emoji", emoji: "🍃", x: 33, y: 39, size: 18, anim: "float", delay: 0.866, dur: 1.69 },
      { type: "emoji", emoji: "🌟", x: 35, y: 60, size: 24, anim: "rise", delay: 0.039, dur: 1.82 },
      { type: "emoji", emoji: "🌟", x: 73, y: 62, size: 17, anim: "blink", delay: 1.897, dur: 1.88 },
      { type: "emoji", emoji: "⭐", x: 42, y: 37, size: 10, anim: "blink", delay: 0.534, dur: 1.51 }
    ],
  },
  crab_art_1_39: {
    v: 1,
    loop: 1.95,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#3949ab", opacity: 0.4, anim: "bounce", dur: 1.23, r: 46.25 },
      { type: "emoji", emoji: "🦀", x: 38, y: 56, size: 43, anim: "bounce", dur: 1.41 },
      { type: "emoji", emoji: "👑", x: 52, y: 15, size: 32, anim: "bounce", delay: 0.667, dur: 1.86 },
      { type: "emoji", emoji: "🍪", x: 73, y: 43, size: 22, anim: "blink", delay: 0.531, dur: 1.56 },
      { type: "emoji", emoji: "🍃", x: 46, y: 43, size: 17, anim: "rise", delay: 0.185, dur: 1.98 },
      { type: "emoji", emoji: "🌟", x: 10, y: 23, size: 15, anim: "pop", delay: 0.148, dur: 1.77 },
      { type: "emoji", emoji: "🌟", x: 42, y: 20, size: 12, anim: "blink", delay: 0.516, dur: 1.58 },
      { type: "emoji", emoji: "💫", x: 44, y: 29, size: 15, anim: "blink", delay: 1.972, dur: 1.62 }
    ],
  },
  crab_science_1_40: {
    v: 1,
    loop: 2.83,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff3e0", opacity: 0.35, anim: "twinkle", dur: 2.51, w: 97.03, h: 23.67 },
      { type: "emoji", emoji: "🦀", x: 60, y: 45, size: 37, anim: "twinkle", dur: 2.58 },
      { type: "emoji", emoji: "👑", x: 48, y: 12, size: 32, anim: "bounce", delay: 0.439, dur: 1.99 },
      { type: "emoji", emoji: "🎁", x: 73, y: 40, size: 26, anim: "blink", delay: 0.993, dur: 1.97 },
      { type: "emoji", emoji: "🌿", x: 32, y: 43, size: 19, anim: "blink", delay: 1.134, dur: 2.24 },
      { type: "emoji", emoji: "🔥", x: 80, y: 67, size: 19, anim: "pop", delay: 1.244, dur: 1.22 },
      { type: "emoji", emoji: "🌟", x: 49, y: 17, size: 10, anim: "blink", delay: 1.188, dur: 1.76 },
      { type: "emoji", emoji: "🌟", x: 39, y: 84, size: 14, anim: "blink", delay: 1.605, dur: 1.32 }
    ],
  },
  crab_pets_1_41: {
    v: 1,
    loop: 2.98,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 60, y: 54, size: 40, anim: "float", dur: 2.94 },
      { type: "emoji", emoji: "🧣", x: 49, y: 56, size: 24, anim: "bounce", delay: 0.592, dur: 1.79 },
      { type: "emoji", emoji: "🍬", x: 70, y: 43, size: 22, anim: "blink", delay: 0.87, dur: 1.78 },
      { type: "emoji", emoji: "💫", x: 10, y: 88, size: 16, anim: "float", delay: 0.068, dur: 2.1 },
      { type: "emoji", emoji: "🌊", x: 66, y: 61, size: 15, anim: "wiggle", delay: 0.607, dur: 1.29 },
      { type: "emoji", emoji: "🍂", x: 28, y: 41, size: 19, anim: "rise", delay: 1.425, dur: 1.6 },
      { type: "emoji", emoji: "🌿", x: 15, y: 30, size: 20, anim: "float", delay: 0.447, dur: 2.27 },
      { type: "emoji", emoji: "🌟", x: 44, y: 79, size: 11, anim: "blink", delay: 1.98, dur: 1.89 },
      { type: "emoji", emoji: "💖", x: 34, y: 24, size: 13, anim: "blink", delay: 0.731, dur: 1.63 }
    ],
  },
  crab_magic_1_42: {
    v: 1,
    loop: 2.14,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 58, y: 48, size: 35, anim: "pop", dur: 1.58 },
      { type: "emoji", emoji: "👷", x: 52, y: 15, size: 30, anim: "bounce", delay: 0.5, dur: 1.72 },
      { type: "emoji", emoji: "🍰", x: 67, y: 40, size: 26, anim: "blink", delay: 0.458, dur: 1.47 },
      { type: "emoji", emoji: "🌸", x: 52, y: 10, size: 18, anim: "float", delay: 1.12, dur: 1.36 },
      { type: "emoji", emoji: "💫", x: 66, y: 24, size: 24, anim: "rise", delay: 0.488, dur: 2.2 },
      { type: "emoji", emoji: "🍂", x: 49, y: 15, size: 21, anim: "pop", delay: 0.367, dur: 2.02 },
      { type: "emoji", emoji: "🔥", x: 62, y: 31, size: 12, anim: "float", delay: 0.585, dur: 1.72 },
      { type: "emoji", emoji: "🌟", x: 26, y: 67, size: 25, anim: "pop", delay: 1.36, dur: 1.35 },
      { type: "emoji", emoji: "✨", x: 31, y: 45, size: 14, anim: "blink", delay: 0.865, dur: 1.04 },
      { type: "emoji", emoji: "💖", x: 22, y: 51, size: 11, anim: "blink", delay: 1.081, dur: 1.34 }
    ],
  },
  crab_retro_1_43: {
    v: 1,
    loop: 2.84,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#66bb6a", opacity: 0.63, anim: "heartbeat", dur: 2.31, r: 40.93 },
      { type: "emoji", emoji: "🦀", x: 66, y: 49, size: 33, anim: "heartbeat", dur: 2.62 },
      { type: "emoji", emoji: "👑", x: 51, y: 15, size: 33, anim: "bounce", delay: 0.473, dur: 1.81 },
      { type: "emoji", emoji: "🌸", x: 73, y: 41, size: 25, anim: "float", delay: 0.5, dur: 1.45 },
      { type: "emoji", emoji: "💫", x: 38, y: 71, size: 14, anim: "blink", delay: 0.33, dur: 1.69 },
      { type: "emoji", emoji: "✨", x: 12, y: 47, size: 19, anim: "wiggle", delay: 1.207, dur: 1.9 },
      { type: "emoji", emoji: "❤️", x: 79, y: 87, size: 13, anim: "pop", delay: 1.32, dur: 2.36 },
      { type: "emoji", emoji: "💖", x: 23, y: 84, size: 12, anim: "blink", delay: 1.535, dur: 1.95 },
      { type: "emoji", emoji: "💫", x: 42, y: 30, size: 14, anim: "blink", delay: 0.822, dur: 1.99 }
    ],
  },
  crab_cyber_1_44: {
    v: 1,
    loop: 3.8,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#512da8", opacity: 0.62, anim: "float", dur: 3.44, w: 100.13, h: 25.25 },
      { type: "emoji", emoji: "🦀", x: 57, y: 47, size: 35, anim: "float", dur: 3.51 },
      { type: "emoji", emoji: "🍬", x: 75, y: 46, size: 21, anim: "rise", delay: 0.533, dur: 1.78 },
      { type: "emoji", emoji: "🎈", x: 23, y: 10, size: 16, anim: "blink", delay: 1.303, dur: 1.83 },
      { type: "emoji", emoji: "🌸", x: 64, y: 42, size: 16, anim: "wiggle", delay: 0.303, dur: 1.54 },
      { type: "emoji", emoji: "🍂", x: 69, y: 45, size: 16, anim: "rise", delay: 0.397, dur: 1.92 },
      { type: "emoji", emoji: "❤️", x: 15, y: 17, size: 20, anim: "pop", delay: 1.173, dur: 1.38 },
      { type: "emoji", emoji: "✨", x: 75, y: 76, size: 12, anim: "blink", delay: 1.316, dur: 2.18 },
      { type: "emoji", emoji: "💖", x: 37, y: 27, size: 15, anim: "blink", delay: 1.891, dur: 1.94 },
      { type: "emoji", emoji: "⭐", x: 75, y: 48, size: 10, anim: "blink", delay: 1.662, dur: 1.11 }
    ],
  },
  crab_nature_1_45: {
    v: 1,
    loop: 2.85,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f4511e", opacity: 0.57, anim: "float", dur: 3.22, r: 43.43 },
      { type: "emoji", emoji: "🦀", x: 56, y: 47, size: 34, anim: "float", dur: 3.06 },
      { type: "emoji", emoji: "🌟", x: 20, y: 41, size: 17, anim: "blink", delay: 0.812, dur: 1.4 },
      { type: "emoji", emoji: "💫", x: 56, y: 27, size: 20, anim: "pop", delay: 0.87, dur: 1.91 },
      { type: "emoji", emoji: "✨", x: 34, y: 64, size: 15, anim: "blink", delay: 1.634, dur: 1.02 },
      { type: "emoji", emoji: "⭐", x: 52, y: 40, size: 10, anim: "blink", delay: 1.028, dur: 1.1 }
    ],
  },
  crab_underwater_1_46: {
    v: 1,
    loop: 2.6,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fce4ec", opacity: 0.51, anim: "wave", dur: 1.8, r: 45.03 },
      { type: "emoji", emoji: "🦀", x: 42, y: 45, size: 44, anim: "wave", dur: 1.85 },
      { type: "emoji", emoji: "🍪", x: 71, y: 43, size: 25, anim: "float", delay: 0.783, dur: 1.63 },
      { type: "emoji", emoji: "🎉", x: 74, y: 66, size: 25, anim: "pop", delay: 0.074, dur: 1.22 },
      { type: "emoji", emoji: "💖", x: 20, y: 53, size: 25, anim: "float", delay: 0.955, dur: 1.34 },
      { type: "emoji", emoji: "🎉", x: 38, y: 31, size: 12, anim: "rise", delay: 0.732, dur: 1.9 },
      { type: "emoji", emoji: "💖", x: 31, y: 10, size: 22, anim: "float", delay: 0.044, dur: 1.39 },
      { type: "emoji", emoji: "⭐", x: 73, y: 37, size: 12, anim: "blink", delay: 0.641, dur: 1.41 },
      { type: "emoji", emoji: "💖", x: 54, y: 35, size: 10, anim: "blink", delay: 0.874, dur: 1.05 }
    ],
  },
  crab_sky_1_47: {
    v: 1,
    loop: 1.77,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ba68c8", opacity: 0.32, anim: "bounce", dur: 1.61, r: 48.79 },
      { type: "emoji", emoji: "🦀", x: 48, y: 49, size: 35, anim: "bounce", dur: 1.63 },
      { type: "emoji", emoji: "🕶️", x: 48, y: 29, size: 30, anim: "bounce", delay: 0.525, dur: 1.58 },
      { type: "emoji", emoji: "💝", x: 73, y: 40, size: 25, anim: "float", delay: 0.851, dur: 1.79 },
      { type: "emoji", emoji: "🌊", x: 19, y: 59, size: 14, anim: "blink", delay: 0.894, dur: 1.34 },
      { type: "emoji", emoji: "🌊", x: 85, y: 76, size: 25, anim: "blink", delay: 0.268, dur: 1.73 },
      { type: "emoji", emoji: "🎈", x: 46, y: 11, size: 17, anim: "pop", delay: 0.676, dur: 2.39 },
      { type: "emoji", emoji: "💖", x: 33, y: 80, size: 15, anim: "blink", delay: 1.697, dur: 1.61 },
      { type: "emoji", emoji: "⭐", x: 36, y: 25, size: 17, anim: "blink", delay: 1.626, dur: 1.43 }
    ],
  },
  crab_party_2_48: {
    v: 1,
    loop: 2.39,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 40, y: 51, size: 42, anim: "wiggle", dur: 1.33 },
      { type: "emoji", emoji: "🍦", x: 72, y: 43, size: 28, anim: "blink", delay: 0.555, dur: 1.81 },
      { type: "emoji", emoji: "🔥", x: 63, y: 67, size: 17, anim: "rise", delay: 1.054, dur: 1.39 },
      { type: "emoji", emoji: "🌿", x: 34, y: 44, size: 21, anim: "float", delay: 0.851, dur: 1.66 },
      { type: "emoji", emoji: "💖", x: 29, y: 59, size: 24, anim: "rise", delay: 0.957, dur: 2.4 },
      { type: "emoji", emoji: "💫", x: 61, y: 18, size: 14, anim: "blink", delay: 1.786, dur: 1.26 },
      { type: "emoji", emoji: "💖", x: 28, y: 78, size: 11, anim: "blink", delay: 1.039, dur: 1.3 }
    ],
  },
  crab_beach_2_49: {
    v: 1,
    loop: 4.16,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 43, y: 47, size: 43, anim: "breathe", dur: 3.53 },
      { type: "emoji", emoji: "🎩", x: 51, y: 10, size: 31, anim: "bounce", delay: 0.54, dur: 1.62 },
      { type: "emoji", emoji: "💌", x: 72, y: 43, size: 25, anim: "rise", delay: 0.699, dur: 1.66 },
      { type: "emoji", emoji: "💖", x: 61, y: 66, size: 24, anim: "wiggle", delay: 1.206, dur: 1.53 },
      { type: "emoji", emoji: "✨", x: 20, y: 60, size: 22, anim: "rise", delay: 0.157, dur: 2 },
      { type: "emoji", emoji: "💖", x: 64, y: 60, size: 24, anim: "blink", delay: 0.527, dur: 1.34 },
      { type: "emoji", emoji: "🌟", x: 20, y: 40, size: 10, anim: "blink", delay: 0.521, dur: 1.2 },
      { type: "emoji", emoji: "⭐", x: 37, y: 65, size: 16, anim: "blink", delay: 0.571, dur: 1.53 }
    ],
  },
  crab_winter_2_50: {
    v: 1,
    loop: 3.03,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ffe6e6", opacity: 0.61, anim: "pulse", dur: 1.8, r: 45.32 },
      { type: "emoji", emoji: "🦀", x: 35, y: 44, size: 40, anim: "pulse", dur: 1.85 },
      { type: "emoji", emoji: "🌟", x: 72, y: 27, size: 24, anim: "blink", delay: 0.417, dur: 1.85 },
      { type: "emoji", emoji: "🔥", x: 60, y: 32, size: 24, anim: "blink", delay: 0.692, dur: 2.16 },
      { type: "emoji", emoji: "🌸", x: 36, y: 70, size: 19, anim: "rise", delay: 0.463, dur: 1.47 },
      { type: "emoji", emoji: "🎊", x: 29, y: 23, size: 19, anim: "wiggle", delay: 1.045, dur: 1.54 },
      { type: "emoji", emoji: "💖", x: 88, y: 82, size: 20, anim: "pop", delay: 0.021, dur: 1.47 },
      { type: "emoji", emoji: "🌟", x: 56, y: 36, size: 17, anim: "blink", delay: 1.259, dur: 1.3 },
      { type: "emoji", emoji: "💫", x: 29, y: 73, size: 10, anim: "blink", delay: 1.534, dur: 1.56 }
    ],
  },
  crab_spring_2_51: {
    v: 1,
    loop: 2.45,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#039be5", opacity: 0.39, anim: "pulse", dur: 2.03, r: 48.17 },
      { type: "emoji", emoji: "🦀", x: 32, y: 53, size: 38, anim: "pulse", dur: 2.19 },
      { type: "emoji", emoji: "🎩", x: 51, y: 11, size: 31, anim: "bounce", delay: 0.678, dur: 1.67 },
      { type: "emoji", emoji: "🌸", x: 68, y: 39, size: 27, anim: "pop", delay: 0.567, dur: 1.45 },
      { type: "emoji", emoji: "❤️", x: 46, y: 38, size: 16, anim: "rise", delay: 0.864, dur: 1.82 },
      { type: "emoji", emoji: "🎉", x: 46, y: 78, size: 15, anim: "rise", delay: 1.264, dur: 2.26 },
      { type: "emoji", emoji: "💫", x: 30, y: 17, size: 13, anim: "blink", delay: 0.71, dur: 1.9 },
      { type: "emoji", emoji: "💖", x: 72, y: 67, size: 18, anim: "blink", delay: 1.818, dur: 1.84 }
    ],
  },
  crab_halloween_2_52: {
    v: 1,
    loop: 3.24,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#f57c00", opacity: 0.55, anim: "float", dur: 2.9, r: 47.19 },
      { type: "emoji", emoji: "🦀", x: 35, y: 54, size: 39, anim: "float", dur: 2.93 },
      { type: "emoji", emoji: "🌿", x: 43, y: 22, size: 16, anim: "blink", delay: 0.386, dur: 2.08 },
      { type: "emoji", emoji: "💫", x: 40, y: 24, size: 19, anim: "blink", delay: 0.571, dur: 2.14 },
      { type: "emoji", emoji: "💫", x: 48, y: 13, size: 16, anim: "float", delay: 1.403, dur: 1.42 },
      { type: "emoji", emoji: "🍃", x: 14, y: 18, size: 24, anim: "rise", delay: 0.418, dur: 2.18 },
      { type: "emoji", emoji: "🌟", x: 79, y: 52, size: 17, anim: "blink", delay: 1.655, dur: 1.63 },
      { type: "emoji", emoji: "🌟", x: 23, y: 81, size: 12, anim: "blink", delay: 0.83, dur: 1.14 }
    ],
  },
  crab_christmas_2_53: {
    v: 1,
    loop: 3.41,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#e8f5e9", opacity: 0.6, anim: "settle", dur: 2.89, w: 99.72, h: 25.14 },
      { type: "emoji", emoji: "🦀", x: 60, y: 54, size: 33, anim: "settle", dur: 2.9 },
      { type: "emoji", emoji: "🤠", x: 50, y: 14, size: 32, anim: "bounce", delay: 0.649, dur: 1.74 },
      { type: "emoji", emoji: "🍦", x: 71, y: 40, size: 28, anim: "blink", delay: 0.455, dur: 1.64 },
      { type: "emoji", emoji: "❄️", x: 88, y: 54, size: 16, anim: "float", delay: 1.241, dur: 1.66 },
      { type: "emoji", emoji: "🌸", x: 65, y: 61, size: 20, anim: "pop", delay: 0.408, dur: 1.59 },
      { type: "emoji", emoji: "❄️", x: 41, y: 84, size: 22, anim: "blink", delay: 1.06, dur: 1.81 },
      { type: "emoji", emoji: "✨", x: 14, y: 86, size: 15, anim: "wiggle", delay: 1.143, dur: 2.39 },
      { type: "emoji", emoji: "🌸", x: 87, y: 15, size: 23, anim: "blink", delay: 1.196, dur: 1.87 },
      { type: "emoji", emoji: "⭐", x: 64, y: 60, size: 11, anim: "blink", delay: 1.69, dur: 1.68 },
      { type: "emoji", emoji: "🌟", x: 71, y: 58, size: 16, anim: "blink", delay: 1.531, dur: 1.3 }
    ],
  },
  crab_coding_2_54: {
    v: 1,
    loop: 1.92,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#b39ddb", opacity: 0.64, anim: "bounce", dur: 1.54, w: 98.97, h: 19.47 },
      { type: "emoji", emoji: "🦀", x: 67, y: 47, size: 39, anim: "bounce", dur: 1.41 },
      { type: "emoji", emoji: "🕶️", x: 49, y: 28, size: 31, anim: "bounce", delay: 0.544, dur: 1.64 },
      { type: "emoji", emoji: "💝", x: 70, y: 40, size: 27, anim: "blink", delay: 0.858, dur: 1.96 },
      { type: "emoji", emoji: "🌿", x: 29, y: 35, size: 20, anim: "rise", delay: 1.326, dur: 1.6 },
      { type: "emoji", emoji: "💫", x: 57, y: 56, size: 22, anim: "rise", delay: 1.225, dur: 2.34 },
      { type: "emoji", emoji: "💫", x: 38, y: 22, size: 17, anim: "blink", delay: 1.999, dur: 1.94 },
      { type: "emoji", emoji: "💖", x: 65, y: 78, size: 11, anim: "blink", delay: 0.681, dur: 1.81 }
    ],
  },
  crab_music_2_55: {
    v: 1,
    loop: 3.1,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ff5722", opacity: 0.66, anim: "twinkle", dur: 2.49, w: 94.33, h: 18.35 },
      { type: "emoji", emoji: "🦀", x: 57, y: 47, size: 38, anim: "twinkle", dur: 2.47 },
      { type: "emoji", emoji: "🎀", x: 69, y: 28, size: 17, anim: "blink", delay: 0.431, dur: 1.77 },
      { type: "emoji", emoji: "🔥", x: 36, y: 49, size: 18, anim: "pop", delay: 0.408, dur: 1.67 },
      { type: "emoji", emoji: "🎉", x: 55, y: 41, size: 16, anim: "wiggle", delay: 0.106, dur: 1.71 },
      { type: "emoji", emoji: "🌊", x: 24, y: 67, size: 20, anim: "pop", delay: 1.381, dur: 1.74 },
      { type: "emoji", emoji: "🎊", x: 46, y: 52, size: 23, anim: "float", delay: 1.114, dur: 1.85 },
      { type: "emoji", emoji: "🌟", x: 31, y: 49, size: 17, anim: "blink", delay: 0.725, dur: 1.19 },
      { type: "emoji", emoji: "💖", x: 36, y: 72, size: 15, anim: "blink", delay: 0.902, dur: 1.83 }
    ],
  },
  crab_sports_2_56: {
    v: 1,
    loop: 3.18,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 45, y: 45, size: 41, anim: "float", dur: 3.11 },
      { type: "emoji", emoji: "🤠", x: 50, y: 14, size: 33, anim: "bounce", delay: 0.487, dur: 1.57 },
      { type: "emoji", emoji: "💫", x: 71, y: 43, size: 18, anim: "wiggle", delay: 0.816, dur: 2.23 },
      { type: "emoji", emoji: "💖", x: 53, y: 80, size: 24, anim: "rise", delay: 0.892, dur: 1.54 },
      { type: "emoji", emoji: "❤️", x: 68, y: 80, size: 14, anim: "float", delay: 0.408, dur: 1.94 },
      { type: "emoji", emoji: "⭐", x: 22, y: 78, size: 12, anim: "blink", delay: 0.856, dur: 1.84 },
      { type: "emoji", emoji: "✨", x: 37, y: 75, size: 19, anim: "blink", delay: 1.717, dur: 1.13 }
    ],
  },
  crab_food_2_57: {
    v: 1,
    loop: 2.01,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#9c27b0", opacity: 0.57, anim: "pop", dur: 1.62, w: 101.02, h: 24.82 },
      { type: "emoji", emoji: "🦀", x: 40, y: 46, size: 40, anim: "pop", dur: 1.54 },
      { type: "emoji", emoji: "👒", x: 50, y: 13, size: 35, anim: "bounce", delay: 0.416, dur: 1.56 },
      { type: "emoji", emoji: "🌸", x: 70, y: 40, size: 27, anim: "blink", delay: 0.622, dur: 1.86 },
      { type: "emoji", emoji: "🌟", x: 47, y: 37, size: 13, anim: "float", delay: 0.024, dur: 1.38 },
      { type: "emoji", emoji: "💖", x: 18, y: 10, size: 16, anim: "wiggle", delay: 0.089, dur: 1.33 },
      { type: "emoji", emoji: "💖", x: 14, y: 61, size: 15, anim: "blink", delay: 0.176, dur: 2.32 },
      { type: "emoji", emoji: "🌊", x: 27, y: 14, size: 13, anim: "wiggle", delay: 0.562, dur: 1.61 },
      { type: "emoji", emoji: "🔥", x: 67, y: 13, size: 14, anim: "pop", delay: 0.831, dur: 2.29 },
      { type: "emoji", emoji: "💫", x: 50, y: 61, size: 12, anim: "blink", delay: 1.341, dur: 1.92 },
      { type: "emoji", emoji: "💫", x: 68, y: 41, size: 14, anim: "blink", delay: 1.45, dur: 1.13 }
    ],
  },
  crab_space_2_58: {
    v: 1,
    loop: 3.15,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 37, y: 46, size: 36, anim: "heartbeat", dur: 2.39 },
      { type: "emoji", emoji: "🍭", x: 71, y: 40, size: 27, anim: "blink", delay: 0.403, dur: 1.58 },
      { type: "emoji", emoji: "🌿", x: 87, y: 14, size: 12, anim: "pop", delay: 1.184, dur: 1.4 },
      { type: "emoji", emoji: "🔥", x: 44, y: 17, size: 16, anim: "rise", delay: 0.857, dur: 1.54 },
      { type: "emoji", emoji: "🌟", x: 44, y: 59, size: 16, anim: "rise", delay: 0.757, dur: 1.36 },
      { type: "emoji", emoji: "🌿", x: 64, y: 37, size: 23, anim: "wiggle", delay: 0.782, dur: 1.71 },
      { type: "emoji", emoji: "💖", x: 42, y: 36, size: 12, anim: "blink", delay: 1.99, dur: 1.75 },
      { type: "emoji", emoji: "⭐", x: 69, y: 71, size: 19, anim: "blink", delay: 1.274, dur: 1.64 }
    ],
  },
  crab_fantasy_2_59: {
    v: 1,
    loop: 4.08,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 65, y: 45, size: 38, anim: "float", dur: 3.37 },
      { type: "emoji", emoji: "🍄", x: 71, y: 46, size: 26, anim: "pop", delay: 0.901, dur: 1.58 },
      { type: "emoji", emoji: "🎉", x: 75, y: 58, size: 17, anim: "pop", delay: 1.132, dur: 1.91 },
      { type: "emoji", emoji: "🎉", x: 41, y: 19, size: 22, anim: "float", delay: 1.214, dur: 1.57 },
      { type: "emoji", emoji: "💫", x: 71, y: 32, size: 10, anim: "blink", delay: 1.118, dur: 1.92 },
      { type: "emoji", emoji: "⭐", x: 68, y: 55, size: 12, anim: "blink", delay: 0.833, dur: 1.33 }
    ],
  },
  crab_office_2_60: {
    v: 1,
    loop: 3.1,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e1f5fe", opacity: 0.52, anim: "float", dur: 2.99, r: 42.68 },
      { type: "emoji", emoji: "🦀", x: 52, y: 55, size: 35, anim: "float", dur: 2.91 },
      { type: "emoji", emoji: "🤠", x: 52, y: 15, size: 32, anim: "bounce", delay: 0.309, dur: 1.6 },
      { type: "emoji", emoji: "💌", x: 69, y: 44, size: 24, anim: "pop", delay: 0.964, dur: 1.93 },
      { type: "emoji", emoji: "💖", x: 80, y: 75, size: 12, anim: "float", delay: 0.891, dur: 1.5 },
      { type: "emoji", emoji: "❄️", x: 23, y: 77, size: 22, anim: "wiggle", delay: 0.558, dur: 1.95 },
      { type: "emoji", emoji: "🍂", x: 38, y: 41, size: 12, anim: "wiggle", delay: 0.231, dur: 1.4 },
      { type: "emoji", emoji: "🌟", x: 57, y: 65, size: 16, anim: "blink", delay: 1.94, dur: 1.23 },
      { type: "emoji", emoji: "💖", x: 49, y: 19, size: 16, anim: "blink", delay: 0.571, dur: 1.3 }
    ],
  },
  crab_fitness_2_61: {
    v: 1,
    loop: 2.36,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#039be5", opacity: 0.47, anim: "wave", dur: 1.97, w: 109.2, h: 23.7 },
      { type: "emoji", emoji: "🦀", x: 31, y: 47, size: 35, anim: "wave", dur: 1.67 },
      { type: "emoji", emoji: "💫", x: 41, y: 23, size: 13, anim: "blink", delay: 1.331, dur: 2.15 },
      { type: "emoji", emoji: "🌸", x: 54, y: 34, size: 18, anim: "float", delay: 0.989, dur: 1.96 },
      { type: "emoji", emoji: "🌟", x: 37, y: 22, size: 17, anim: "blink", delay: 0.559, dur: 1.75 },
      { type: "emoji", emoji: "💖", x: 37, y: 64, size: 11, anim: "blink", delay: 1.439, dur: 1.96 }
    ],
  },
  crab_travel_2_62: {
    v: 1,
    loop: 2.19,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 30, y: 54, size: 43, anim: "bounce", dur: 1.38 },
      { type: "emoji", emoji: "🧢", x: 51, y: 16, size: 28, anim: "bounce", delay: 0.307, dur: 1.64 },
      { type: "emoji", emoji: "🍦", x: 69, y: 42, size: 29, anim: "pop", delay: 0.647, dur: 1.59 },
      { type: "emoji", emoji: "💖", x: 64, y: 10, size: 12, anim: "wiggle", delay: 0.216, dur: 1.44 },
      { type: "emoji", emoji: "❄️", x: 43, y: 63, size: 25, anim: "wiggle", delay: 1.221, dur: 1.82 },
      { type: "emoji", emoji: "❄️", x: 39, y: 37, size: 23, anim: "pop", delay: 0.526, dur: 1.7 },
      { type: "emoji", emoji: "🌊", x: 57, y: 84, size: 19, anim: "wiggle", delay: 0.067, dur: 1.31 },
      { type: "emoji", emoji: "💫", x: 81, y: 15, size: 10, anim: "blink", delay: 1.516, dur: 1.48 },
      { type: "emoji", emoji: "💫", x: 64, y: 57, size: 11, anim: "blink", delay: 0.748, dur: 1.37 }
    ],
  },
  crab_art_2_63: {
    v: 1,
    loop: 2.4,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#66bb6a", opacity: 0.54, anim: "wiggle", dur: 1.52, r: 49.03 },
      { type: "emoji", emoji: "🦀", x: 70, y: 46, size: 44, anim: "wiggle", dur: 1.27 },
      { type: "emoji", emoji: "🎩", x: 50, y: 11, size: 33, anim: "bounce", delay: 0.302, dur: 1.94 },
      { type: "emoji", emoji: "🍩", x: 73, y: 39, size: 24, anim: "rise", delay: 0.993, dur: 1.59 },
      { type: "emoji", emoji: "🎊", x: 36, y: 74, size: 24, anim: "float", delay: 1.302, dur: 1.81 },
      { type: "emoji", emoji: "💖", x: 65, y: 79, size: 10, anim: "blink", delay: 0.947, dur: 1.56 },
      { type: "emoji", emoji: "✨", x: 29, y: 16, size: 11, anim: "blink", delay: 0.841, dur: 1.81 }
    ],
  },
  crab_science_2_64: {
    v: 1,
    loop: 4.08,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 53, y: 47, size: 35, anim: "breathe", dur: 3.4 },
      { type: "emoji", emoji: "🌸", x: 56, y: 75, size: 16, anim: "pop", delay: 0.671, dur: 2.2 },
      { type: "emoji", emoji: "🎉", x: 68, y: 69, size: 15, anim: "pop", delay: 0.671, dur: 1.83 },
      { type: "emoji", emoji: "✨", x: 38, y: 38, size: 16, anim: "blink", delay: 1.187, dur: 1.58 },
      { type: "emoji", emoji: "💖", x: 56, y: 65, size: 18, anim: "blink", delay: 1.489, dur: 1.57 }
    ],
  },
  crab_pets_2_65: {
    v: 1,
    loop: 2.89,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#f4511e", opacity: 0.53, anim: "pulse", dur: 1.78, w: 107.54, h: 19.93 },
      { type: "emoji", emoji: "🦀", x: 50, y: 55, size: 42, anim: "pulse", dur: 1.94 },
      { type: "emoji", emoji: "👮", x: 49, y: 15, size: 30, anim: "bounce", delay: 0.565, dur: 1.79 },
      { type: "emoji", emoji: "🍬", x: 74, y: 43, size: 21, anim: "blink", delay: 0.764, dur: 1.9 },
      { type: "emoji", emoji: "🔥", x: 25, y: 85, size: 21, anim: "blink", delay: 0.545, dur: 2.04 },
      { type: "emoji", emoji: "🍃", x: 29, y: 87, size: 18, anim: "wiggle", delay: 1.376, dur: 2.11 },
      { type: "emoji", emoji: "❤️", x: 14, y: 22, size: 22, anim: "float", delay: 0.192, dur: 1.5 },
      { type: "emoji", emoji: "💫", x: 35, y: 56, size: 14, anim: "blink", delay: 1.464, dur: 1.69 },
      { type: "emoji", emoji: "🌟", x: 30, y: 76, size: 17, anim: "blink", delay: 1.561, dur: 1.91 }
    ],
  },
  crab_magic_2_66: {
    v: 1,
    loop: 2.36,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 57, y: 56, size: 37, anim: "pulse", dur: 2.19 },
      { type: "emoji", emoji: "👒", x: 50, y: 12, size: 33, anim: "bounce", delay: 0.56, dur: 1.57 },
      { type: "emoji", emoji: "🎊", x: 83, y: 55, size: 14, anim: "blink", delay: 1.12, dur: 1.31 },
      { type: "emoji", emoji: "❤️", x: 32, y: 44, size: 23, anim: "pop", delay: 0.573, dur: 1.69 },
      { type: "emoji", emoji: "🔥", x: 59, y: 59, size: 18, anim: "float", delay: 0.207, dur: 2.17 },
      { type: "emoji", emoji: "💖", x: 19, y: 33, size: 16, anim: "blink", delay: 0.905, dur: 1.74 },
      { type: "emoji", emoji: "🌟", x: 19, y: 25, size: 15, anim: "blink", delay: 1.189, dur: 1.71 }
    ],
  },
  crab_retro_2_67: {
    v: 1,
    loop: 3.23,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#9c27b0", opacity: 0.67, anim: "float", dur: 2.66, r: 48.44 },
      { type: "emoji", emoji: "🦀", x: 52, y: 49, size: 42, anim: "float", dur: 2.75 },
      { type: "emoji", emoji: "🤠", x: 49, y: 12, size: 33, anim: "bounce", delay: 0.438, dur: 1.91 },
      { type: "emoji", emoji: "🍩", x: 72, y: 39, size: 26, anim: "blink", delay: 0.637, dur: 1.58 },
      { type: "emoji", emoji: "❤️", x: 43, y: 75, size: 19, anim: "rise", delay: 1.18, dur: 1.46 },
      { type: "emoji", emoji: "🌸", x: 22, y: 17, size: 15, anim: "pop", delay: 1.088, dur: 2.35 },
      { type: "emoji", emoji: "🌟", x: 75, y: 38, size: 17, anim: "blink", delay: 0.514, dur: 1.77 },
      { type: "emoji", emoji: "💖", x: 71, y: 43, size: 15, anim: "blink", delay: 1.992, dur: 1.35 }
    ],
  },
  crab_cyber_2_68: {
    v: 1,
    loop: 3.57,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ffee58", opacity: 0.49, anim: "settle", dur: 2.83, r: 46.31 },
      { type: "emoji", emoji: "🦀", x: 35, y: 55, size: 36, anim: "settle", dur: 2.99 },
      { type: "emoji", emoji: "🧣", x: 51, y: 59, size: 26, anim: "bounce", delay: 0.523, dur: 1.52 },
      { type: "emoji", emoji: "🍄", x: 72, y: 44, size: 25, anim: "blink", delay: 0.552, dur: 1.49 },
      { type: "emoji", emoji: "🌿", x: 49, y: 59, size: 20, anim: "wiggle", delay: 1.437, dur: 1.85 },
      { type: "emoji", emoji: "✨", x: 32, y: 68, size: 16, anim: "rise", delay: 0.828, dur: 1.99 },
      { type: "emoji", emoji: "❄️", x: 26, y: 62, size: 23, anim: "float", delay: 1.493, dur: 2.08 },
      { type: "emoji", emoji: "💫", x: 72, y: 74, size: 17, anim: "blink", delay: 0.761, dur: 1.87 },
      { type: "emoji", emoji: "⭐", x: 60, y: 15, size: 17, anim: "blink", delay: 1.096, dur: 1.66 }
    ],
  },
  crab_nature_2_69: {
    v: 1,
    loop: 2.05,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#7986cb", opacity: 0.52, anim: "bounce", dur: 1.15, r: 45.83 },
      { type: "emoji", emoji: "🦀", x: 60, y: 54, size: 42, anim: "bounce", dur: 1.27 },
      { type: "emoji", emoji: "🍬", x: 75, y: 46, size: 22, anim: "pop", delay: 0.853, dur: 1.7 },
      { type: "emoji", emoji: "🌟", x: 65, y: 46, size: 22, anim: "rise", delay: 1.488, dur: 1.44 },
      { type: "emoji", emoji: "⭐", x: 61, y: 55, size: 10, anim: "blink", delay: 0.647, dur: 1.83 },
      { type: "emoji", emoji: "⭐", x: 79, y: 64, size: 16, anim: "blink", delay: 0.508, dur: 1.61 }
    ],
  },
  crab_underwater_2_70: {
    v: 1,
    loop: 3.03,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#f3e5f5", opacity: 0.56, anim: "twinkle", dur: 2.45, w: 95.54, h: 23.23 },
      { type: "emoji", emoji: "🦀", x: 44, y: 49, size: 35, anim: "twinkle", dur: 2.49 },
      { type: "emoji", emoji: "🍳", x: 48, y: 14, size: 27, anim: "bounce", delay: 0.643, dur: 1.53 },
      { type: "emoji", emoji: "🍦", x: 70, y: 41, size: 27, anim: "blink", delay: 0.49, dur: 1.58 },
      { type: "emoji", emoji: "✨", x: 76, y: 36, size: 20, anim: "rise", delay: 0.435, dur: 1.88 },
      { type: "emoji", emoji: "💖", x: 27, y: 76, size: 17, anim: "wiggle", delay: 0.512, dur: 1.95 },
      { type: "emoji", emoji: "🔥", x: 71, y: 48, size: 12, anim: "float", delay: 0.417, dur: 1.44 },
      { type: "emoji", emoji: "🌊", x: 46, y: 79, size: 12, anim: "pop", delay: 1.286, dur: 1.5 },
      { type: "emoji", emoji: "💫", x: 45, y: 22, size: 18, anim: "blink", delay: 0.816, dur: 1.7 },
      { type: "emoji", emoji: "💖", x: 49, y: 59, size: 12, anim: "blink", delay: 0.818, dur: 1.31 }
    ],
  },
  crab_sky_2_71: {
    v: 1,
    loop: 3.25,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 59, y: 49, size: 37, anim: "float", dur: 3.05 },
      { type: "emoji", emoji: "💌", x: 73, y: 41, size: 27, anim: "float", delay: 0.8, dur: 1.44 },
      { type: "emoji", emoji: "✨", x: 75, y: 79, size: 14, anim: "wiggle", delay: 0.227, dur: 1.28 },
      { type: "emoji", emoji: "🌟", x: 80, y: 16, size: 12, anim: "blink", delay: 1.389, dur: 1.77 },
      { type: "emoji", emoji: "✨", x: 15, y: 20, size: 13, anim: "blink", delay: 1.407, dur: 1.64 }
    ],
  },
  crab_party_3_72: {
    v: 1,
    loop: 2.01,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 38, y: 51, size: 39, anim: "pop", dur: 1.57 },
      { type: "emoji", emoji: "⭐", x: 78, y: 68, size: 19, anim: "blink", delay: 0.092, dur: 1.65 },
      { type: "emoji", emoji: "🍂", x: 39, y: 75, size: 22, anim: "rise", delay: 1.474, dur: 1.52 },
      { type: "emoji", emoji: "✨", x: 67, y: 60, size: 19, anim: "pop", delay: 0.936, dur: 2.06 },
      { type: "emoji", emoji: "✨", x: 35, y: 79, size: 10, anim: "blink", delay: 0.765, dur: 1.87 },
      { type: "emoji", emoji: "🌟", x: 53, y: 74, size: 16, anim: "blink", delay: 0.915, dur: 1.38 }
    ],
  },
  crab_beach_3_73: {
    v: 1,
    loop: 2.9,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 49, y: 47, size: 37, anim: "heartbeat", dur: 2.43 },
      { type: "emoji", emoji: "🧢", x: 50, y: 16, size: 28, anim: "bounce", delay: 0.358, dur: 1.6 },
      { type: "emoji", emoji: "🌸", x: 69, y: 43, size: 27, anim: "rise", delay: 0.544, dur: 1.59 },
      { type: "emoji", emoji: "❤️", x: 81, y: 50, size: 12, anim: "float", delay: 1.46, dur: 1.95 },
      { type: "emoji", emoji: "🌟", x: 18, y: 42, size: 12, anim: "blink", delay: 0.952, dur: 2.08 },
      { type: "emoji", emoji: "💖", x: 16, y: 14, size: 20, anim: "float", delay: 1.008, dur: 1.38 },
      { type: "emoji", emoji: "🌸", x: 37, y: 63, size: 24, anim: "wiggle", delay: 0.33, dur: 1.41 },
      { type: "emoji", emoji: "💖", x: 37, y: 17, size: 14, anim: "blink", delay: 0.524, dur: 1.81 },
      { type: "emoji", emoji: "💫", x: 45, y: 42, size: 10, anim: "blink", delay: 1.468, dur: 1.85 }
    ],
  },
  crab_winter_3_74: {
    v: 1,
    loop: 4.06,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#5e35b1", opacity: 0.36, anim: "float", dur: 3.49, w: 90.58, h: 21.19 },
      { type: "emoji", emoji: "🦀", x: 57, y: 54, size: 33, anim: "float", dur: 3.56 },
      { type: "emoji", emoji: "🪖", x: 51, y: 17, size: 28, anim: "bounce", delay: 0.612, dur: 1.81 },
      { type: "emoji", emoji: "⭐", x: 70, y: 29, size: 23, anim: "pop", delay: 0.735, dur: 1.82 },
      { type: "emoji", emoji: "💖", x: 78, y: 79, size: 25, anim: "float", delay: 0.195, dur: 2.37 },
      { type: "emoji", emoji: "🌿", x: 38, y: 65, size: 13, anim: "blink", delay: 0.149, dur: 1.76 },
      { type: "emoji", emoji: "❤️", x: 17, y: 88, size: 17, anim: "pop", delay: 0.616, dur: 2.32 },
      { type: "emoji", emoji: "🎉", x: 43, y: 27, size: 15, anim: "rise", delay: 0.235, dur: 1.67 },
      { type: "emoji", emoji: "✨", x: 28, y: 65, size: 12, anim: "blink", delay: 0.578, dur: 1.84 },
      { type: "emoji", emoji: "⭐", x: 69, y: 47, size: 16, anim: "blink", delay: 0.799, dur: 1.62 }
    ],
  },
  crab_spring_3_75: {
    v: 1,
    loop: 3.25,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ff5722", opacity: 0.63, anim: "float", dur: 3.03, w: 107.77, h: 18.57 },
      { type: "emoji", emoji: "🦀", x: 35, y: 54, size: 35, anim: "float", dur: 2.99 },
      { type: "emoji", emoji: "🎈", x: 71, y: 27, size: 28, anim: "pop", delay: 0.703, dur: 1.46 },
      { type: "emoji", emoji: "⭐", x: 42, y: 84, size: 16, anim: "rise", delay: 1.344, dur: 1.25 },
      { type: "emoji", emoji: "🎈", x: 41, y: 35, size: 17, anim: "rise", delay: 1.319, dur: 2.13 },
      { type: "emoji", emoji: "💖", x: 52, y: 64, size: 16, anim: "blink", delay: 0.818, dur: 1.87 },
      { type: "emoji", emoji: "💫", x: 68, y: 50, size: 11, anim: "blink", delay: 0.652, dur: 1.68 }
    ],
  },
  crab_halloween_3_76: {
    v: 1,
    loop: 2.42,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#f06292", opacity: 0.43, anim: "wave", dur: 2.01, w: 99.52, h: 24.83 },
      { type: "emoji", emoji: "🦀", x: 62, y: 56, size: 32, anim: "wave", dur: 1.86 },
      { type: "emoji", emoji: "🧙", x: 49, y: 10, size: 34, anim: "bounce", delay: 0.566, dur: 1.76 },
      { type: "emoji", emoji: "🍦", x: 72, y: 41, size: 26, anim: "pop", delay: 0.678, dur: 1.8 },
      { type: "emoji", emoji: "🎊", x: 40, y: 21, size: 13, anim: "blink", delay: 0.77, dur: 1.63 },
      { type: "emoji", emoji: "🎈", x: 84, y: 41, size: 14, anim: "pop", delay: 0.311, dur: 2 },
      { type: "emoji", emoji: "🌟", x: 27, y: 78, size: 13, anim: "wiggle", delay: 1.056, dur: 1.6 },
      { type: "emoji", emoji: "✨", x: 55, y: 73, size: 13, anim: "float", delay: 0.087, dur: 1.23 },
      { type: "emoji", emoji: "🍃", x: 80, y: 53, size: 19, anim: "blink", delay: 0.899, dur: 1.85 },
      { type: "emoji", emoji: "⭐", x: 84, y: 19, size: 11, anim: "blink", delay: 1.154, dur: 1.37 },
      { type: "emoji", emoji: "💖", x: 20, y: 26, size: 13, anim: "blink", delay: 0.651, dur: 1.23 }
    ],
  },
  crab_christmas_3_77: {
    v: 1,
    loop: 1.91,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ba68c8", opacity: 0.36, anim: "bounce", dur: 1.45, r: 48.8 },
      { type: "emoji", emoji: "🦀", x: 36, y: 49, size: 33, anim: "bounce", dur: 1.63 },
      { type: "emoji", emoji: "🎈", x: 82, y: 28, size: 14, anim: "pop", delay: 0.806, dur: 2.32 },
      { type: "emoji", emoji: "🎉", x: 15, y: 70, size: 13, anim: "pop", delay: 0.657, dur: 1.71 },
      { type: "emoji", emoji: "💖", x: 22, y: 58, size: 16, anim: "blink", delay: 1.859, dur: 1.62 },
      { type: "emoji", emoji: "💖", x: 69, y: 81, size: 13, anim: "blink", delay: 1.364, dur: 1.66 }
    ],
  },
  crab_coding_3_78: {
    v: 1,
    loop: 2.1,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffee58", opacity: 0.32, anim: "wiggle", dur: 1.41, w: 101.61, h: 20.95 },
      { type: "emoji", emoji: "🦀", x: 63, y: 51, size: 40, anim: "wiggle", dur: 1.36 },
      { type: "emoji", emoji: "🍀", x: 71, y: 46, size: 23, anim: "float", delay: 0.469, dur: 1.9 },
      { type: "emoji", emoji: "❄️", x: 72, y: 54, size: 14, anim: "float", delay: 1.265, dur: 1.66 },
      { type: "emoji", emoji: "🌟", x: 10, y: 25, size: 23, anim: "wiggle", delay: 0.496, dur: 1.59 },
      { type: "emoji", emoji: "🍃", x: 37, y: 12, size: 23, anim: "float", delay: 1.039, dur: 2.07 },
      { type: "emoji", emoji: "⭐", x: 82, y: 83, size: 14, anim: "blink", delay: 1.723, dur: 1.14 },
      { type: "emoji", emoji: "💖", x: 36, y: 51, size: 19, anim: "blink", delay: 0.677, dur: 1.88 }
    ],
  },
  crab_music_3_79: {
    v: 1,
    loop: 4.12,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#e8eaf6", opacity: 0.35, anim: "breathe", dur: 3.27, w: 109.94, h: 24.51 },
      { type: "emoji", emoji: "🦀", x: 38, y: 48, size: 34, anim: "breathe", dur: 3.51 },
      { type: "emoji", emoji: "👑", x: 48, y: 13, size: 28, anim: "bounce", delay: 0.374, dur: 1.98 },
      { type: "emoji", emoji: "🍩", x: 70, y: 44, size: 26, anim: "rise", delay: 0.486, dur: 1.65 },
      { type: "emoji", emoji: "💖", x: 55, y: 14, size: 14, anim: "pop", delay: 0.367, dur: 2.37 },
      { type: "emoji", emoji: "🍂", x: 31, y: 54, size: 25, anim: "float", delay: 1.237, dur: 1.53 },
      { type: "emoji", emoji: "💖", x: 83, y: 48, size: 14, anim: "wiggle", delay: 0.374, dur: 1.26 },
      { type: "emoji", emoji: "💫", x: 88, y: 74, size: 25, anim: "blink", delay: 0.233, dur: 2.27 },
      { type: "emoji", emoji: "💖", x: 68, y: 42, size: 13, anim: "blink", delay: 1.56, dur: 1.19 },
      { type: "emoji", emoji: "💫", x: 66, y: 55, size: 17, anim: "blink", delay: 0.53, dur: 1.3 }
    ],
  },
  crab_sports_3_80: {
    v: 1,
    loop: 2.96,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 54, y: 49, size: 41, anim: "pulse", dur: 1.9 },
      { type: "emoji", emoji: "🌟", x: 74, y: 26, size: 27, anim: "float", delay: 0.94, dur: 1.59 },
      { type: "emoji", emoji: "🍃", x: 62, y: 70, size: 19, anim: "pop", delay: 1.169, dur: 2.27 },
      { type: "emoji", emoji: "🍂", x: 67, y: 45, size: 17, anim: "wiggle", delay: 0.394, dur: 2.02 },
      { type: "emoji", emoji: "✨", x: 40, y: 77, size: 18, anim: "wiggle", delay: 1.421, dur: 2.31 },
      { type: "emoji", emoji: "🎊", x: 85, y: 62, size: 25, anim: "rise", delay: 0.86, dur: 1.67 },
      { type: "emoji", emoji: "❄️", x: 30, y: 41, size: 24, anim: "float", delay: 1.455, dur: 2.12 },
      { type: "emoji", emoji: "✨", x: 40, y: 51, size: 17, anim: "blink", delay: 1.108, dur: 1.59 },
      { type: "emoji", emoji: "💫", x: 66, y: 54, size: 18, anim: "blink", delay: 1.309, dur: 1.06 }
    ],
  },
  crab_food_3_81: {
    v: 1,
    loop: 2.72,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#0277bd", opacity: 0.35, anim: "pulse", dur: 2.21, r: 47.99 },
      { type: "emoji", emoji: "🦀", x: 52, y: 45, size: 35, anim: "pulse", dur: 2.08 },
      { type: "emoji", emoji: "👑", x: 48, y: 12, size: 28, anim: "bounce", delay: 0.401, dur: 1.68 },
      { type: "emoji", emoji: "🍰", x: 66, y: 40, size: 29, anim: "rise", delay: 0.932, dur: 1.72 },
      { type: "emoji", emoji: "🎈", x: 52, y: 55, size: 23, anim: "wiggle", delay: 0.975, dur: 1.46 },
      { type: "emoji", emoji: "✨", x: 70, y: 55, size: 17, anim: "blink", delay: 0.532, dur: 1.91 },
      { type: "emoji", emoji: "✨", x: 35, y: 33, size: 14, anim: "blink", delay: 1.502, dur: 1.5 }
    ],
  },
  crab_space_3_82: {
    v: 1,
    loop: 2.85,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffcc80", opacity: 0.57, anim: "float", dur: 2.83, w: 102.85, h: 27.09 },
      { type: "emoji", emoji: "🦀", x: 40, y: 46, size: 35, anim: "float", dur: 2.78 },
      { type: "emoji", emoji: "🍰", x: 67, y: 38, size: 27, anim: "float", delay: 0.521, dur: 1.92 },
      { type: "emoji", emoji: "🔥", x: 61, y: 55, size: 12, anim: "float", delay: 0.856, dur: 2.23 },
      { type: "emoji", emoji: "❤️", x: 38, y: 27, size: 20, anim: "float", delay: 0.076, dur: 1.37 },
      { type: "emoji", emoji: "💫", x: 77, y: 47, size: 19, anim: "blink", delay: 0.012, dur: 1.27 },
      { type: "emoji", emoji: "⭐", x: 48, y: 40, size: 13, anim: "blink", delay: 1.754, dur: 1.35 },
      { type: "emoji", emoji: "💖", x: 82, y: 33, size: 19, anim: "blink", delay: 1.885, dur: 1.31 }
    ],
  },
  crab_fantasy_3_83: {
    v: 1,
    loop: 3.42,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#4caf50", opacity: 0.52, anim: "settle", dur: 2.82, w: 104.78, h: 26.16 },
      { type: "emoji", emoji: "🦀", x: 58, y: 49, size: 34, anim: "settle", dur: 2.87 },
      { type: "emoji", emoji: "👑", x: 50, y: 14, size: 28, anim: "bounce", delay: 0.341, dur: 1.7 },
      { type: "emoji", emoji: "🎈", x: 16, y: 31, size: 22, anim: "rise", delay: 0.791, dur: 2.28 },
      { type: "emoji", emoji: "🌊", x: 62, y: 36, size: 14, anim: "pop", delay: 1.202, dur: 1.32 },
      { type: "emoji", emoji: "💖", x: 67, y: 31, size: 11, anim: "blink", delay: 1.889, dur: 1.88 },
      { type: "emoji", emoji: "🌟", x: 59, y: 50, size: 19, anim: "blink", delay: 0.962, dur: 1.58 }
    ],
  },
  crab_office_3_84: {
    v: 1,
    loop: 1.97,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#5e35b1", opacity: 0.51, anim: "bounce", dur: 1.45, w: 95.98, h: 27.82 },
      { type: "emoji", emoji: "🦀", x: 37, y: 56, size: 33, anim: "bounce", dur: 1.43 },
      { type: "emoji", emoji: "🌸", x: 72, y: 41, size: 27, anim: "float", delay: 0.689, dur: 1.86 },
      { type: "emoji", emoji: "✨", x: 37, y: 59, size: 18, anim: "wiggle", delay: 0.165, dur: 1.26 },
      { type: "emoji", emoji: "🎈", x: 57, y: 20, size: 21, anim: "pop", delay: 0.153, dur: 1.78 },
      { type: "emoji", emoji: "🌟", x: 43, y: 26, size: 11, anim: "blink", delay: 0.527, dur: 1.06 },
      { type: "emoji", emoji: "⭐", x: 38, y: 70, size: 11, anim: "blink", delay: 1.368, dur: 1.54 }
    ],
  },
  crab_fitness_3_85: {
    v: 1,
    loop: 3.12,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 50, y: 51, size: 39, anim: "twinkle", dur: 2.59 },
      { type: "emoji", emoji: "🧢", x: 51, y: 16, size: 31, anim: "bounce", delay: 0.311, dur: 1.91 },
      { type: "emoji", emoji: "🌊", x: 88, y: 67, size: 16, anim: "wiggle", delay: 0.329, dur: 1.88 },
      { type: "emoji", emoji: "💖", x: 17, y: 33, size: 18, anim: "blink", delay: 1.093, dur: 1.85 },
      { type: "emoji", emoji: "⭐", x: 71, y: 54, size: 14, anim: "blink", delay: 0.68, dur: 1.65 }
    ],
  },
  crab_travel_3_86: {
    v: 1,
    loop: 3.35,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 57, y: 52, size: 38, anim: "float", dur: 3 },
      { type: "emoji", emoji: "🍃", x: 57, y: 39, size: 22, anim: "float", delay: 0.326, dur: 2.14 },
      { type: "emoji", emoji: "⭐", x: 80, y: 11, size: 20, anim: "pop", delay: 1, dur: 2.14 },
      { type: "emoji", emoji: "🌟", x: 30, y: 72, size: 24, anim: "pop", delay: 0.678, dur: 1.94 },
      { type: "emoji", emoji: "💫", x: 51, y: 84, size: 19, anim: "float", delay: 0.554, dur: 2.16 },
      { type: "emoji", emoji: "💫", x: 48, y: 29, size: 11, anim: "blink", delay: 1.684, dur: 1.31 },
      { type: "emoji", emoji: "💫", x: 78, y: 40, size: 17, anim: "blink", delay: 1.093, dur: 1.46 }
    ],
  },
  crab_art_3_87: {
    v: 1,
    loop: 2.28,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ab47bc", opacity: 0.57, anim: "pop", dur: 1.66, r: 40.05 },
      { type: "emoji", emoji: "🦀", x: 44, y: 51, size: 42, anim: "pop", dur: 1.57 },
      { type: "emoji", emoji: "🌻", x: 72, y: 44, size: 27, anim: "blink", delay: 0.699, dur: 1.83 },
      { type: "emoji", emoji: "🎊", x: 70, y: 34, size: 22, anim: "blink", delay: 0.056, dur: 2.16 },
      { type: "emoji", emoji: "❤️", x: 31, y: 53, size: 14, anim: "blink", delay: 1.022, dur: 1.58 },
      { type: "emoji", emoji: "🌟", x: 11, y: 77, size: 12, anim: "blink", delay: 0.874, dur: 1.65 },
      { type: "emoji", emoji: "💖", x: 12, y: 60, size: 25, anim: "rise", delay: 0.002, dur: 1.82 },
      { type: "emoji", emoji: "✨", x: 17, y: 38, size: 18, anim: "blink", delay: 0.622, dur: 1.07 },
      { type: "emoji", emoji: "🌟", x: 44, y: 69, size: 13, anim: "blink", delay: 1.852, dur: 1.06 }
    ],
  },
  crab_science_3_88: {
    v: 1,
    loop: 3.09,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 70, y: 55, size: 34, anim: "heartbeat", dur: 2.5 },
      { type: "emoji", emoji: "💌", x: 70, y: 42, size: 25, anim: "pop", delay: 0.934, dur: 1.98 },
      { type: "emoji", emoji: "🎊", x: 25, y: 45, size: 23, anim: "rise", delay: 0.858, dur: 2.25 },
      { type: "emoji", emoji: "❤️", x: 17, y: 24, size: 21, anim: "rise", delay: 0.518, dur: 1.23 },
      { type: "emoji", emoji: "✨", x: 62, y: 67, size: 23, anim: "blink", delay: 0.355, dur: 1.27 },
      { type: "emoji", emoji: "🌊", x: 49, y: 35, size: 25, anim: "float", delay: 0.29, dur: 1.82 },
      { type: "emoji", emoji: "🌟", x: 38, y: 75, size: 11, anim: "blink", delay: 0.77, dur: 1.98 },
      { type: "emoji", emoji: "🌟", x: 38, y: 58, size: 11, anim: "blink", delay: 0.723, dur: 1.23 }
    ],
  },
  crab_pets_3_89: {
    v: 1,
    loop: 4.09,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e8eaf6", opacity: 0.32, anim: "float", dur: 3.34, r: 40.77 },
      { type: "emoji", emoji: "🦀", x: 32, y: 50, size: 43, anim: "float", dur: 3.54 },
      { type: "emoji", emoji: "👒", x: 52, y: 14, size: 35, anim: "bounce", delay: 0.625, dur: 1.59 },
      { type: "emoji", emoji: "🍃", x: 19, y: 42, size: 16, anim: "wiggle", delay: 0.187, dur: 1.22 },
      { type: "emoji", emoji: "🌟", x: 21, y: 24, size: 23, anim: "float", delay: 1.314, dur: 2.35 },
      { type: "emoji", emoji: "🎈", x: 16, y: 30, size: 24, anim: "blink", delay: 0.152, dur: 1.49 },
      { type: "emoji", emoji: "❄️", x: 11, y: 46, size: 17, anim: "rise", delay: 0.455, dur: 1.39 },
      { type: "emoji", emoji: "🌟", x: 35, y: 44, size: 12, anim: "wiggle", delay: 0.012, dur: 1.65 },
      { type: "emoji", emoji: "✨", x: 22, y: 70, size: 10, anim: "blink", delay: 1.367, dur: 1.04 },
      { type: "emoji", emoji: "💖", x: 34, y: 73, size: 19, anim: "blink", delay: 1.183, dur: 1.06 }
    ],
  },
  crab_magic_3_90: {
    v: 1,
    loop: 2.88,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fff0f6", opacity: 0.67, anim: "float", dur: 2.83, r: 43.48 },
      { type: "emoji", emoji: "🦀", x: 55, y: 51, size: 35, anim: "float", dur: 2.94 },
      { type: "emoji", emoji: "🌹", x: 70, y: 44, size: 29, anim: "float", delay: 0.731, dur: 1.83 },
      { type: "emoji", emoji: "🔥", x: 32, y: 25, size: 20, anim: "wiggle", delay: 0.444, dur: 1.88 },
      { type: "emoji", emoji: "🔥", x: 61, y: 37, size: 25, anim: "blink", delay: 1.11, dur: 1.32 },
      { type: "emoji", emoji: "💫", x: 82, y: 44, size: 14, anim: "blink", delay: 0.505, dur: 1.21 },
      { type: "emoji", emoji: "💖", x: 22, y: 30, size: 15, anim: "blink", delay: 0.608, dur: 1.49 }
    ],
  },
  crab_retro_3_91: {
    v: 1,
    loop: 2.33,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#0277bd", opacity: 0.56, anim: "wave", dur: 1.6, r: 40.33 },
      { type: "emoji", emoji: "🦀", x: 39, y: 49, size: 36, anim: "wave", dur: 1.73 },
      { type: "emoji", emoji: "🧙", x: 48, y: 12, size: 33, anim: "bounce", delay: 0.582, dur: 1.53 },
      { type: "emoji", emoji: "🍀", x: 72, y: 41, size: 22, anim: "rise", delay: 0.507, dur: 1.83 },
      { type: "emoji", emoji: "🎉", x: 42, y: 82, size: 24, anim: "float", delay: 0.639, dur: 2.38 },
      { type: "emoji", emoji: "💖", x: 30, y: 38, size: 25, anim: "blink", delay: 1.133, dur: 1.25 },
      { type: "emoji", emoji: "🍂", x: 62, y: 80, size: 19, anim: "rise", delay: 1.233, dur: 2.14 },
      { type: "emoji", emoji: "⭐", x: 28, y: 49, size: 16, anim: "blink", delay: 1.011, dur: 1.23 },
      { type: "emoji", emoji: "💖", x: 55, y: 44, size: 19, anim: "blink", delay: 1.316, dur: 1.14 }
    ],
  },
  crab_cyber_3_92: {
    v: 1,
    loop: 2.2,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f57c00", opacity: 0.42, anim: "bounce", dur: 1.48, r: 47.31 },
      { type: "emoji", emoji: "🦀", x: 61, y: 55, size: 44, anim: "bounce", dur: 1.45 },
      { type: "emoji", emoji: "🎓", x: 48, y: 16, size: 28, anim: "bounce", delay: 0.611, dur: 1.85 },
      { type: "emoji", emoji: "🍬", x: 73, y: 46, size: 20, anim: "blink", delay: 0.456, dur: 1.63 },
      { type: "emoji", emoji: "⭐", x: 36, y: 39, size: 14, anim: "float", delay: 1.011, dur: 2.3 },
      { type: "emoji", emoji: "💫", x: 47, y: 62, size: 18, anim: "rise", delay: 1.048, dur: 1.55 },
      { type: "emoji", emoji: "🍂", x: 31, y: 85, size: 15, anim: "pop", delay: 0.491, dur: 1.6 },
      { type: "emoji", emoji: "❤️", x: 61, y: 61, size: 15, anim: "wiggle", delay: 0.319, dur: 2.05 },
      { type: "emoji", emoji: "🌟", x: 80, y: 83, size: 11, anim: "blink", delay: 1.673, dur: 1.29 },
      { type: "emoji", emoji: "✨", x: 48, y: 75, size: 17, anim: "blink", delay: 1.811, dur: 1.86 }
    ],
  },
  crab_nature_3_93: {
    v: 1,
    loop: 2.12,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#43a047", opacity: 0.35, anim: "wiggle", dur: 1.62, r: 47.82 },
      { type: "emoji", emoji: "🦀", x: 41, y: 50, size: 35, anim: "wiggle", dur: 1.37 },
      { type: "emoji", emoji: "🌿", x: 72, y: 72, size: 23, anim: "blink", delay: 0.052, dur: 1.39 },
      { type: "emoji", emoji: "🌸", x: 85, y: 67, size: 20, anim: "rise", delay: 0.407, dur: 2.3 },
      { type: "emoji", emoji: "⭐", x: 25, y: 86, size: 24, anim: "wiggle", delay: 1.404, dur: 1.98 },
      { type: "emoji", emoji: "🎈", x: 28, y: 13, size: 18, anim: "blink", delay: 0.767, dur: 1.49 },
      { type: "emoji", emoji: "🌿", x: 77, y: 28, size: 20, anim: "pop", delay: 1.18, dur: 1.99 },
      { type: "emoji", emoji: "💫", x: 25, y: 36, size: 18, anim: "blink", delay: 0.628, dur: 1.91 },
      { type: "emoji", emoji: "🌟", x: 30, y: 66, size: 15, anim: "blink", delay: 1.295, dur: 1.47 }
    ],
  },
  crab_underwater_3_94: {
    v: 1,
    loop: 4.03,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#512da8", opacity: 0.7, anim: "breathe", dur: 3.42, w: 108.43, h: 18.46 },
      { type: "emoji", emoji: "🦀", x: 42, y: 47, size: 36, anim: "breathe", dur: 3.4 },
      { type: "emoji", emoji: "🍫", x: 70, y: 47, size: 27, anim: "rise", delay: 0.903, dur: 1.91 },
      { type: "emoji", emoji: "🎊", x: 51, y: 52, size: 23, anim: "rise", delay: 1.421, dur: 2.28 },
      { type: "emoji", emoji: "❄️", x: 45, y: 53, size: 14, anim: "pop", delay: 0.952, dur: 2.39 },
      { type: "emoji", emoji: "🌊", x: 70, y: 23, size: 24, anim: "pop", delay: 1.297, dur: 1.56 },
      { type: "emoji", emoji: "💫", x: 12, y: 28, size: 25, anim: "blink", delay: 0.055, dur: 2.22 },
      { type: "emoji", emoji: "💖", x: 69, y: 42, size: 12, anim: "blink", delay: 1.823, dur: 1.61 },
      { type: "emoji", emoji: "✨", x: 55, y: 40, size: 14, anim: "blink", delay: 1.393, dur: 1.72 }
    ],
  },
  crab_sky_3_95: {
    v: 1,
    loop: 2.99,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ff8a65", opacity: 0.46, anim: "pulse", dur: 2.03, w: 108.49, h: 18.19 },
      { type: "emoji", emoji: "🦀", x: 56, y: 52, size: 35, anim: "pulse", dur: 2.14 },
      { type: "emoji", emoji: "❄️", x: 83, y: 39, size: 12, anim: "blink", delay: 1.149, dur: 1.42 },
      { type: "emoji", emoji: "🌸", x: 76, y: 11, size: 21, anim: "rise", delay: 0.691, dur: 2.22 },
      { type: "emoji", emoji: "❄️", x: 77, y: 33, size: 20, anim: "blink", delay: 0.561, dur: 1.76 },
      { type: "emoji", emoji: "🌿", x: 61, y: 83, size: 12, anim: "pop", delay: 0.695, dur: 2.15 },
      { type: "emoji", emoji: "🎊", x: 63, y: 30, size: 24, anim: "float", delay: 0.585, dur: 1.98 },
      { type: "emoji", emoji: "💖", x: 46, y: 30, size: 10, anim: "blink", delay: 1.112, dur: 1.01 },
      { type: "emoji", emoji: "✨", x: 30, y: 75, size: 11, anim: "blink", delay: 0.521, dur: 1.39 }
    ],
  },
  crab_party_4_96: {
    v: 1,
    loop: 2.74,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#c2185b", opacity: 0.41, anim: "pulse", dur: 2.13, w: 103.15, h: 26.56 },
      { type: "emoji", emoji: "🦀", x: 39, y: 51, size: 37, anim: "pulse", dur: 2.17 },
      { type: "emoji", emoji: "🧙", x: 51, y: 10, size: 35, anim: "bounce", delay: 0.589, dur: 1.93 },
      { type: "emoji", emoji: "🍩", x: 68, y: 40, size: 24, anim: "float", delay: 0.684, dur: 1.7 },
      { type: "emoji", emoji: "🌿", x: 43, y: 54, size: 20, anim: "wiggle", delay: 0.265, dur: 2.2 },
      { type: "emoji", emoji: "🌊", x: 23, y: 31, size: 16, anim: "rise", delay: 0.225, dur: 1.34 },
      { type: "emoji", emoji: "❤️", x: 12, y: 65, size: 20, anim: "pop", delay: 0.565, dur: 2.22 },
      { type: "emoji", emoji: "🎉", x: 85, y: 10, size: 18, anim: "float", delay: 0.005, dur: 1.31 },
      { type: "emoji", emoji: "✨", x: 70, y: 11, size: 19, anim: "rise", delay: 0.518, dur: 1.32 },
      { type: "emoji", emoji: "⭐", x: 23, y: 38, size: 15, anim: "blink", delay: 0.998, dur: 1.42 },
      { type: "emoji", emoji: "🌟", x: 56, y: 75, size: 14, anim: "blink", delay: 0.947, dur: 1.92 }
    ],
  },
  crab_beach_4_97: {
    v: 1,
    loop: 3.11,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#7b1fa2", opacity: 0.35, anim: "float", dur: 2.72, r: 42.13 },
      { type: "emoji", emoji: "🦀", x: 60, y: 53, size: 35, anim: "float", dur: 2.92 },
      { type: "emoji", emoji: "💎", x: 69, y: 36, size: 23, anim: "pop", delay: 0.832, dur: 1.91 },
      { type: "emoji", emoji: "🔥", x: 56, y: 32, size: 17, anim: "wiggle", delay: 1.25, dur: 1.67 },
      { type: "emoji", emoji: "🌸", x: 10, y: 51, size: 14, anim: "blink", delay: 0.269, dur: 1.86 },
      { type: "emoji", emoji: "🌸", x: 22, y: 68, size: 13, anim: "blink", delay: 0.766, dur: 2.16 },
      { type: "emoji", emoji: "❄️", x: 32, y: 68, size: 16, anim: "rise", delay: 1.114, dur: 2.11 },
      { type: "emoji", emoji: "💫", x: 62, y: 68, size: 25, anim: "float", delay: 0.002, dur: 2.24 },
      { type: "emoji", emoji: "🌟", x: 61, y: 66, size: 10, anim: "blink", delay: 1.321, dur: 1.63 },
      { type: "emoji", emoji: "💖", x: 73, y: 15, size: 14, anim: "blink", delay: 1.582, dur: 1.64 }
    ],
  },
  crab_winter_4_98: {
    v: 1,
    loop: 3.52,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 70, y: 51, size: 36, anim: "settle", dur: 3.07 },
      { type: "emoji", emoji: "🎭", x: 50, y: 28, size: 26, anim: "bounce", delay: 0.694, dur: 1.97 },
      { type: "emoji", emoji: "❤️", x: 41, y: 82, size: 14, anim: "pop", delay: 0.732, dur: 2.28 },
      { type: "emoji", emoji: "🌟", x: 76, y: 27, size: 16, anim: "blink", delay: 0.707, dur: 1.15 },
      { type: "emoji", emoji: "💫", x: 49, y: 53, size: 12, anim: "blink", delay: 1.026, dur: 1.74 }
    ],
  },
  crab_spring_4_99: {
    v: 1,
    loop: 2.18,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 49, y: 55, size: 34, anim: "bounce", dur: 1.31 },
      { type: "emoji", emoji: "👑", x: 51, y: 14, size: 28, anim: "bounce", delay: 0.575, dur: 1.83 },
      { type: "emoji", emoji: "❤️", x: 57, y: 66, size: 12, anim: "wiggle", delay: 0.88, dur: 1.58 },
      { type: "emoji", emoji: "🎈", x: 65, y: 38, size: 12, anim: "wiggle", delay: 0.709, dur: 2.11 },
      { type: "emoji", emoji: "🌸", x: 56, y: 27, size: 18, anim: "rise", delay: 1.201, dur: 1.34 },
      { type: "emoji", emoji: "⭐", x: 58, y: 63, size: 13, anim: "blink", delay: 1.946, dur: 1.48 },
      { type: "emoji", emoji: "💖", x: 36, y: 64, size: 18, anim: "blink", delay: 0.817, dur: 1.13 }
    ],
  },
  crab_halloween_4_100: {
    v: 1,
    loop: 3.24,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 52, y: 54, size: 39, anim: "twinkle", dur: 2.56 },
      { type: "emoji", emoji: "🌹", x: 67, y: 45, size: 29, anim: "blink", delay: 0.78, dur: 1.53 },
      { type: "emoji", emoji: "🌸", x: 51, y: 23, size: 23, anim: "rise", delay: 0.129, dur: 2.1 },
      { type: "emoji", emoji: "🌿", x: 87, y: 17, size: 14, anim: "blink", delay: 1.226, dur: 1.36 },
      { type: "emoji", emoji: "💖", x: 62, y: 71, size: 23, anim: "pop", delay: 1.231, dur: 2.03 },
      { type: "emoji", emoji: "🌸", x: 68, y: 70, size: 13, anim: "rise", delay: 0.391, dur: 2.06 },
      { type: "emoji", emoji: "💫", x: 57, y: 15, size: 16, anim: "blink", delay: 0.755, dur: 1.03 },
      { type: "emoji", emoji: "💫", x: 81, y: 27, size: 18, anim: "blink", delay: 0.748, dur: 1.37 }
    ],
  },
  crab_christmas_4_101: {
    v: 1,
    loop: 3.16,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#b3e5fc", opacity: 0.4, anim: "float", dur: 2.77, w: 97.73, h: 25.82 },
      { type: "emoji", emoji: "🦀", x: 43, y: 48, size: 43, anim: "float", dur: 2.99 },
      { type: "emoji", emoji: "💝", x: 73, y: 41, size: 27, anim: "float", delay: 0.695, dur: 1.8 },
      { type: "emoji", emoji: "✨", x: 48, y: 15, size: 13, anim: "rise", delay: 0.079, dur: 2 },
      { type: "emoji", emoji: "❄️", x: 58, y: 31, size: 17, anim: "pop", delay: 0.11, dur: 2.37 },
      { type: "emoji", emoji: "🌟", x: 34, y: 59, size: 20, anim: "float", delay: 0.756, dur: 1.32 },
      { type: "emoji", emoji: "💖", x: 52, y: 31, size: 17, anim: "float", delay: 0.638, dur: 2.3 },
      { type: "emoji", emoji: "💖", x: 81, y: 67, size: 11, anim: "blink", delay: 1.131, dur: 1.95 },
      { type: "emoji", emoji: "💖", x: 17, y: 25, size: 10, anim: "blink", delay: 0.83, dur: 1.27 }
    ],
  },
  crab_coding_4_102: {
    v: 1,
    loop: 2.3,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 52, y: 54, size: 41, anim: "pop", dur: 1.68 },
      { type: "emoji", emoji: "🍬", x: 70, y: 43, size: 22, anim: "float", delay: 0.815, dur: 1.68 },
      { type: "emoji", emoji: "💖", x: 65, y: 11, size: 16, anim: "wiggle", delay: 0.515, dur: 1.29 },
      { type: "emoji", emoji: "🌟", x: 79, y: 24, size: 20, anim: "pop", delay: 0.75, dur: 1.26 },
      { type: "emoji", emoji: "💖", x: 42, y: 26, size: 15, anim: "float", delay: 1.338, dur: 1.35 },
      { type: "emoji", emoji: "🌸", x: 40, y: 59, size: 12, anim: "blink", delay: 0.115, dur: 1.26 },
      { type: "emoji", emoji: "💖", x: 18, y: 21, size: 12, anim: "blink", delay: 1.611, dur: 1.04 },
      { type: "emoji", emoji: "🌟", x: 35, y: 61, size: 19, anim: "blink", delay: 1.945, dur: 1.69 }
    ],
  },
  crab_music_4_103: {
    v: 1,
    loop: 3.15,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#66bb6a", opacity: 0.33, anim: "heartbeat", dur: 2.34, r: 47.06 },
      { type: "emoji", emoji: "🦀", x: 55, y: 50, size: 42, anim: "heartbeat", dur: 2.43 },
      { type: "emoji", emoji: "🎩", x: 48, y: 13, size: 33, anim: "bounce", delay: 0.53, dur: 1.62 },
      { type: "emoji", emoji: "✨", x: 22, y: 22, size: 13, anim: "blink", delay: 0.052, dur: 2.18 },
      { type: "emoji", emoji: "❄️", x: 25, y: 87, size: 20, anim: "rise", delay: 0.538, dur: 1.59 },
      { type: "emoji", emoji: "💫", x: 14, y: 18, size: 13, anim: "pop", delay: 0.726, dur: 1.82 },
      { type: "emoji", emoji: "✨", x: 32, y: 76, size: 25, anim: "wiggle", delay: 0.021, dur: 1.44 },
      { type: "emoji", emoji: "💖", x: 76, y: 25, size: 14, anim: "blink", delay: 1.493, dur: 1.82 },
      { type: "emoji", emoji: "💖", x: 40, y: 49, size: 17, anim: "blink", delay: 1.908, dur: 1.84 }
    ],
  },
  crab_sports_4_104: {
    v: 1,
    loop: 4.23,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#d1c4e9", opacity: 0.6, anim: "float", dur: 3.57, r: 40.39 },
      { type: "emoji", emoji: "🦀", x: 37, y: 51, size: 39, anim: "float", dur: 3.49 },
      { type: "emoji", emoji: "👑", x: 51, y: 14, size: 28, anim: "bounce", delay: 0.437, dur: 1.79 },
      { type: "emoji", emoji: "✨", x: 11, y: 53, size: 23, anim: "wiggle", delay: 0.611, dur: 1.79 },
      { type: "emoji", emoji: "💖", x: 57, y: 81, size: 15, anim: "wiggle", delay: 0.832, dur: 1.7 },
      { type: "emoji", emoji: "💫", x: 40, y: 60, size: 23, anim: "rise", delay: 0.807, dur: 1.32 },
      { type: "emoji", emoji: "🌟", x: 16, y: 88, size: 14, anim: "pop", delay: 0.77, dur: 1.39 },
      { type: "emoji", emoji: "💖", x: 44, y: 44, size: 11, anim: "blink", delay: 1.457, dur: 1.54 },
      { type: "emoji", emoji: "⭐", x: 75, y: 72, size: 18, anim: "blink", delay: 1.457, dur: 1.55 }
    ],
  },
  crab_food_4_105: {
    v: 1,
    loop: 3.13,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 60, y: 50, size: 32, anim: "float", dur: 3.08 },
      { type: "emoji", emoji: "🌸", x: 72, y: 43, size: 25, anim: "float", delay: 0.79, dur: 1.56 },
      { type: "emoji", emoji: "💫", x: 58, y: 68, size: 15, anim: "blink", delay: 1.047, dur: 1.44 },
      { type: "emoji", emoji: "🎉", x: 19, y: 84, size: 20, anim: "rise", delay: 0.398, dur: 1.92 },
      { type: "emoji", emoji: "🌟", x: 74, y: 16, size: 17, anim: "wiggle", delay: 0.334, dur: 1.23 },
      { type: "emoji", emoji: "🍂", x: 69, y: 21, size: 14, anim: "float", delay: 1.023, dur: 2.01 },
      { type: "emoji", emoji: "✨", x: 38, y: 25, size: 17, anim: "blink", delay: 1.432, dur: 1.23 },
      { type: "emoji", emoji: "⭐", x: 70, y: 51, size: 16, anim: "blink", delay: 0.769, dur: 1.21 }
    ],
  },
  crab_space_4_106: {
    v: 1,
    loop: 2.48,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#c2185b", opacity: 0.39, anim: "wave", dur: 2.04, w: 96.38, h: 18.47 },
      { type: "emoji", emoji: "🦀", x: 33, y: 45, size: 38, anim: "wave", dur: 1.7 },
      { type: "emoji", emoji: "👑", x: 50, y: 14, size: 30, anim: "bounce", delay: 0.406, dur: 1.63 },
      { type: "emoji", emoji: "🍄", x: 72, y: 45, size: 24, anim: "blink", delay: 0.947, dur: 1.51 },
      { type: "emoji", emoji: "🌿", x: 73, y: 32, size: 16, anim: "blink", delay: 1.472, dur: 1.54 },
      { type: "emoji", emoji: "💖", x: 87, y: 62, size: 20, anim: "wiggle", delay: 0.774, dur: 2.32 },
      { type: "emoji", emoji: "🔥", x: 81, y: 16, size: 25, anim: "blink", delay: 1.36, dur: 1.98 },
      { type: "emoji", emoji: "🌟", x: 20, y: 23, size: 10, anim: "blink", delay: 0.995, dur: 1.65 },
      { type: "emoji", emoji: "✨", x: 53, y: 66, size: 13, anim: "blink", delay: 0.516, dur: 1.66 }
    ],
  },
  crab_fantasy_4_107: {
    v: 1,
    loop: 2.19,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 54, y: 53, size: 41, anim: "bounce", dur: 1.38 },
      { type: "emoji", emoji: "🎩", x: 52, y: 11, size: 31, anim: "bounce", delay: 0.459, dur: 1.91 },
      { type: "emoji", emoji: "💎", x: 69, y: 38, size: 22, anim: "float", delay: 0.775, dur: 1.97 },
      { type: "emoji", emoji: "⭐", x: 46, y: 36, size: 19, anim: "float", delay: 1.307, dur: 2.01 },
      { type: "emoji", emoji: "⭐", x: 35, y: 81, size: 17, anim: "wiggle", delay: 1.008, dur: 2.07 },
      { type: "emoji", emoji: "🌊", x: 75, y: 47, size: 21, anim: "wiggle", delay: 0.255, dur: 2.04 },
      { type: "emoji", emoji: "🌟", x: 53, y: 68, size: 15, anim: "blink", delay: 1.724, dur: 1.59 },
      { type: "emoji", emoji: "⭐", x: 79, y: 77, size: 16, anim: "blink", delay: 0.922, dur: 1.92 }
    ],
  },
  crab_office_4_108: {
    v: 1,
    loop: 2.34,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 41, y: 52, size: 36, anim: "wiggle", dur: 1.35 },
      { type: "emoji", emoji: "💌", x: 70, y: 40, size: 27, anim: "blink", delay: 0.687, dur: 1.67 },
      { type: "emoji", emoji: "❤️", x: 80, y: 64, size: 21, anim: "blink", delay: 0.88, dur: 1.59 },
      { type: "emoji", emoji: "⭐", x: 42, y: 26, size: 15, anim: "float", delay: 1.084, dur: 1.77 },
      { type: "emoji", emoji: "❄️", x: 82, y: 63, size: 18, anim: "pop", delay: 0.511, dur: 2.11 },
      { type: "emoji", emoji: "💖", x: 40, y: 69, size: 20, anim: "float", delay: 1.143, dur: 2.32 },
      { type: "emoji", emoji: "⭐", x: 80, y: 70, size: 15, anim: "blink", delay: 0.63, dur: 1.75 },
      { type: "emoji", emoji: "🌟", x: 50, y: 66, size: 19, anim: "blink", delay: 1.491, dur: 1.84 }
    ],
  },
  crab_fitness_4_109: {
    v: 1,
    loop: 3.97,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#303f9f", opacity: 0.45, anim: "breathe", dur: 3.52, w: 91.46, h: 25.43 },
      { type: "emoji", emoji: "🦀", x: 53, y: 48, size: 36, anim: "breathe", dur: 3.48 },
      { type: "emoji", emoji: "🎭", x: 51, y: 28, size: 28, anim: "bounce", delay: 0.504, dur: 2 },
      { type: "emoji", emoji: "💖", x: 54, y: 26, size: 18, anim: "wiggle", delay: 0.841, dur: 1.21 },
      { type: "emoji", emoji: "✨", x: 48, y: 43, size: 17, anim: "pop", delay: 0.715, dur: 1.31 },
      { type: "emoji", emoji: "🎈", x: 65, y: 40, size: 19, anim: "pop", delay: 1.195, dur: 1.47 },
      { type: "emoji", emoji: "🌊", x: 68, y: 75, size: 15, anim: "wiggle", delay: 0.784, dur: 1.65 },
      { type: "emoji", emoji: "💖", x: 16, y: 63, size: 14, anim: "blink", delay: 1.746, dur: 1.49 },
      { type: "emoji", emoji: "🌟", x: 40, y: 57, size: 11, anim: "blink", delay: 0.802, dur: 1.78 }
    ],
  },
  crab_travel_4_110: {
    v: 1,
    loop: 2.81,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff3e0", opacity: 0.55, anim: "pulse", dur: 1.95, w: 108.31, h: 21.23 },
      { type: "emoji", emoji: "🦀", x: 62, y: 50, size: 38, anim: "pulse", dur: 2.11 },
      { type: "emoji", emoji: "🔥", x: 22, y: 31, size: 25, anim: "wiggle", delay: 0.856, dur: 2.33 },
      { type: "emoji", emoji: "🍃", x: 52, y: 75, size: 21, anim: "pop", delay: 1.226, dur: 1.52 },
      { type: "emoji", emoji: "💖", x: 54, y: 58, size: 19, anim: "blink", delay: 0.718, dur: 1.9 },
      { type: "emoji", emoji: "💫", x: 23, y: 56, size: 18, anim: "blink", delay: 1.196, dur: 1.46 }
    ],
  },
  crab_art_4_111: {
    v: 1,
    loop: 2.25,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#81d4fa", opacity: 0.53, anim: "pulse", dur: 2.22, w: 106.61, h: 23.61 },
      { type: "emoji", emoji: "🦀", x: 55, y: 50, size: 44, anim: "pulse", dur: 2.11 },
      { type: "emoji", emoji: "⭐", x: 67, y: 28, size: 25, anim: "blink", delay: 0.7, dur: 1.81 },
      { type: "emoji", emoji: "💖", x: 62, y: 54, size: 16, anim: "rise", delay: 0.571, dur: 1.48 },
      { type: "emoji", emoji: "⭐", x: 62, y: 30, size: 18, anim: "blink", delay: 0.82, dur: 1.83 },
      { type: "emoji", emoji: "✨", x: 62, y: 63, size: 16, anim: "blink", delay: 1.72, dur: 1.34 }
    ],
  },
  crab_science_4_112: {
    v: 1,
    loop: 2.84,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 51, y: 49, size: 38, anim: "float", dur: 2.68 },
      { type: "emoji", emoji: "🪖", x: 48, y: 18, size: 31, anim: "bounce", delay: 0.41, dur: 1.56 },
      { type: "emoji", emoji: "🎊", x: 18, y: 25, size: 22, anim: "blink", delay: 0.132, dur: 1.42 },
      { type: "emoji", emoji: "🔥", x: 84, y: 13, size: 16, anim: "rise", delay: 0.087, dur: 1.66 },
      { type: "emoji", emoji: "🌊", x: 50, y: 62, size: 12, anim: "pop", delay: 0.44, dur: 2.11 },
      { type: "emoji", emoji: "🌿", x: 61, y: 41, size: 14, anim: "rise", delay: 1.495, dur: 1.43 },
      { type: "emoji", emoji: "🍂", x: 57, y: 18, size: 22, anim: "wiggle", delay: 0.054, dur: 1.9 },
      { type: "emoji", emoji: "💖", x: 79, y: 26, size: 19, anim: "blink", delay: 0.889, dur: 1.9 },
      { type: "emoji", emoji: "⭐", x: 68, y: 15, size: 15, anim: "blink", delay: 1.715, dur: 1.03 }
    ],
  },
  crab_pets_4_113: {
    v: 1,
    loop: 3.59,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#c8e6c9", opacity: 0.37, anim: "settle", dur: 2.93, r: 41.23 },
      { type: "emoji", emoji: "🦀", x: 50, y: 47, size: 40, anim: "settle", dur: 3.05 },
      { type: "emoji", emoji: "🍫", x: 72, y: 42, size: 26, anim: "pop", delay: 0.932, dur: 1.63 },
      { type: "emoji", emoji: "🎈", x: 73, y: 28, size: 13, anim: "rise", delay: 0.927, dur: 1.32 },
      { type: "emoji", emoji: "🍃", x: 22, y: 18, size: 20, anim: "pop", delay: 0.294, dur: 1.83 },
      { type: "emoji", emoji: "💖", x: 81, y: 41, size: 15, anim: "blink", delay: 1.319, dur: 1.21 },
      { type: "emoji", emoji: "💖", x: 71, y: 18, size: 12, anim: "blink", delay: 1.875, dur: 1.32 }
    ],
  },
  crab_magic_4_114: {
    v: 1,
    loop: 2.24,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 35, y: 55, size: 35, anim: "bounce", dur: 1.22 },
      { type: "emoji", emoji: "🎩", x: 48, y: 13, size: 31, anim: "bounce", delay: 0.694, dur: 1.83 },
      { type: "emoji", emoji: "🍄", x: 71, y: 46, size: 27, anim: "blink", delay: 0.556, dur: 1.99 },
      { type: "emoji", emoji: "🌟", x: 20, y: 78, size: 25, anim: "pop", delay: 0.859, dur: 1.94 },
      { type: "emoji", emoji: "🎉", x: 28, y: 57, size: 15, anim: "blink", delay: 1.034, dur: 1.75 },
      { type: "emoji", emoji: "🍂", x: 11, y: 59, size: 14, anim: "pop", delay: 0.889, dur: 1.74 },
      { type: "emoji", emoji: "💫", x: 30, y: 46, size: 24, anim: "pop", delay: 1.188, dur: 2.24 },
      { type: "emoji", emoji: "🌟", x: 30, y: 20, size: 18, anim: "blink", delay: 1.008, dur: 1.48 },
      { type: "emoji", emoji: "💖", x: 27, y: 48, size: 18, anim: "blink", delay: 1.448, dur: 1.57 }
    ],
  },
  crab_retro_4_115: {
    v: 1,
    loop: 2.86,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fbe9e7", opacity: 0.45, anim: "twinkle", dur: 2.5, w: 90.17, h: 26.95 },
      { type: "emoji", emoji: "🦀", x: 36, y: 54, size: 42, anim: "twinkle", dur: 2.52 },
      { type: "emoji", emoji: "🎈", x: 73, y: 30, size: 26, anim: "blink", delay: 0.98, dur: 1.64 },
      { type: "emoji", emoji: "❄️", x: 52, y: 24, size: 15, anim: "rise", delay: 1.322, dur: 1.27 },
      { type: "emoji", emoji: "⭐", x: 71, y: 35, size: 17, anim: "pop", delay: 0.866, dur: 2.07 },
      { type: "emoji", emoji: "🌟", x: 73, y: 24, size: 17, anim: "pop", delay: 0.68, dur: 2.2 },
      { type: "emoji", emoji: "🎉", x: 20, y: 20, size: 25, anim: "pop", delay: 0.85, dur: 2.35 },
      { type: "emoji", emoji: "⭐", x: 20, y: 59, size: 11, anim: "blink", delay: 1.281, dur: 1.94 },
      { type: "emoji", emoji: "💫", x: 51, y: 42, size: 11, anim: "blink", delay: 1.335, dur: 1.44 }
    ],
  },
  crab_cyber_4_116: {
    v: 1,
    loop: 3.26,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#f06292", opacity: 0.55, anim: "float", dur: 3.13, w: 90, h: 26.74 },
      { type: "emoji", emoji: "🦀", x: 61, y: 52, size: 40, anim: "float", dur: 3.06 },
      { type: "emoji", emoji: "🧢", x: 50, y: 15, size: 30, anim: "bounce", delay: 0.641, dur: 1.55 },
      { type: "emoji", emoji: "💌", x: 70, y: 41, size: 27, anim: "float", delay: 0.99, dur: 1.57 },
      { type: "emoji", emoji: "🌊", x: 65, y: 34, size: 16, anim: "float", delay: 0.821, dur: 1.27 },
      { type: "emoji", emoji: "💫", x: 58, y: 31, size: 17, anim: "pop", delay: 0.86, dur: 1.92 },
      { type: "emoji", emoji: "🌟", x: 41, y: 51, size: 17, anim: "float", delay: 0.572, dur: 1.58 },
      { type: "emoji", emoji: "🔥", x: 18, y: 38, size: 19, anim: "float", delay: 0.339, dur: 1.72 },
      { type: "emoji", emoji: "💖", x: 23, y: 54, size: 10, anim: "blink", delay: 1.951, dur: 1.61 },
      { type: "emoji", emoji: "🌟", x: 84, y: 37, size: 13, anim: "blink", delay: 1.241, dur: 1.01 }
    ],
  },
  crab_nature_4_117: {
    v: 1,
    loop: 2.31,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 31, y: 51, size: 42, anim: "pop", dur: 1.64 },
      { type: "emoji", emoji: "🎁", x: 69, y: 41, size: 25, anim: "float", delay: 0.416, dur: 1.86 },
      { type: "emoji", emoji: "⭐", x: 28, y: 68, size: 17, anim: "wiggle", delay: 0.144, dur: 2.21 },
      { type: "emoji", emoji: "🎉", x: 10, y: 68, size: 12, anim: "wiggle", delay: 0.005, dur: 2.24 },
      { type: "emoji", emoji: "❤️", x: 68, y: 64, size: 24, anim: "blink", delay: 1.436, dur: 2.37 },
      { type: "emoji", emoji: "⭐", x: 41, y: 52, size: 16, anim: "blink", delay: 0.607, dur: 1.9 },
      { type: "emoji", emoji: "✨", x: 47, y: 48, size: 15, anim: "blink", delay: 1.954, dur: 1.88 }
    ],
  },
  crab_underwater_4_118: {
    v: 1,
    loop: 2.91,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 68, y: 45, size: 35, anim: "heartbeat", dur: 2.59 },
      { type: "emoji", emoji: "🎩", x: 49, y: 12, size: 30, anim: "bounce", delay: 0.647, dur: 2 },
      { type: "emoji", emoji: "💖", x: 36, y: 72, size: 22, anim: "pop", delay: 0.601, dur: 1.75 },
      { type: "emoji", emoji: "🌊", x: 76, y: 65, size: 24, anim: "rise", delay: 0.818, dur: 1.51 },
      { type: "emoji", emoji: "🎉", x: 12, y: 54, size: 21, anim: "pop", delay: 0.124, dur: 1.64 },
      { type: "emoji", emoji: "✨", x: 46, y: 75, size: 10, anim: "blink", delay: 1.893, dur: 1.42 },
      { type: "emoji", emoji: "🌟", x: 83, y: 21, size: 13, anim: "blink", delay: 1.325, dur: 1.11 }
    ],
  },
  crab_sky_4_119: {
    v: 1,
    loop: 4.16,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#7986cb", opacity: 0.57, anim: "float", dur: 3.75, r: 43.63 },
      { type: "emoji", emoji: "🦀", x: 55, y: 52, size: 42, anim: "float", dur: 3.59 },
      { type: "emoji", emoji: "👒", x: 48, y: 15, size: 35, anim: "bounce", delay: 0.331, dur: 1.67 },
      { type: "emoji", emoji: "⭐", x: 51, y: 54, size: 18, anim: "blink", delay: 0.087, dur: 1.42 },
      { type: "emoji", emoji: "⭐", x: 36, y: 66, size: 25, anim: "float", delay: 0.89, dur: 1.76 },
      { type: "emoji", emoji: "✨", x: 52, y: 21, size: 18, anim: "blink", delay: 1.521, dur: 1.31 },
      { type: "emoji", emoji: "💖", x: 71, y: 78, size: 14, anim: "blink", delay: 1.021, dur: 1.08 }
    ],
  },
  crab_party_5_120: {
    v: 1,
    loop: 3.08,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ffe6e6", opacity: 0.38, anim: "float", dur: 3.16, w: 96.21, h: 19.07 },
      { type: "emoji", emoji: "🦀", x: 42, y: 55, size: 42, anim: "float", dur: 3.1 },
      { type: "emoji", emoji: "🧢", x: 51, y: 14, size: 28, anim: "bounce", delay: 0.552, dur: 1.98 },
      { type: "emoji", emoji: "🍀", x: 73, y: 44, size: 22, anim: "blink", delay: 0.742, dur: 1.69 },
      { type: "emoji", emoji: "🌿", x: 59, y: 58, size: 12, anim: "pop", delay: 0.068, dur: 1.97 },
      { type: "emoji", emoji: "💫", x: 38, y: 38, size: 18, anim: "rise", delay: 0.347, dur: 1.36 },
      { type: "emoji", emoji: "💫", x: 45, y: 34, size: 11, anim: "blink", delay: 0.751, dur: 1.21 },
      { type: "emoji", emoji: "✨", x: 34, y: 26, size: 11, anim: "blink", delay: 1.401, dur: 1.18 }
    ],
  },
  crab_beach_5_121: {
    v: 1,
    loop: 2.72,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#b3e5fc", opacity: 0.52, anim: "wave", dur: 1.63, w: 107.35, h: 23.75 },
      { type: "emoji", emoji: "🦀", x: 64, y: 48, size: 34, anim: "wave", dur: 1.82 },
      { type: "emoji", emoji: "💝", x: 70, y: 40, size: 27, anim: "rise", delay: 0.897, dur: 1.62 },
      { type: "emoji", emoji: "🍂", x: 27, y: 16, size: 17, anim: "rise", delay: 1.167, dur: 1.34 },
      { type: "emoji", emoji: "❄️", x: 34, y: 19, size: 17, anim: "blink", delay: 0.267, dur: 1.84 },
      { type: "emoji", emoji: "💖", x: 78, y: 70, size: 21, anim: "wiggle", delay: 1.353, dur: 2.24 },
      { type: "emoji", emoji: "🔥", x: 70, y: 87, size: 23, anim: "float", delay: 1.23, dur: 1.51 },
      { type: "emoji", emoji: "🌊", x: 57, y: 22, size: 12, anim: "rise", delay: 1.263, dur: 1.84 },
      { type: "emoji", emoji: "⭐", x: 62, y: 17, size: 12, anim: "blink", delay: 1.428, dur: 1.12 },
      { type: "emoji", emoji: "✨", x: 31, y: 64, size: 11, anim: "blink", delay: 0.85, dur: 1.11 }
    ],
  },
  crab_winter_5_122: {
    v: 1,
    loop: 1.75,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 48, y: 52, size: 41, anim: "bounce", dur: 1.61 },
      { type: "emoji", emoji: "🎁", x: 73, y: 42, size: 26, anim: "blink", delay: 0.964, dur: 1.64 },
      { type: "emoji", emoji: "🔥", x: 34, y: 82, size: 22, anim: "rise", delay: 0.972, dur: 2.33 },
      { type: "emoji", emoji: "🎊", x: 33, y: 42, size: 17, anim: "float", delay: 1.453, dur: 2.2 },
      { type: "emoji", emoji: "⭐", x: 46, y: 79, size: 16, anim: "blink", delay: 1.812, dur: 1.02 },
      { type: "emoji", emoji: "✨", x: 54, y: 56, size: 13, anim: "blink", delay: 1.012, dur: 1.85 }
    ],
  },
  crab_spring_5_123: {
    v: 1,
    loop: 2.06,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#4caf50", opacity: 0.68, anim: "wiggle", dur: 1.57, w: 103.43, h: 25.67 },
      { type: "emoji", emoji: "🦀", x: 49, y: 54, size: 41, anim: "wiggle", dur: 1.53 },
      { type: "emoji", emoji: "🪖", x: 51, y: 14, size: 31, anim: "bounce", delay: 0.367, dur: 1.53 },
      { type: "emoji", emoji: "🍂", x: 79, y: 58, size: 13, anim: "blink", delay: 1.376, dur: 1.32 },
      { type: "emoji", emoji: "🌸", x: 79, y: 10, size: 17, anim: "pop", delay: 0.308, dur: 1.99 },
      { type: "emoji", emoji: "🎉", x: 17, y: 48, size: 15, anim: "rise", delay: 0.073, dur: 1.65 },
      { type: "emoji", emoji: "✨", x: 73, y: 11, size: 19, anim: "wiggle", delay: 1.35, dur: 1.94 },
      { type: "emoji", emoji: "✨", x: 73, y: 57, size: 16, anim: "blink", delay: 1.355, dur: 1.08 },
      { type: "emoji", emoji: "🌟", x: 48, y: 64, size: 14, anim: "blink", delay: 0.516, dur: 1.98 }
    ],
  },
  crab_halloween_5_124: {
    v: 1,
    loop: 3.83,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#7e57c2", opacity: 0.45, anim: "breathe", dur: 3.5, w: 91.99, h: 26.76 },
      { type: "emoji", emoji: "🦀", x: 37, y: 46, size: 39, anim: "breathe", dur: 3.39 },
      { type: "emoji", emoji: "👮", x: 49, y: 16, size: 31, anim: "bounce", delay: 0.419, dur: 1.76 },
      { type: "emoji", emoji: "❤️", x: 33, y: 46, size: 15, anim: "float", delay: 0.874, dur: 1.82 },
      { type: "emoji", emoji: "🌿", x: 26, y: 69, size: 23, anim: "rise", delay: 1.434, dur: 2 },
      { type: "emoji", emoji: "🔥", x: 47, y: 25, size: 12, anim: "pop", delay: 1.149, dur: 1.32 },
      { type: "emoji", emoji: "🎊", x: 51, y: 51, size: 14, anim: "blink", delay: 1.007, dur: 1.66 },
      { type: "emoji", emoji: "🎊", x: 88, y: 77, size: 19, anim: "rise", delay: 0.842, dur: 2.34 },
      { type: "emoji", emoji: "💫", x: 57, y: 41, size: 18, anim: "blink", delay: 1.987, dur: 1.28 },
      { type: "emoji", emoji: "💫", x: 53, y: 43, size: 19, anim: "blink", delay: 1.29, dur: 1.03 }
    ],
  },
  crab_christmas_5_125: {
    v: 1,
    loop: 2.73,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 59, y: 54, size: 34, anim: "pulse", dur: 2.07 },
      { type: "emoji", emoji: "👑", x: 48, y: 15, size: 29, anim: "bounce", delay: 0.347, dur: 1.6 },
      { type: "emoji", emoji: "🍪", x: 72, y: 43, size: 22, anim: "float", delay: 0.714, dur: 1.46 },
      { type: "emoji", emoji: "❤️", x: 37, y: 62, size: 16, anim: "blink", delay: 0.077, dur: 2.25 },
      { type: "emoji", emoji: "🍃", x: 64, y: 43, size: 16, anim: "float", delay: 0.394, dur: 1.74 },
      { type: "emoji", emoji: "💫", x: 35, y: 42, size: 11, anim: "blink", delay: 0.629, dur: 1.25 },
      { type: "emoji", emoji: "⭐", x: 72, y: 73, size: 17, anim: "blink", delay: 1.799, dur: 1.88 }
    ],
  },
  crab_coding_5_126: {
    v: 1,
    loop: 2.27,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#c2185b", opacity: 0.43, anim: "pulse", dur: 2.06, r: 44.99 },
      { type: "emoji", emoji: "🦀", x: 70, y: 52, size: 34, anim: "pulse", dur: 2.24 },
      { type: "emoji", emoji: "🎭", x: 49, y: 29, size: 26, anim: "bounce", delay: 0.488, dur: 1.99 },
      { type: "emoji", emoji: "🎈", x: 73, y: 31, size: 27, anim: "pop", delay: 0.483, dur: 1.56 },
      { type: "emoji", emoji: "🌟", x: 36, y: 58, size: 25, anim: "rise", delay: 1.131, dur: 1.97 },
      { type: "emoji", emoji: "🎈", x: 38, y: 18, size: 17, anim: "wiggle", delay: 1.408, dur: 2.18 },
      { type: "emoji", emoji: "🌿", x: 32, y: 52, size: 16, anim: "wiggle", delay: 0.179, dur: 2.34 },
      { type: "emoji", emoji: "🌟", x: 58, y: 28, size: 10, anim: "blink", delay: 1.554, dur: 1.41 },
      { type: "emoji", emoji: "✨", x: 69, y: 82, size: 15, anim: "blink", delay: 1.154, dur: 1.11 }
    ],
  },
  crab_music_5_127: {
    v: 1,
    loop: 2.98,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#8e24aa", opacity: 0.51, anim: "float", dur: 2.6, r: 40.74 },
      { type: "emoji", emoji: "🦀", x: 56, y: 50, size: 39, anim: "float", dur: 2.92 },
      { type: "emoji", emoji: "⭐", x: 12, y: 48, size: 15, anim: "pop", delay: 1.354, dur: 2.18 },
      { type: "emoji", emoji: "⭐", x: 75, y: 63, size: 16, anim: "pop", delay: 0.204, dur: 1.93 },
      { type: "emoji", emoji: "💖", x: 17, y: 42, size: 15, anim: "blink", delay: 1.234, dur: 1.95 },
      { type: "emoji", emoji: "✨", x: 54, y: 63, size: 18, anim: "blink", delay: 1.624, dur: 1.31 }
    ],
  },
  crab_sports_5_128: {
    v: 1,
    loop: 3.35,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fdd835", opacity: 0.57, anim: "settle", dur: 3.23, r: 40.52 },
      { type: "emoji", emoji: "🦀", x: 63, y: 56, size: 37, anim: "settle", dur: 2.96 },
      { type: "emoji", emoji: "🎈", x: 82, y: 53, size: 17, anim: "pop", delay: 0.364, dur: 1.91 },
      { type: "emoji", emoji: "💖", x: 30, y: 35, size: 17, anim: "float", delay: 1.076, dur: 1.36 },
      { type: "emoji", emoji: "🎈", x: 31, y: 54, size: 14, anim: "pop", delay: 0.801, dur: 2.2 },
      { type: "emoji", emoji: "💫", x: 46, y: 58, size: 14, anim: "blink", delay: 0.512, dur: 1.33 },
      { type: "emoji", emoji: "🌟", x: 81, y: 74, size: 10, anim: "blink", delay: 0.945, dur: 1.96 }
    ],
  },
  crab_food_5_129: {
    v: 1,
    loop: 2.22,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#5c6bc0", opacity: 0.53, anim: "bounce", dur: 1.41, r: 41.88 },
      { type: "emoji", emoji: "🦀", x: 42, y: 46, size: 41, anim: "bounce", dur: 1.19 },
      { type: "emoji", emoji: "🤠", x: 48, y: 14, size: 33, anim: "bounce", delay: 0.618, dur: 1.55 },
      { type: "emoji", emoji: "🍀", x: 72, y: 41, size: 24, anim: "rise", delay: 0.594, dur: 1.43 },
      { type: "emoji", emoji: "🔥", x: 76, y: 41, size: 17, anim: "blink", delay: 0.087, dur: 1.42 },
      { type: "emoji", emoji: "🌟", x: 35, y: 40, size: 13, anim: "float", delay: 0.891, dur: 1.56 },
      { type: "emoji", emoji: "❄️", x: 35, y: 28, size: 12, anim: "float", delay: 0.304, dur: 1.97 },
      { type: "emoji", emoji: "🌊", x: 26, y: 29, size: 22, anim: "wiggle", delay: 1.292, dur: 2.33 },
      { type: "emoji", emoji: "🌟", x: 47, y: 42, size: 13, anim: "pop", delay: 1.495, dur: 1.41 },
      { type: "emoji", emoji: "💫", x: 22, y: 50, size: 12, anim: "blink", delay: 1.123, dur: 1.81 },
      { type: "emoji", emoji: "⭐", x: 16, y: 49, size: 16, anim: "blink", delay: 1.972, dur: 1.39 }
    ],
  },
  crab_space_5_130: {
    v: 1,
    loop: 2.89,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e6f7ff", opacity: 0.4, anim: "twinkle", dur: 2.58, r: 43.32 },
      { type: "emoji", emoji: "🦀", x: 38, y: 54, size: 41, anim: "twinkle", dur: 2.44 },
      { type: "emoji", emoji: "👒", x: 49, y: 14, size: 35, anim: "bounce", delay: 0.613, dur: 1.93 },
      { type: "emoji", emoji: "🌊", x: 20, y: 30, size: 24, anim: "float", delay: 0.566, dur: 1.56 },
      { type: "emoji", emoji: "❤️", x: 89, y: 55, size: 25, anim: "blink", delay: 0.342, dur: 1.26 },
      { type: "emoji", emoji: "✨", x: 69, y: 30, size: 24, anim: "wiggle", delay: 0.248, dur: 2.11 },
      { type: "emoji", emoji: "⭐", x: 15, y: 52, size: 11, anim: "blink", delay: 1.137, dur: 1.77 },
      { type: "emoji", emoji: "✨", x: 75, y: 49, size: 18, anim: "blink", delay: 1.107, dur: 1.35 }
    ],
  },
  crab_fantasy_5_131: {
    v: 1,
    loop: 3.23,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#29b6f6", opacity: 0.66, anim: "float", dur: 2.91, w: 93.85, h: 22.46 },
      { type: "emoji", emoji: "🦀", x: 49, y: 47, size: 43, anim: "float", dur: 2.99 },
      { type: "emoji", emoji: "✨", x: 80, y: 40, size: 14, anim: "pop", delay: 1.049, dur: 2.07 },
      { type: "emoji", emoji: "🌊", x: 36, y: 76, size: 12, anim: "blink", delay: 0.8, dur: 1.36 },
      { type: "emoji", emoji: "❤️", x: 75, y: 25, size: 18, anim: "wiggle", delay: 0.798, dur: 1.68 },
      { type: "emoji", emoji: "💫", x: 55, y: 87, size: 19, anim: "wiggle", delay: 0.861, dur: 1.78 },
      { type: "emoji", emoji: "🔥", x: 68, y: 65, size: 24, anim: "pop", delay: 0.624, dur: 1.96 },
      { type: "emoji", emoji: "⭐", x: 69, y: 24, size: 16, anim: "blink", delay: 1.637, dur: 1.61 },
      { type: "emoji", emoji: "💫", x: 48, y: 58, size: 17, anim: "blink", delay: 1.726, dur: 1.88 }
    ],
  },
  crab_office_5_132: {
    v: 1,
    loop: 2.27,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f57c00", opacity: 0.67, anim: "pop", dur: 1.61, r: 45.86 },
      { type: "emoji", emoji: "🦀", x: 70, y: 46, size: 34, anim: "pop", dur: 1.46 },
      { type: "emoji", emoji: "🍰", x: 67, y: 42, size: 27, anim: "float", delay: 0.607, dur: 1.64 },
      { type: "emoji", emoji: "⭐", x: 33, y: 85, size: 23, anim: "wiggle", delay: 0.917, dur: 1.48 },
      { type: "emoji", emoji: "⭐", x: 76, y: 19, size: 25, anim: "rise", delay: 1.065, dur: 2.26 },
      { type: "emoji", emoji: "🍂", x: 11, y: 72, size: 12, anim: "pop", delay: 0.422, dur: 1.69 },
      { type: "emoji", emoji: "🌸", x: 45, y: 85, size: 18, anim: "pop", delay: 0.216, dur: 1.22 },
      { type: "emoji", emoji: "💖", x: 15, y: 37, size: 10, anim: "blink", delay: 0.79, dur: 1.96 },
      { type: "emoji", emoji: "🌟", x: 21, y: 24, size: 14, anim: "blink", delay: 0.889, dur: 1.7 }
    ],
  },
  crab_fitness_5_133: {
    v: 1,
    loop: 2.79,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 47, y: 52, size: 40, anim: "heartbeat", dur: 2.51 },
      { type: "emoji", emoji: "🤠", x: 51, y: 13, size: 33, anim: "bounce", delay: 0.458, dur: 1.67 },
      { type: "emoji", emoji: "🌸", x: 71, y: 61, size: 20, anim: "pop", delay: 1.26, dur: 1.3 },
      { type: "emoji", emoji: "🌿", x: 28, y: 57, size: 24, anim: "float", delay: 0.983, dur: 1.32 },
      { type: "emoji", emoji: "🍃", x: 89, y: 79, size: 19, anim: "rise", delay: 1.163, dur: 2.17 },
      { type: "emoji", emoji: "🎉", x: 65, y: 42, size: 17, anim: "blink", delay: 0.735, dur: 2.13 },
      { type: "emoji", emoji: "💖", x: 27, y: 18, size: 15, anim: "blink", delay: 0.888, dur: 1.82 },
      { type: "emoji", emoji: "🌟", x: 39, y: 84, size: 13, anim: "blink", delay: 0.765, dur: 1.32 }
    ],
  },
  crab_travel_5_134: {
    v: 1,
    loop: 4.13,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#d1c4e9", opacity: 0.64, anim: "float", dur: 3.62, w: 97.83, h: 18.98 },
      { type: "emoji", emoji: "🦀", x: 65, y: 55, size: 35, anim: "float", dur: 3.4 },
      { type: "emoji", emoji: "🍩", x: 69, y: 44, size: 25, anim: "float", delay: 0.819, dur: 1.96 },
      { type: "emoji", emoji: "💖", x: 81, y: 42, size: 25, anim: "blink", delay: 0.699, dur: 1.35 },
      { type: "emoji", emoji: "💖", x: 57, y: 22, size: 13, anim: "rise", delay: 1.334, dur: 1.98 },
      { type: "emoji", emoji: "✨", x: 48, y: 44, size: 14, anim: "blink", delay: 1.034, dur: 1.18 },
      { type: "emoji", emoji: "💫", x: 75, y: 81, size: 10, anim: "blink", delay: 1.487, dur: 1.15 }
    ],
  },
  crab_art_5_135: {
    v: 1,
    loop: 2.84,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ff5722", opacity: 0.64, anim: "float", dur: 2.86, w: 99.21, h: 22.27 },
      { type: "emoji", emoji: "🦀", x: 63, y: 50, size: 39, anim: "float", dur: 3.07 },
      { type: "emoji", emoji: "🧢", x: 52, y: 15, size: 30, anim: "bounce", delay: 0.488, dur: 1.79 },
      { type: "emoji", emoji: "🍃", x: 80, y: 70, size: 16, anim: "blink", delay: 0.814, dur: 1.64 },
      { type: "emoji", emoji: "🔥", x: 10, y: 87, size: 17, anim: "rise", delay: 0.505, dur: 1.95 },
      { type: "emoji", emoji: "❤️", x: 17, y: 12, size: 12, anim: "rise", delay: 1.285, dur: 2.06 },
      { type: "emoji", emoji: "❄️", x: 69, y: 81, size: 15, anim: "rise", delay: 0.029, dur: 1.83 },
      { type: "emoji", emoji: "🎉", x: 67, y: 27, size: 19, anim: "blink", delay: 1.04, dur: 1.92 },
      { type: "emoji", emoji: "💖", x: 70, y: 77, size: 18, anim: "blink", delay: 1.532, dur: 1.69 },
      { type: "emoji", emoji: "💫", x: 32, y: 16, size: 11, anim: "blink", delay: 1.518, dur: 1.29 }
    ],
  },
  crab_science_5_136: {
    v: 1,
    loop: 2.61,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#f48fb1", opacity: 0.47, anim: "wave", dur: 2, w: 105.29, h: 22.12 },
      { type: "emoji", emoji: "🦀", x: 32, y: 47, size: 36, anim: "wave", dur: 1.95 },
      { type: "emoji", emoji: "🧢", x: 49, y: 18, size: 31, anim: "bounce", delay: 0.407, dur: 1.71 },
      { type: "emoji", emoji: "🍪", x: 71, y: 42, size: 23, anim: "rise", delay: 0.671, dur: 1.95 },
      { type: "emoji", emoji: "💖", x: 73, y: 27, size: 24, anim: "blink", delay: 0.59, dur: 2.25 },
      { type: "emoji", emoji: "❤️", x: 24, y: 32, size: 12, anim: "blink", delay: 0.788, dur: 2.07 },
      { type: "emoji", emoji: "💫", x: 26, y: 22, size: 16, anim: "blink", delay: 0.982, dur: 1.95 },
      { type: "emoji", emoji: "⭐", x: 27, y: 83, size: 10, anim: "blink", delay: 0.877, dur: 1.41 }
    ],
  },
  crab_pets_5_137: {
    v: 1,
    loop: 2.11,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#8e24aa", opacity: 0.36, anim: "bounce", dur: 1.68, w: 94.37, h: 25.44 },
      { type: "emoji", emoji: "🦀", x: 58, y: 46, size: 35, anim: "bounce", dur: 1.5 },
      { type: "emoji", emoji: "🎈", x: 58, y: 36, size: 19, anim: "wiggle", delay: 0.051, dur: 1.33 },
      { type: "emoji", emoji: "🔥", x: 52, y: 59, size: 24, anim: "wiggle", delay: 0.484, dur: 2.3 },
      { type: "emoji", emoji: "🎉", x: 44, y: 36, size: 23, anim: "wiggle", delay: 0.613, dur: 1.87 },
      { type: "emoji", emoji: "❤️", x: 68, y: 67, size: 14, anim: "blink", delay: 0.568, dur: 1.2 },
      { type: "emoji", emoji: "💫", x: 21, y: 53, size: 18, anim: "blink", delay: 1.52, dur: 1.85 },
      { type: "emoji", emoji: "💖", x: 32, y: 44, size: 14, anim: "blink", delay: 1.741, dur: 1.39 }
    ],
  },
  crab_magic_5_138: {
    v: 1,
    loop: 2.19,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fbc02d", opacity: 0.61, anim: "wiggle", dur: 1.44, r: 49.99 },
      { type: "emoji", emoji: "🦀", x: 32, y: 51, size: 37, anim: "wiggle", dur: 1.33 },
      { type: "emoji", emoji: "🌸", x: 18, y: 42, size: 20, anim: "rise", delay: 0.17, dur: 1.92 },
      { type: "emoji", emoji: "🌟", x: 78, y: 21, size: 14, anim: "blink", delay: 1.259, dur: 1.91 },
      { type: "emoji", emoji: "💖", x: 82, y: 65, size: 13, anim: "blink", delay: 1.789, dur: 1.07 }
    ],
  },
  crab_retro_5_139: {
    v: 1,
    loop: 3.8,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#c5cae9", opacity: 0.41, anim: "breathe", dur: 3.71, w: 91.61, h: 19.93 },
      { type: "emoji", emoji: "🦀", x: 37, y: 48, size: 35, anim: "breathe", dur: 3.44 },
      { type: "emoji", emoji: "🎁", x: 71, y: 43, size: 24, anim: "blink", delay: 0.83, dur: 1.93 },
      { type: "emoji", emoji: "🌸", x: 64, y: 51, size: 12, anim: "rise", delay: 0.177, dur: 1.49 },
      { type: "emoji", emoji: "❤️", x: 73, y: 39, size: 24, anim: "blink", delay: 0.126, dur: 2.01 },
      { type: "emoji", emoji: "💖", x: 26, y: 40, size: 10, anim: "blink", delay: 1.752, dur: 1.57 },
      { type: "emoji", emoji: "💫", x: 20, y: 68, size: 15, anim: "blink", delay: 1.755, dur: 1.33 }
    ],
  },
  crab_cyber_5_140: {
    v: 1,
    loop: 2.74,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff3e0", opacity: 0.52, anim: "pulse", dur: 1.87, w: 109.77, h: 27.46 },
      { type: "emoji", emoji: "🦀", x: 68, y: 44, size: 40, anim: "pulse", dur: 2.08 },
      { type: "emoji", emoji: "👮", x: 49, y: 15, size: 29, anim: "bounce", delay: 0.661, dur: 1.71 },
      { type: "emoji", emoji: "💫", x: 31, y: 76, size: 22, anim: "float", delay: 0.68, dur: 1.76 },
      { type: "emoji", emoji: "🌊", x: 37, y: 77, size: 25, anim: "blink", delay: 0.435, dur: 2.05 },
      { type: "emoji", emoji: "💖", x: 24, y: 54, size: 11, anim: "blink", delay: 1.056, dur: 1.48 },
      { type: "emoji", emoji: "🌟", x: 68, y: 34, size: 12, anim: "blink", delay: 0.599, dur: 1.18 }
    ],
  },
  crab_nature_5_141: {
    v: 1,
    loop: 2.55,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#29b6f6", opacity: 0.36, anim: "pulse", dur: 2.32, r: 47.35 },
      { type: "emoji", emoji: "🦀", x: 36, y: 51, size: 37, anim: "pulse", dur: 2.32 },
      { type: "emoji", emoji: "🧙", x: 50, y: 12, size: 33, anim: "bounce", delay: 0.621, dur: 1.62 },
      { type: "emoji", emoji: "🌟", x: 47, y: 74, size: 21, anim: "rise", delay: 0.932, dur: 2.36 },
      { type: "emoji", emoji: "🎈", x: 10, y: 35, size: 22, anim: "pop", delay: 0.904, dur: 1.57 },
      { type: "emoji", emoji: "❄️", x: 65, y: 43, size: 17, anim: "blink", delay: 1.495, dur: 1.26 },
      { type: "emoji", emoji: "🎊", x: 85, y: 79, size: 21, anim: "blink", delay: 1.052, dur: 1.68 },
      { type: "emoji", emoji: "🌟", x: 76, y: 51, size: 12, anim: "blink", delay: 1.862, dur: 1.71 },
      { type: "emoji", emoji: "✨", x: 32, y: 67, size: 18, anim: "blink", delay: 0.769, dur: 1.88 }
    ],
  },
  crab_underwater_5_142: {
    v: 1,
    loop: 3.06,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f57c00", opacity: 0.41, anim: "float", dur: 2.85, w: 100.51, h: 21.9 },
      { type: "emoji", emoji: "🦀", x: 36, y: 50, size: 41, anim: "float", dur: 2.82 },
      { type: "emoji", emoji: "🎭", x: 51, y: 30, size: 29, anim: "bounce", delay: 0.434, dur: 1.69 },
      { type: "emoji", emoji: "🍦", x: 70, y: 42, size: 26, anim: "blink", delay: 0.832, dur: 1.8 },
      { type: "emoji", emoji: "❄️", x: 26, y: 45, size: 16, anim: "wiggle", delay: 1.235, dur: 1.25 },
      { type: "emoji", emoji: "❤️", x: 16, y: 18, size: 17, anim: "pop", delay: 1.225, dur: 2.21 },
      { type: "emoji", emoji: "🎊", x: 11, y: 14, size: 13, anim: "float", delay: 0.788, dur: 1.28 },
      { type: "emoji", emoji: "🌟", x: 39, y: 60, size: 11, anim: "blink", delay: 0.692, dur: 1.71 },
      { type: "emoji", emoji: "✨", x: 71, y: 46, size: 18, anim: "blink", delay: 1.238, dur: 1.61 }
    ],
  },
  crab_sky_5_143: {
    v: 1,
    loop: 3.49,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e8f5e9", opacity: 0.7, anim: "settle", dur: 2.89, r: 48.89 },
      { type: "emoji", emoji: "🦀", x: 59, y: 48, size: 44, anim: "settle", dur: 3.09 },
      { type: "emoji", emoji: "🎈", x: 73, y: 25, size: 27, anim: "float", delay: 0.999, dur: 1.6 },
      { type: "emoji", emoji: "⭐", x: 56, y: 33, size: 24, anim: "rise", delay: 0.387, dur: 1.88 },
      { type: "emoji", emoji: "💖", x: 50, y: 20, size: 15, anim: "blink", delay: 1.78, dur: 1.87 },
      { type: "emoji", emoji: "💖", x: 43, y: 37, size: 14, anim: "blink", delay: 1.169, dur: 1.58 }
    ],
  },
  crab_party_6_144: {
    v: 1,
    loop: 2.2,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ede7f6", opacity: 0.38, anim: "bounce", dur: 1.32, r: 42.19 },
      { type: "emoji", emoji: "🦀", x: 59, y: 50, size: 35, anim: "bounce", dur: 1.44 },
      { type: "emoji", emoji: "🎊", x: 16, y: 17, size: 18, anim: "rise", delay: 0.146, dur: 2.4 },
      { type: "emoji", emoji: "🌿", x: 39, y: 30, size: 18, anim: "pop", delay: 0.156, dur: 1.88 },
      { type: "emoji", emoji: "⭐", x: 32, y: 14, size: 24, anim: "wiggle", delay: 1.161, dur: 2.09 },
      { type: "emoji", emoji: "🎈", x: 59, y: 18, size: 17, anim: "wiggle", delay: 0.067, dur: 1.37 },
      { type: "emoji", emoji: "💖", x: 19, y: 47, size: 12, anim: "blink", delay: 1.259, dur: 1.74 },
      { type: "emoji", emoji: "🌟", x: 38, y: 68, size: 18, anim: "blink", delay: 1.258, dur: 1.57 }
    ],
  },
  crab_beach_6_145: {
    v: 1,
    loop: 2.99,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 50, y: 51, size: 34, anim: "twinkle", dur: 2.62 },
      { type: "emoji", emoji: "🧢", x: 50, y: 16, size: 30, anim: "bounce", delay: 0.328, dur: 1.55 },
      { type: "emoji", emoji: "🔥", x: 67, y: 52, size: 18, anim: "pop", delay: 0.194, dur: 2.14 },
      { type: "emoji", emoji: "🌟", x: 73, y: 78, size: 18, anim: "rise", delay: 1.225, dur: 1.45 },
      { type: "emoji", emoji: "💖", x: 89, y: 11, size: 22, anim: "rise", delay: 1.49, dur: 2.3 },
      { type: "emoji", emoji: "💖", x: 15, y: 74, size: 10, anim: "blink", delay: 1.374, dur: 1.69 },
      { type: "emoji", emoji: "⭐", x: 78, y: 53, size: 11, anim: "blink", delay: 1.361, dur: 1.25 }
    ],
  },
  crab_winter_6_146: {
    v: 1,
    loop: 3.03,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f48fb1", opacity: 0.32, anim: "float", dur: 3.17, w: 102.11, h: 27.7 },
      { type: "emoji", emoji: "🦀", x: 36, y: 55, size: 39, anim: "float", dur: 2.9 },
      { type: "emoji", emoji: "💝", x: 69, y: 43, size: 25, anim: "float", delay: 0.546, dur: 1.65 },
      { type: "emoji", emoji: "🎉", x: 44, y: 42, size: 18, anim: "float", delay: 1.249, dur: 1.49 },
      { type: "emoji", emoji: "💫", x: 41, y: 37, size: 23, anim: "pop", delay: 0.896, dur: 2.22 },
      { type: "emoji", emoji: "🌸", x: 71, y: 67, size: 18, anim: "blink", delay: 0.648, dur: 1.71 },
      { type: "emoji", emoji: "💖", x: 76, y: 51, size: 14, anim: "blink", delay: 1.501, dur: 1.58 },
      { type: "emoji", emoji: "⭐", x: 37, y: 76, size: 12, anim: "blink", delay: 1.169, dur: 1.79 }
    ],
  },
  crab_spring_6_147: {
    v: 1,
    loop: 2.45,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 51, y: 46, size: 43, anim: "pop", dur: 1.51 },
      { type: "emoji", emoji: "🤠", x: 52, y: 12, size: 30, anim: "bounce", delay: 0.567, dur: 1.82 },
      { type: "emoji", emoji: "🍩", x: 73, y: 44, size: 25, anim: "pop", delay: 0.481, dur: 1.5 },
      { type: "emoji", emoji: "🎊", x: 35, y: 68, size: 13, anim: "rise", delay: 0.809, dur: 1.87 },
      { type: "emoji", emoji: "🔥", x: 82, y: 24, size: 21, anim: "rise", delay: 0.602, dur: 1.67 },
      { type: "emoji", emoji: "⭐", x: 40, y: 66, size: 16, anim: "blink", delay: 1.088, dur: 1.45 },
      { type: "emoji", emoji: "✨", x: 61, y: 18, size: 12, anim: "blink", delay: 1.962, dur: 1.06 }
    ],
  },
  crab_halloween_6_148: {
    v: 1,
    loop: 3.25,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 67, y: 52, size: 40, anim: "heartbeat", dur: 2.36 },
      { type: "emoji", emoji: "👷", x: 52, y: 15, size: 30, anim: "bounce", delay: 0.557, dur: 1.61 },
      { type: "emoji", emoji: "⭐", x: 70, y: 28, size: 24, anim: "blink", delay: 0.837, dur: 1.92 },
      { type: "emoji", emoji: "✨", x: 47, y: 68, size: 22, anim: "blink", delay: 0.463, dur: 1.97 },
      { type: "emoji", emoji: "🌊", x: 61, y: 59, size: 21, anim: "blink", delay: 0.82, dur: 1.74 },
      { type: "emoji", emoji: "🎊", x: 65, y: 13, size: 21, anim: "blink", delay: 1.266, dur: 1.73 },
      { type: "emoji", emoji: "🌿", x: 11, y: 48, size: 25, anim: "pop", delay: 0.842, dur: 2.35 },
      { type: "emoji", emoji: "💫", x: 77, y: 38, size: 13, anim: "blink", delay: 1.787, dur: 1.7 },
      { type: "emoji", emoji: "⭐", x: 31, y: 21, size: 10, anim: "blink", delay: 1.231, dur: 1.21 }
    ],
  },
  crab_christmas_6_149: {
    v: 1,
    loop: 3.75,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 59, y: 53, size: 39, anim: "float", dur: 3.45 },
      { type: "emoji", emoji: "🌹", x: 69, y: 39, size: 26, anim: "rise", delay: 0.572, dur: 1.78 },
      { type: "emoji", emoji: "✨", x: 72, y: 46, size: 23, anim: "pop", delay: 0.274, dur: 2.28 },
      { type: "emoji", emoji: "🔥", x: 33, y: 17, size: 22, anim: "pop", delay: 1.127, dur: 1.39 },
      { type: "emoji", emoji: "🌟", x: 46, y: 87, size: 20, anim: "float", delay: 1.129, dur: 1.31 },
      { type: "emoji", emoji: "🌸", x: 38, y: 22, size: 15, anim: "blink", delay: 1.402, dur: 1.4 },
      { type: "emoji", emoji: "✨", x: 70, y: 76, size: 15, anim: "blink", delay: 0.653, dur: 1.25 },
      { type: "emoji", emoji: "🌟", x: 67, y: 72, size: 12, anim: "blink", delay: 1.445, dur: 1.88 }
    ],
  },
  crab_coding_6_150: {
    v: 1,
    loop: 2.88,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e8f5e9", opacity: 0.49, anim: "float", dur: 2.84, r: 47.03 },
      { type: "emoji", emoji: "🦀", x: 54, y: 53, size: 41, anim: "float", dur: 3.01 },
      { type: "emoji", emoji: "🧣", x: 51, y: 58, size: 27, anim: "bounce", delay: 0.7, dur: 1.94 },
      { type: "emoji", emoji: "⭐", x: 88, y: 64, size: 24, anim: "float", delay: 0.652, dur: 1.53 },
      { type: "emoji", emoji: "🎈", x: 53, y: 71, size: 19, anim: "blink", delay: 0.906, dur: 2.29 },
      { type: "emoji", emoji: "⭐", x: 25, y: 34, size: 17, anim: "blink", delay: 0.9, dur: 1.72 },
      { type: "emoji", emoji: "🌟", x: 30, y: 65, size: 15, anim: "blink", delay: 1.678, dur: 1.21 }
    ],
  },
  crab_music_6_151: {
    v: 1,
    loop: 2.62,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 61, y: 55, size: 43, anim: "wave", dur: 1.75 },
      { type: "emoji", emoji: "🎀", x: 66, y: 33, size: 17, anim: "rise", delay: 0.414, dur: 1.76 },
      { type: "emoji", emoji: "🌟", x: 86, y: 60, size: 12, anim: "blink", delay: 0.758, dur: 1.76 },
      { type: "emoji", emoji: "⭐", x: 69, y: 66, size: 25, anim: "blink", delay: 0.267, dur: 2.02 },
      { type: "emoji", emoji: "🔥", x: 64, y: 66, size: 24, anim: "rise", delay: 1.016, dur: 2.37 },
      { type: "emoji", emoji: "⭐", x: 24, y: 31, size: 15, anim: "blink", delay: 1.062, dur: 1.56 },
      { type: "emoji", emoji: "💫", x: 84, y: 58, size: 13, anim: "blink", delay: 0.631, dur: 1.04 }
    ],
  },
  crab_sports_6_152: {
    v: 1,
    loop: 2.15,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#f57c00", opacity: 0.55, anim: "bounce", dur: 1.72, r: 40.76 },
      { type: "emoji", emoji: "🦀", x: 51, y: 50, size: 41, anim: "bounce", dur: 1.42 },
      { type: "emoji", emoji: "🎁", x: 71, y: 41, size: 26, anim: "blink", delay: 0.958, dur: 1.42 },
      { type: "emoji", emoji: "🎊", x: 40, y: 70, size: 14, anim: "blink", delay: 0.009, dur: 1.69 },
      { type: "emoji", emoji: "🍃", x: 13, y: 51, size: 15, anim: "rise", delay: 0.617, dur: 2.02 },
      { type: "emoji", emoji: "🌟", x: 86, y: 67, size: 16, anim: "blink", delay: 0.554, dur: 1.95 },
      { type: "emoji", emoji: "🎈", x: 48, y: 89, size: 23, anim: "float", delay: 1.167, dur: 1.24 },
      { type: "emoji", emoji: "🌟", x: 62, y: 30, size: 22, anim: "rise", delay: 0.944, dur: 1.65 },
      { type: "emoji", emoji: "💖", x: 25, y: 69, size: 17, anim: "blink", delay: 0.881, dur: 1.66 },
      { type: "emoji", emoji: "💫", x: 56, y: 66, size: 19, anim: "blink", delay: 0.631, dur: 1.33 }
    ],
  },
  crab_food_6_153: {
    v: 1,
    loop: 2.26,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#e8f5e9", opacity: 0.55, anim: "wiggle", dur: 1.62, w: 108.83, h: 27.75 },
      { type: "emoji", emoji: "🦀", x: 45, y: 49, size: 34, anim: "wiggle", dur: 1.45 },
      { type: "emoji", emoji: "💎", x: 69, y: 36, size: 24, anim: "blink", delay: 0.492, dur: 1.5 },
      { type: "emoji", emoji: "🍃", x: 88, y: 29, size: 22, anim: "rise", delay: 0.729, dur: 1.98 },
      { type: "emoji", emoji: "❄️", x: 16, y: 31, size: 24, anim: "blink", delay: 0.336, dur: 2.08 },
      { type: "emoji", emoji: "✨", x: 38, y: 40, size: 13, anim: "float", delay: 1.177, dur: 1.56 },
      { type: "emoji", emoji: "✨", x: 34, y: 41, size: 15, anim: "wiggle", delay: 1.079, dur: 1.68 },
      { type: "emoji", emoji: "🌟", x: 53, y: 41, size: 12, anim: "blink", delay: 1.922, dur: 1.56 },
      { type: "emoji", emoji: "💖", x: 77, y: 20, size: 17, anim: "blink", delay: 1.679, dur: 1.88 }
    ],
  },
  crab_space_6_154: {
    v: 1,
    loop: 4.18,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 51, y: 49, size: 35, anim: "breathe", dur: 3.58 },
      { type: "emoji", emoji: "💌", x: 71, y: 42, size: 27, anim: "float", delay: 0.873, dur: 1.47 },
      { type: "emoji", emoji: "🌿", x: 41, y: 87, size: 16, anim: "pop", delay: 1.38, dur: 2.2 },
      { type: "emoji", emoji: "⭐", x: 40, y: 85, size: 23, anim: "blink", delay: 0.982, dur: 1.73 },
      { type: "emoji", emoji: "🌟", x: 65, y: 62, size: 17, anim: "blink", delay: 0.925, dur: 1.31 },
      { type: "emoji", emoji: "💖", x: 27, y: 56, size: 11, anim: "blink", delay: 1.103, dur: 1.17 }
    ],
  },
  crab_fantasy_6_155: {
    v: 1,
    loop: 2.7,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ffab91", opacity: 0.42, anim: "pulse", dur: 2.03, r: 49.87 },
      { type: "emoji", emoji: "🦀", x: 53, y: 55, size: 43, anim: "pulse", dur: 2.04 },
      { type: "emoji", emoji: "💝", x: 68, y: 39, size: 27, anim: "rise", delay: 0.404, dur: 1.94 },
      { type: "emoji", emoji: "✨", x: 26, y: 30, size: 18, anim: "wiggle", delay: 1.367, dur: 2.21 },
      { type: "emoji", emoji: "🎉", x: 18, y: 74, size: 18, anim: "rise", delay: 1.133, dur: 1.93 },
      { type: "emoji", emoji: "🌟", x: 27, y: 32, size: 10, anim: "blink", delay: 1.223, dur: 1.35 },
      { type: "emoji", emoji: "✨", x: 53, y: 46, size: 17, anim: "blink", delay: 1.338, dur: 1.56 }
    ],
  },
  crab_office_6_156: {
    v: 1,
    loop: 2.52,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#d81b60", opacity: 0.62, anim: "pulse", dur: 2.35, r: 45.55 },
      { type: "emoji", emoji: "🦀", x: 30, y: 54, size: 36, anim: "pulse", dur: 2.17 },
      { type: "emoji", emoji: "⭐", x: 56, y: 64, size: 23, anim: "float", delay: 1.194, dur: 1.95 },
      { type: "emoji", emoji: "💫", x: 86, y: 79, size: 23, anim: "wiggle", delay: 0.989, dur: 2.28 },
      { type: "emoji", emoji: "🌸", x: 58, y: 84, size: 18, anim: "pop", delay: 0.599, dur: 2.34 },
      { type: "emoji", emoji: "🌊", x: 44, y: 89, size: 20, anim: "blink", delay: 0.211, dur: 1.72 },
      { type: "emoji", emoji: "🔥", x: 84, y: 85, size: 21, anim: "rise", delay: 1.216, dur: 1.72 },
      { type: "emoji", emoji: "💖", x: 19, y: 40, size: 17, anim: "blink", delay: 0.616, dur: 1.36 },
      { type: "emoji", emoji: "⭐", x: 24, y: 72, size: 15, anim: "blink", delay: 1.126, dur: 1.93 }
    ],
  },
  crab_fitness_6_157: {
    v: 1,
    loop: 2.77,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 68, y: 48, size: 39, anim: "float", dur: 2.66 },
      { type: "emoji", emoji: "🎀", x: 70, y: 31, size: 16, anim: "rise", delay: 0.631, dur: 1.61 },
      { type: "emoji", emoji: "❤️", x: 52, y: 56, size: 25, anim: "blink", delay: 1.219, dur: 1.59 },
      { type: "emoji", emoji: "🌊", x: 86, y: 86, size: 23, anim: "wiggle", delay: 0.271, dur: 2.34 },
      { type: "emoji", emoji: "🌟", x: 53, y: 16, size: 12, anim: "blink", delay: 0.576, dur: 1.07 },
      { type: "emoji", emoji: "💫", x: 27, y: 62, size: 15, anim: "blink", delay: 1.22, dur: 1.29 }
    ],
  },
  crab_travel_6_158: {
    v: 1,
    loop: 3.54,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ffeb3b", opacity: 0.62, anim: "settle", dur: 3.02, w: 97.07, h: 20.58 },
      { type: "emoji", emoji: "🦀", x: 55, y: 48, size: 37, anim: "settle", dur: 2.87 },
      { type: "emoji", emoji: "👷", x: 50, y: 15, size: 29, anim: "bounce", delay: 0.469, dur: 1.55 },
      { type: "emoji", emoji: "🌸", x: 72, y: 43, size: 25, anim: "float", delay: 0.897, dur: 1.5 },
      { type: "emoji", emoji: "🌊", x: 41, y: 53, size: 21, anim: "float", delay: 0.507, dur: 1.96 },
      { type: "emoji", emoji: "🎉", x: 50, y: 34, size: 14, anim: "rise", delay: 1.344, dur: 1.29 },
      { type: "emoji", emoji: "🌟", x: 37, y: 51, size: 10, anim: "blink", delay: 1.349, dur: 1.98 },
      { type: "emoji", emoji: "💫", x: 20, y: 59, size: 17, anim: "blink", delay: 1.812, dur: 1.11 }
    ],
  },
  crab_art_6_159: {
    v: 1,
    loop: 2.09,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#c5cae9", opacity: 0.39, anim: "bounce", dur: 1.35, w: 108.37, h: 19.59 },
      { type: "emoji", emoji: "🦀", x: 48, y: 55, size: 34, anim: "bounce", dur: 1.31 },
      { type: "emoji", emoji: "🎓", x: 50, y: 15, size: 27, anim: "bounce", delay: 0.45, dur: 1.62 },
      { type: "emoji", emoji: "💎", x: 72, y: 37, size: 22, anim: "float", delay: 0.544, dur: 1.67 },
      { type: "emoji", emoji: "🎈", x: 62, y: 46, size: 16, anim: "blink", delay: 0.686, dur: 1.4 },
      { type: "emoji", emoji: "🔥", x: 49, y: 71, size: 18, anim: "wiggle", delay: 0.732, dur: 1.61 },
      { type: "emoji", emoji: "🍂", x: 68, y: 10, size: 14, anim: "blink", delay: 1.296, dur: 2.19 },
      { type: "emoji", emoji: "🎉", x: 46, y: 43, size: 22, anim: "rise", delay: 0.262, dur: 1.94 },
      { type: "emoji", emoji: "🌟", x: 70, y: 65, size: 16, anim: "blink", delay: 1.288, dur: 1.11 },
      { type: "emoji", emoji: "💫", x: 41, y: 73, size: 10, anim: "blink", delay: 1.208, dur: 1.73 }
    ],
  },
  crab_science_6_160: {
    v: 1,
    loop: 2.76,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff9c4", opacity: 0.35, anim: "twinkle", dur: 2.64, w: 104.42, h: 18.87 },
      { type: "emoji", emoji: "🦀", x: 38, y: 50, size: 34, anim: "twinkle", dur: 2.53 },
      { type: "emoji", emoji: "🎁", x: 73, y: 42, size: 26, anim: "blink", delay: 0.77, dur: 1.45 },
      { type: "emoji", emoji: "⭐", x: 12, y: 72, size: 18, anim: "wiggle", delay: 0.692, dur: 1.97 },
      { type: "emoji", emoji: "🌟", x: 47, y: 62, size: 16, anim: "blink", delay: 0.676, dur: 1.76 },
      { type: "emoji", emoji: "✨", x: 56, y: 82, size: 16, anim: "blink", delay: 0.954, dur: 1.5 }
    ],
  },
  crab_pets_6_161: {
    v: 1,
    loop: 3.24,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#039be5", opacity: 0.38, anim: "float", dur: 2.9, r: 41.45 },
      { type: "emoji", emoji: "🦀", x: 30, y: 49, size: 36, anim: "float", dur: 3.06 },
      { type: "emoji", emoji: "🪖", x: 50, y: 15, size: 30, anim: "bounce", delay: 0.493, dur: 1.63 },
      { type: "emoji", emoji: "🎈", x: 71, y: 27, size: 27, anim: "float", delay: 0.776, dur: 1.96 },
      { type: "emoji", emoji: "🌸", x: 78, y: 17, size: 18, anim: "float", delay: 0.809, dur: 1.48 },
      { type: "emoji", emoji: "❄️", x: 81, y: 57, size: 15, anim: "pop", delay: 0.362, dur: 1.82 },
      { type: "emoji", emoji: "🎈", x: 59, y: 50, size: 12, anim: "float", delay: 0.469, dur: 1.26 },
      { type: "emoji", emoji: "💫", x: 82, y: 40, size: 10, anim: "blink", delay: 1.239, dur: 1.34 },
      { type: "emoji", emoji: "🌟", x: 64, y: 74, size: 17, anim: "blink", delay: 1.197, dur: 1.28 }
    ],
  },
  crab_magic_6_162: {
    v: 1,
    loop: 2.36,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 62, y: 44, size: 36, anim: "pop", dur: 1.65 },
      { type: "emoji", emoji: "🍳", x: 50, y: 16, size: 26, anim: "bounce", delay: 0.521, dur: 1.64 },
      { type: "emoji", emoji: "💎", x: 69, y: 38, size: 22, anim: "rise", delay: 0.963, dur: 1.94 },
      { type: "emoji", emoji: "❤️", x: 74, y: 65, size: 12, anim: "blink", delay: 1.498, dur: 1.69 },
      { type: "emoji", emoji: "🌿", x: 56, y: 84, size: 19, anim: "rise", delay: 0.177, dur: 2.12 },
      { type: "emoji", emoji: "❤️", x: 10, y: 16, size: 25, anim: "blink", delay: 0.828, dur: 2.15 },
      { type: "emoji", emoji: "🌟", x: 25, y: 71, size: 12, anim: "blink", delay: 1.844, dur: 1.27 },
      { type: "emoji", emoji: "🌟", x: 15, y: 43, size: 17, anim: "blink", delay: 1.717, dur: 1.6 }
    ],
  },
  crab_retro_6_163: {
    v: 1,
    loop: 3.06,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 52, y: 53, size: 35, anim: "heartbeat", dur: 2.46 },
      { type: "emoji", emoji: "🌹", x: 68, y: 41, size: 26, anim: "float", delay: 0.466, dur: 1.77 },
      { type: "emoji", emoji: "🎊", x: 73, y: 84, size: 21, anim: "float", delay: 0.348, dur: 1.73 },
      { type: "emoji", emoji: "🌊", x: 46, y: 37, size: 14, anim: "float", delay: 0.196, dur: 2.31 },
      { type: "emoji", emoji: "🌊", x: 54, y: 31, size: 15, anim: "float", delay: 0.264, dur: 1.79 },
      { type: "emoji", emoji: "🎉", x: 72, y: 76, size: 17, anim: "blink", delay: 0.472, dur: 2.34 },
      { type: "emoji", emoji: "💖", x: 49, y: 47, size: 14, anim: "blink", delay: 1.883, dur: 1.11 },
      { type: "emoji", emoji: "🌟", x: 78, y: 17, size: 10, anim: "blink", delay: 0.559, dur: 1.4 }
    ],
  },
  crab_cyber_6_164: {
    v: 1,
    loop: 3.96,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 59, y: 48, size: 41, anim: "float", dur: 3.4 },
      { type: "emoji", emoji: "💎", x: 70, y: 38, size: 22, anim: "pop", delay: 0.617, dur: 1.43 },
      { type: "emoji", emoji: "💖", x: 61, y: 19, size: 24, anim: "wiggle", delay: 1.215, dur: 1.52 },
      { type: "emoji", emoji: "❤️", x: 47, y: 79, size: 24, anim: "wiggle", delay: 0.958, dur: 2.08 },
      { type: "emoji", emoji: "🌟", x: 36, y: 71, size: 16, anim: "float", delay: 1.002, dur: 1.29 },
      { type: "emoji", emoji: "✨", x: 60, y: 18, size: 14, anim: "blink", delay: 1.837, dur: 1.44 },
      { type: "emoji", emoji: "💫", x: 80, y: 76, size: 16, anim: "blink", delay: 0.611, dur: 1.75 }
    ],
  },
  crab_nature_6_165: {
    v: 1,
    loop: 2.98,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#f4511e", opacity: 0.48, anim: "float", dur: 3.2, r: 46.48 },
      { type: "emoji", emoji: "🦀", x: 47, y: 45, size: 44, anim: "float", dur: 3.04 },
      { type: "emoji", emoji: "🕶️", x: 51, y: 29, size: 29, anim: "bounce", delay: 0.647, dur: 1.61 },
      { type: "emoji", emoji: "🌿", x: 62, y: 25, size: 16, anim: "rise", delay: 1.427, dur: 1.23 },
      { type: "emoji", emoji: "⭐", x: 31, y: 74, size: 24, anim: "wiggle", delay: 0.514, dur: 1.88 },
      { type: "emoji", emoji: "🌸", x: 80, y: 21, size: 23, anim: "blink", delay: 0.038, dur: 1.45 },
      { type: "emoji", emoji: "🍃", x: 84, y: 38, size: 19, anim: "blink", delay: 1.212, dur: 1.39 },
      { type: "emoji", emoji: "🌿", x: 40, y: 70, size: 19, anim: "blink", delay: 0.487, dur: 1.82 },
      { type: "emoji", emoji: "🌟", x: 54, y: 37, size: 18, anim: "blink", delay: 1.877, dur: 1.15 },
      { type: "emoji", emoji: "💫", x: 52, y: 34, size: 13, anim: "blink", delay: 0.637, dur: 1.36 }
    ],
  },
  crab_underwater_6_166: {
    v: 1,
    loop: 2.34,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 39, y: 51, size: 42, anim: "wave", dur: 1.77 },
      { type: "emoji", emoji: "🍳", x: 49, y: 15, size: 29, anim: "bounce", delay: 0.589, dur: 1.81 },
      { type: "emoji", emoji: "💌", x: 70, y: 40, size: 24, anim: "pop", delay: 0.524, dur: 1.54 },
      { type: "emoji", emoji: "🌟", x: 54, y: 28, size: 14, anim: "wiggle", delay: 1.168, dur: 2.12 },
      { type: "emoji", emoji: "🌸", x: 31, y: 38, size: 24, anim: "rise", delay: 0.929, dur: 1.93 },
      { type: "emoji", emoji: "🌿", x: 65, y: 34, size: 25, anim: "wiggle", delay: 1.379, dur: 1.76 },
      { type: "emoji", emoji: "🎉", x: 72, y: 53, size: 14, anim: "pop", delay: 1.109, dur: 2.17 },
      { type: "emoji", emoji: "🌿", x: 33, y: 21, size: 22, anim: "blink", delay: 0.818, dur: 1.78 },
      { type: "emoji", emoji: "💖", x: 23, y: 41, size: 16, anim: "blink", delay: 0.901, dur: 1.08 },
      { type: "emoji", emoji: "💫", x: 77, y: 19, size: 10, anim: "blink", delay: 1.21, dur: 1.57 }
    ],
  },
  crab_sky_6_167: {
    v: 1,
    loop: 2.11,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 49, y: 49, size: 34, anim: "bounce", dur: 1.39 },
      { type: "emoji", emoji: "🤠", x: 48, y: 15, size: 30, anim: "bounce", delay: 0.5, dur: 1.56 },
      { type: "emoji", emoji: "💫", x: 89, y: 66, size: 23, anim: "rise", delay: 0.846, dur: 1.9 },
      { type: "emoji", emoji: "🎈", x: 43, y: 69, size: 12, anim: "pop", delay: 1.313, dur: 2.31 },
      { type: "emoji", emoji: "❄️", x: 26, y: 42, size: 20, anim: "pop", delay: 1.205, dur: 1.29 },
      { type: "emoji", emoji: "❄️", x: 36, y: 13, size: 23, anim: "blink", delay: 1.247, dur: 1.53 },
      { type: "emoji", emoji: "🎊", x: 44, y: 11, size: 15, anim: "blink", delay: 1.44, dur: 1.76 },
      { type: "emoji", emoji: "💖", x: 35, y: 65, size: 11, anim: "blink", delay: 1.61, dur: 1.05 },
      { type: "emoji", emoji: "💫", x: 30, y: 80, size: 16, anim: "blink", delay: 0.816, dur: 1.57 }
    ],
  },
  crab_party_7_168: {
    v: 1,
    loop: 2.06,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fbc02d", opacity: 0.32, anim: "wiggle", dur: 1.47, w: 90.58, h: 20.82 },
      { type: "emoji", emoji: "🦀", x: 37, y: 50, size: 35, anim: "wiggle", dur: 1.35 },
      { type: "emoji", emoji: "🍂", x: 86, y: 85, size: 25, anim: "rise", delay: 1.295, dur: 1.86 },
      { type: "emoji", emoji: "🎈", x: 14, y: 34, size: 21, anim: "wiggle", delay: 1.224, dur: 1.2 },
      { type: "emoji", emoji: "💖", x: 29, y: 38, size: 17, anim: "float", delay: 0.787, dur: 1.73 },
      { type: "emoji", emoji: "🌊", x: 82, y: 76, size: 19, anim: "float", delay: 1.432, dur: 1.97 },
      { type: "emoji", emoji: "🎊", x: 61, y: 72, size: 16, anim: "float", delay: 1.454, dur: 1.21 },
      { type: "emoji", emoji: "⭐", x: 81, y: 31, size: 14, anim: "blink", delay: 0.851, dur: 1.52 },
      { type: "emoji", emoji: "💖", x: 37, y: 75, size: 11, anim: "blink", delay: 1.583, dur: 1.34 }
    ],
  },
  crab_beach_7_169: {
    v: 1,
    loop: 3.9,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 55, y: 51, size: 41, anim: "breathe", dur: 3.37 },
      { type: "emoji", emoji: "🍳", x: 50, y: 16, size: 26, anim: "bounce", delay: 0.568, dur: 1.51 },
      { type: "emoji", emoji: "🍪", x: 74, y: 44, size: 25, anim: "rise", delay: 0.7, dur: 1.49 },
      { type: "emoji", emoji: "🍂", x: 69, y: 75, size: 25, anim: "blink", delay: 1.227, dur: 1.38 },
      { type: "emoji", emoji: "✨", x: 21, y: 18, size: 21, anim: "pop", delay: 0.143, dur: 2.23 },
      { type: "emoji", emoji: "❤️", x: 24, y: 85, size: 19, anim: "float", delay: 1.346, dur: 1.6 },
      { type: "emoji", emoji: "💫", x: 20, y: 62, size: 18, anim: "blink", delay: 1.94, dur: 1.78 },
      { type: "emoji", emoji: "🌟", x: 79, y: 26, size: 16, anim: "blink", delay: 1.284, dur: 1.58 }
    ],
  },
  crab_winter_7_170: {
    v: 1,
    loop: 2.64,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff0f6", opacity: 0.58, anim: "pulse", dur: 1.95, w: 101.98, h: 20.78 },
      { type: "emoji", emoji: "🦀", x: 66, y: 52, size: 42, anim: "pulse", dur: 2.06 },
      { type: "emoji", emoji: "🎓", x: 49, y: 14, size: 26, anim: "bounce", delay: 0.369, dur: 1.65 },
      { type: "emoji", emoji: "🍄", x: 70, y: 41, size: 27, anim: "pop", delay: 0.412, dur: 1.41 },
      { type: "emoji", emoji: "🍂", x: 52, y: 59, size: 12, anim: "rise", delay: 0.811, dur: 1.37 },
      { type: "emoji", emoji: "🌊", x: 37, y: 21, size: 24, anim: "pop", delay: 0.015, dur: 1.72 },
      { type: "emoji", emoji: "🎉", x: 89, y: 10, size: 25, anim: "float", delay: 0.527, dur: 1.48 },
      { type: "emoji", emoji: "✨", x: 81, y: 75, size: 14, anim: "float", delay: 0.289, dur: 1.65 },
      { type: "emoji", emoji: "💫", x: 23, y: 76, size: 14, anim: "blink", delay: 1.097, dur: 1.89 },
      { type: "emoji", emoji: "🌟", x: 24, y: 47, size: 14, anim: "blink", delay: 1.558, dur: 1 }
    ],
  },
  crab_spring_7_171: {
    v: 1,
    loop: 2.62,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#29b6f6", opacity: 0.6, anim: "pulse", dur: 2.08, w: 99.69, h: 26.55 },
      { type: "emoji", emoji: "🦀", x: 36, y: 50, size: 36, anim: "pulse", dur: 2.24 },
      { type: "emoji", emoji: "🎩", x: 51, y: 11, size: 31, anim: "bounce", delay: 0.63, dur: 1.84 },
      { type: "emoji", emoji: "⭐", x: 69, y: 30, size: 24, anim: "blink", delay: 0.873, dur: 1.92 },
      { type: "emoji", emoji: "⭐", x: 89, y: 36, size: 22, anim: "blink", delay: 0.823, dur: 1.88 },
      { type: "emoji", emoji: "🎉", x: 14, y: 58, size: 17, anim: "pop", delay: 0.962, dur: 2.35 },
      { type: "emoji", emoji: "⭐", x: 66, y: 68, size: 15, anim: "blink", delay: 1.841, dur: 1.24 },
      { type: "emoji", emoji: "⭐", x: 74, y: 41, size: 15, anim: "blink", delay: 1.876, dur: 1.65 }
    ],
  },
  crab_halloween_7_172: {
    v: 1,
    loop: 2.86,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff3e0", opacity: 0.64, anim: "float", dur: 2.75, w: 103.43, h: 22.29 },
      { type: "emoji", emoji: "🦀", x: 60, y: 48, size: 34, anim: "float", dur: 2.9 },
      { type: "emoji", emoji: "🧙", x: 51, y: 14, size: 32, anim: "bounce", delay: 0.302, dur: 1.63 },
      { type: "emoji", emoji: "🌟", x: 69, y: 27, size: 26, anim: "rise", delay: 0.784, dur: 1.52 },
      { type: "emoji", emoji: "🌸", x: 48, y: 62, size: 16, anim: "float", delay: 0.373, dur: 1.73 },
      { type: "emoji", emoji: "🌟", x: 16, y: 36, size: 18, anim: "blink", delay: 0.094, dur: 1.69 },
      { type: "emoji", emoji: "💫", x: 28, y: 31, size: 15, anim: "blink", delay: 0.267, dur: 1.91 },
      { type: "emoji", emoji: "🍃", x: 59, y: 65, size: 22, anim: "float", delay: 1.39, dur: 2.25 },
      { type: "emoji", emoji: "🌊", x: 18, y: 78, size: 25, anim: "pop", delay: 0.37, dur: 1.7 },
      { type: "emoji", emoji: "⭐", x: 18, y: 68, size: 18, anim: "blink", delay: 1.721, dur: 1.76 },
      { type: "emoji", emoji: "⭐", x: 37, y: 35, size: 14, anim: "blink", delay: 1.618, dur: 1.05 }
    ],
  },
  crab_christmas_7_173: {
    v: 1,
    loop: 3.6,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#66bb6a", opacity: 0.66, anim: "settle", dur: 2.91, r: 49.19 },
      { type: "emoji", emoji: "🦀", x: 44, y: 54, size: 40, anim: "settle", dur: 3 },
      { type: "emoji", emoji: "👒", x: 51, y: 15, size: 34, anim: "bounce", delay: 0.667, dur: 1.83 },
      { type: "emoji", emoji: "🍩", x: 73, y: 41, size: 27, anim: "rise", delay: 0.526, dur: 1.54 },
      { type: "emoji", emoji: "✨", x: 79, y: 79, size: 15, anim: "pop", delay: 0.663, dur: 1.25 },
      { type: "emoji", emoji: "❄️", x: 31, y: 76, size: 25, anim: "pop", delay: 0.01, dur: 1.27 },
      { type: "emoji", emoji: "💫", x: 21, y: 57, size: 11, anim: "blink", delay: 1.963, dur: 1.3 },
      { type: "emoji", emoji: "🌟", x: 84, y: 29, size: 13, anim: "blink", delay: 0.743, dur: 1.18 }
    ],
  },
  crab_coding_7_174: {
    v: 1,
    loop: 1.83,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#d1c4e9", opacity: 0.68, anim: "bounce", dur: 1.05, w: 100.35, h: 19.81 },
      { type: "emoji", emoji: "🦀", x: 59, y: 52, size: 36, anim: "bounce", dur: 1.23 },
      { type: "emoji", emoji: "👑", x: 49, y: 13, size: 33, anim: "bounce", delay: 0.349, dur: 1.59 },
      { type: "emoji", emoji: "🌻", x: 70, y: 39, size: 29, anim: "rise", delay: 0.757, dur: 1.54 },
      { type: "emoji", emoji: "❄️", x: 14, y: 70, size: 24, anim: "blink", delay: 0.182, dur: 1.71 },
      { type: "emoji", emoji: "🎉", x: 60, y: 43, size: 15, anim: "pop", delay: 1.384, dur: 2.14 },
      { type: "emoji", emoji: "✨", x: 38, y: 62, size: 15, anim: "float", delay: 1.131, dur: 1.85 },
      { type: "emoji", emoji: "🌊", x: 38, y: 59, size: 18, anim: "pop", delay: 0.37, dur: 2.02 },
      { type: "emoji", emoji: "⭐", x: 61, y: 67, size: 18, anim: "float", delay: 0.888, dur: 1.21 },
      { type: "emoji", emoji: "💫", x: 20, y: 71, size: 11, anim: "blink", delay: 1.694, dur: 1.79 },
      { type: "emoji", emoji: "✨", x: 71, y: 43, size: 14, anim: "blink", delay: 1.718, dur: 1.67 }
    ],
  },
  crab_music_7_175: {
    v: 1,
    loop: 3.11,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffab91", opacity: 0.3, anim: "twinkle", dur: 2.28, r: 46.84 },
      { type: "emoji", emoji: "🦀", x: 65, y: 47, size: 37, anim: "twinkle", dur: 2.55 },
      { type: "emoji", emoji: "👑", x: 52, y: 13, size: 31, anim: "bounce", delay: 0.374, dur: 1.82 },
      { type: "emoji", emoji: "🎈", x: 71, y: 28, size: 27, anim: "rise", delay: 0.877, dur: 1.98 },
      { type: "emoji", emoji: "🍂", x: 54, y: 46, size: 15, anim: "blink", delay: 0.419, dur: 1.93 },
      { type: "emoji", emoji: "⭐", x: 71, y: 23, size: 13, anim: "pop", delay: 0.689, dur: 2.12 },
      { type: "emoji", emoji: "🔥", x: 30, y: 19, size: 22, anim: "float", delay: 0.864, dur: 1.86 },
      { type: "emoji", emoji: "💖", x: 67, y: 75, size: 24, anim: "rise", delay: 1.313, dur: 1.37 },
      { type: "emoji", emoji: "⭐", x: 58, y: 34, size: 16, anim: "blink", delay: 0.504, dur: 1.21 },
      { type: "emoji", emoji: "✨", x: 80, y: 76, size: 15, anim: "blink", delay: 1.776, dur: 1.07 }
    ],
  },
  crab_sports_7_176: {
    v: 1,
    loop: 3.23,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 61, y: 55, size: 39, anim: "float", dur: 2.99 },
      { type: "emoji", emoji: "🕶️", x: 50, y: 27, size: 29, anim: "bounce", delay: 0.356, dur: 1.93 },
      { type: "emoji", emoji: "💖", x: 35, y: 24, size: 17, anim: "wiggle", delay: 0.556, dur: 1.42 },
      { type: "emoji", emoji: "🌟", x: 40, y: 21, size: 13, anim: "float", delay: 1.353, dur: 1.51 },
      { type: "emoji", emoji: "🌊", x: 39, y: 38, size: 22, anim: "wiggle", delay: 1.028, dur: 1.31 },
      { type: "emoji", emoji: "⭐", x: 53, y: 82, size: 19, anim: "float", delay: 0.772, dur: 1.58 },
      { type: "emoji", emoji: "💖", x: 50, y: 83, size: 15, anim: "blink", delay: 1.823, dur: 1.11 },
      { type: "emoji", emoji: "💖", x: 52, y: 58, size: 13, anim: "blink", delay: 1.173, dur: 1.32 }
    ],
  },
  crab_food_7_177: {
    v: 1,
    loop: 2.18,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ab47bc", opacity: 0.67, anim: "pop", dur: 1.6, w: 104.74, h: 18.26 },
      { type: "emoji", emoji: "🦀", x: 55, y: 46, size: 39, anim: "pop", dur: 1.46 },
      { type: "emoji", emoji: "🍂", x: 48, y: 16, size: 18, anim: "wiggle", delay: 0.8, dur: 2.09 },
      { type: "emoji", emoji: "🌸", x: 33, y: 32, size: 17, anim: "pop", delay: 0.176, dur: 2.11 },
      { type: "emoji", emoji: "🎈", x: 35, y: 33, size: 25, anim: "blink", delay: 0.481, dur: 2.33 },
      { type: "emoji", emoji: "🌟", x: 34, y: 72, size: 14, anim: "blink", delay: 1.126, dur: 1.2 },
      { type: "emoji", emoji: "💖", x: 66, y: 54, size: 17, anim: "blink", delay: 1.513, dur: 1.04 }
    ],
  },
  crab_space_7_178: {
    v: 1,
    loop: 3.22,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 37, y: 46, size: 35, anim: "heartbeat", dur: 2.43 },
      { type: "emoji", emoji: "💌", x: 70, y: 42, size: 24, anim: "float", delay: 0.925, dur: 1.9 },
      { type: "emoji", emoji: "🌟", x: 66, y: 40, size: 23, anim: "rise", delay: 1.408, dur: 1.41 },
      { type: "emoji", emoji: "🌿", x: 23, y: 23, size: 17, anim: "float", delay: 0.768, dur: 1.65 },
      { type: "emoji", emoji: "🍃", x: 61, y: 51, size: 16, anim: "float", delay: 0.799, dur: 2.38 },
      { type: "emoji", emoji: "🌟", x: 56, y: 88, size: 23, anim: "wiggle", delay: 0.191, dur: 1.51 },
      { type: "emoji", emoji: "✨", x: 69, y: 81, size: 15, anim: "blink", delay: 0.872, dur: 1.82 },
      { type: "emoji", emoji: "💖", x: 48, y: 63, size: 14, anim: "blink", delay: 1.881, dur: 1.02 }
    ],
  },
  crab_fantasy_7_179: {
    v: 1,
    loop: 3.78,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#c5cae9", opacity: 0.55, anim: "float", dur: 3.47, w: 100.23, h: 23.91 },
      { type: "emoji", emoji: "🦀", x: 58, y: 52, size: 42, anim: "float", dur: 3.64 },
      { type: "emoji", emoji: "🌟", x: 74, y: 29, size: 24, anim: "pop", delay: 0.741, dur: 1.96 },
      { type: "emoji", emoji: "🌸", x: 85, y: 15, size: 16, anim: "wiggle", delay: 0.24, dur: 2.2 },
      { type: "emoji", emoji: "⭐", x: 65, y: 36, size: 19, anim: "float", delay: 0.727, dur: 2.12 },
      { type: "emoji", emoji: "🎊", x: 40, y: 87, size: 17, anim: "wiggle", delay: 0.594, dur: 2.08 },
      { type: "emoji", emoji: "💫", x: 80, y: 27, size: 18, anim: "rise", delay: 1.086, dur: 1.27 },
      { type: "emoji", emoji: "💖", x: 53, y: 79, size: 15, anim: "blink", delay: 1.192, dur: 1.83 },
      { type: "emoji", emoji: "✨", x: 39, y: 26, size: 12, anim: "blink", delay: 1.776, dur: 1.63 }
    ],
  },
  crab_office_7_180: {
    v: 1,
    loop: 2.93,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 62, y: 46, size: 34, anim: "float", dur: 3.1 },
      { type: "emoji", emoji: "🎓", x: 49, y: 17, size: 26, anim: "bounce", delay: 0.584, dur: 1.91 },
      { type: "emoji", emoji: "💫", x: 23, y: 59, size: 17, anim: "pop", delay: 0.333, dur: 1.28 },
      { type: "emoji", emoji: "⭐", x: 63, y: 48, size: 17, anim: "rise", delay: 0.038, dur: 1.4 },
      { type: "emoji", emoji: "🎊", x: 49, y: 43, size: 13, anim: "wiggle", delay: 1.166, dur: 2.14 },
      { type: "emoji", emoji: "🌟", x: 83, y: 64, size: 14, anim: "blink", delay: 1.178, dur: 1.4 },
      { type: "emoji", emoji: "✨", x: 61, y: 50, size: 11, anim: "blink", delay: 0.537, dur: 1.34 }
    ],
  },
  crab_fitness_7_181: {
    v: 1,
    loop: 2.62,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#0277bd", opacity: 0.69, anim: "wave", dur: 1.71, w: 109, h: 22.86 },
      { type: "emoji", emoji: "🦀", x: 43, y: 46, size: 39, anim: "wave", dur: 1.77 },
      { type: "emoji", emoji: "👑", x: 51, y: 15, size: 32, anim: "bounce", delay: 0.422, dur: 1.99 },
      { type: "emoji", emoji: "💝", x: 67, y: 39, size: 24, anim: "rise", delay: 0.447, dur: 1.99 },
      { type: "emoji", emoji: "❄️", x: 36, y: 76, size: 19, anim: "rise", delay: 0.387, dur: 1.75 },
      { type: "emoji", emoji: "❄️", x: 12, y: 48, size: 18, anim: "wiggle", delay: 1.112, dur: 1.74 },
      { type: "emoji", emoji: "✨", x: 54, y: 69, size: 12, anim: "blink", delay: 0.772, dur: 1.71 },
      { type: "emoji", emoji: "✨", x: 46, y: 60, size: 16, anim: "blink", delay: 0.516, dur: 1.29 }
    ],
  },
  crab_travel_7_182: {
    v: 1,
    loop: 1.79,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ffa726", opacity: 0.34, anim: "bounce", dur: 1.6, w: 93.94, h: 20.29 },
      { type: "emoji", emoji: "🦀", x: 64, y: 52, size: 36, anim: "bounce", dur: 1.4 },
      { type: "emoji", emoji: "🌸", x: 58, y: 77, size: 23, anim: "float", delay: 0.266, dur: 1.5 },
      { type: "emoji", emoji: "🎊", x: 43, y: 48, size: 19, anim: "wiggle", delay: 0.933, dur: 1.26 },
      { type: "emoji", emoji: "🌿", x: 62, y: 71, size: 20, anim: "pop", delay: 0.283, dur: 1.99 },
      { type: "emoji", emoji: "🌟", x: 38, y: 20, size: 22, anim: "blink", delay: 0.591, dur: 1.24 },
      { type: "emoji", emoji: "❤️", x: 20, y: 50, size: 13, anim: "rise", delay: 0.447, dur: 2.14 },
      { type: "emoji", emoji: "⭐", x: 81, y: 15, size: 17, anim: "blink", delay: 0.696, dur: 1.18 },
      { type: "emoji", emoji: "💫", x: 45, y: 43, size: 17, anim: "blink", delay: 1.158, dur: 1.08 }
    ],
  },
  crab_art_7_183: {
    v: 1,
    loop: 2.24,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 67, y: 53, size: 41, anim: "wiggle", dur: 1.41 },
      { type: "emoji", emoji: "🧢", x: 48, y: 16, size: 28, anim: "bounce", delay: 0.687, dur: 1.51 },
      { type: "emoji", emoji: "💎", x: 67, y: 41, size: 25, anim: "pop", delay: 0.455, dur: 1.78 },
      { type: "emoji", emoji: "🌊", x: 57, y: 83, size: 16, anim: "float", delay: 0.711, dur: 2 },
      { type: "emoji", emoji: "⭐", x: 31, y: 85, size: 19, anim: "rise", delay: 0.003, dur: 1.56 },
      { type: "emoji", emoji: "💖", x: 69, y: 17, size: 12, anim: "blink", delay: 1.227, dur: 1.62 },
      { type: "emoji", emoji: "✨", x: 71, y: 56, size: 17, anim: "blink", delay: 0.823, dur: 1.65 }
    ],
  },
  crab_science_7_184: {
    v: 1,
    loop: 4.17,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#5e35b1", opacity: 0.36, anim: "breathe", dur: 3.35, r: 41.78 },
      { type: "emoji", emoji: "🦀", x: 40, y: 49, size: 44, anim: "breathe", dur: 3.46 },
      { type: "emoji", emoji: "👑", x: 50, y: 14, size: 32, anim: "bounce", delay: 0.374, dur: 1.58 },
      { type: "emoji", emoji: "🍩", x: 68, y: 42, size: 27, anim: "blink", delay: 0.717, dur: 1.41 },
      { type: "emoji", emoji: "🌊", x: 89, y: 35, size: 16, anim: "blink", delay: 0.892, dur: 1.39 },
      { type: "emoji", emoji: "🌸", x: 73, y: 68, size: 12, anim: "pop", delay: 1.484, dur: 1.33 },
      { type: "emoji", emoji: "🍂", x: 33, y: 73, size: 25, anim: "blink", delay: 1.117, dur: 1.45 },
      { type: "emoji", emoji: "✨", x: 22, y: 52, size: 11, anim: "blink", delay: 1.487, dur: 1.18 },
      { type: "emoji", emoji: "💫", x: 45, y: 15, size: 17, anim: "blink", delay: 1.15, dur: 2 }
    ],
  },
  crab_pets_7_185: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 37, y: 45, size: 37, anim: "pulse", dur: 2.13 },
      { type: "emoji", emoji: "🧢", x: 50, y: 15, size: 30, anim: "bounce", delay: 0.487, dur: 1.95 },
      { type: "emoji", emoji: "🌹", x: 68, y: 45, size: 28, anim: "float", delay: 0.571, dur: 1.87 },
      { type: "emoji", emoji: "🍃", x: 26, y: 71, size: 14, anim: "pop", delay: 0.603, dur: 1.94 },
      { type: "emoji", emoji: "💖", x: 64, y: 64, size: 23, anim: "pop", delay: 1.241, dur: 2.1 },
      { type: "emoji", emoji: "💖", x: 76, y: 72, size: 17, anim: "blink", delay: 1.824, dur: 1.59 },
      { type: "emoji", emoji: "💖", x: 57, y: 56, size: 15, anim: "blink", delay: 1.147, dur: 1.91 }
    ],
  },
  crab_magic_7_186: {
    v: 1,
    loop: 2.6,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 38, y: 50, size: 40, anim: "pulse", dur: 2.34 },
      { type: "emoji", emoji: "🎩", x: 52, y: 12, size: 33, anim: "bounce", delay: 0.39, dur: 1.88 },
      { type: "emoji", emoji: "🍬", x: 73, y: 45, size: 20, anim: "pop", delay: 0.98, dur: 1.8 },
      { type: "emoji", emoji: "✨", x: 24, y: 64, size: 20, anim: "rise", delay: 1.16, dur: 2.02 },
      { type: "emoji", emoji: "🎈", x: 11, y: 39, size: 22, anim: "float", delay: 1.073, dur: 1.88 },
      { type: "emoji", emoji: "💫", x: 45, y: 65, size: 16, anim: "blink", delay: 0.972, dur: 1.72 },
      { type: "emoji", emoji: "⭐", x: 50, y: 48, size: 17, anim: "blink", delay: 1.384, dur: 1.03 }
    ],
  },
  crab_retro_7_187: {
    v: 1,
    loop: 3.01,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#9c27b0", opacity: 0.61, anim: "float", dur: 2.67, r: 44.2 },
      { type: "emoji", emoji: "🦀", x: 51, y: 52, size: 43, anim: "float", dur: 2.83 },
      { type: "emoji", emoji: "🎓", x: 51, y: 15, size: 27, anim: "bounce", delay: 0.428, dur: 1.55 },
      { type: "emoji", emoji: "🍬", x: 74, y: 45, size: 20, anim: "blink", delay: 0.962, dur: 1.62 },
      { type: "emoji", emoji: "💫", x: 53, y: 44, size: 23, anim: "float", delay: 0.679, dur: 2.12 },
      { type: "emoji", emoji: "❄️", x: 33, y: 57, size: 13, anim: "pop", delay: 0.714, dur: 1.6 },
      { type: "emoji", emoji: "💫", x: 42, y: 80, size: 13, anim: "blink", delay: 1.275, dur: 1.97 },
      { type: "emoji", emoji: "⭐", x: 70, y: 45, size: 17, anim: "blink", delay: 0.903, dur: 1.9 }
    ],
  },
  crab_cyber_7_188: {
    v: 1,
    loop: 3.71,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fff176", opacity: 0.47, anim: "settle", dur: 3.19, r: 45.74 },
      { type: "emoji", emoji: "🦀", x: 67, y: 53, size: 37, anim: "settle", dur: 3.07 },
      { type: "emoji", emoji: "🎀", x: 65, y: 32, size: 16, anim: "float", delay: 0.938, dur: 1.44 },
      { type: "emoji", emoji: "🍃", x: 28, y: 35, size: 19, anim: "pop", delay: 0.533, dur: 1.73 },
      { type: "emoji", emoji: "✨", x: 45, y: 75, size: 12, anim: "rise", delay: 0.288, dur: 1.56 },
      { type: "emoji", emoji: "🌿", x: 31, y: 76, size: 21, anim: "pop", delay: 1.393, dur: 1.71 },
      { type: "emoji", emoji: "🎉", x: 17, y: 33, size: 19, anim: "pop", delay: 0.189, dur: 2.1 },
      { type: "emoji", emoji: "💖", x: 77, y: 67, size: 11, anim: "blink", delay: 0.653, dur: 1.93 },
      { type: "emoji", emoji: "💖", x: 52, y: 80, size: 12, anim: "blink", delay: 1.307, dur: 1.26 }
    ],
  },
  crab_nature_7_189: {
    v: 1,
    loop: 2.13,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#9fa8da", opacity: 0.62, anim: "bounce", dur: 1.09, w: 103.1, h: 19.81 },
      { type: "emoji", emoji: "🦀", x: 35, y: 51, size: 36, anim: "bounce", dur: 1.28 },
      { type: "emoji", emoji: "🎭", x: 49, y: 29, size: 27, anim: "bounce", delay: 0.534, dur: 1.77 },
      { type: "emoji", emoji: "✨", x: 63, y: 27, size: 16, anim: "float", delay: 0.949, dur: 2.03 },
      { type: "emoji", emoji: "🍂", x: 35, y: 10, size: 23, anim: "blink", delay: 1.312, dur: 1.97 },
      { type: "emoji", emoji: "💫", x: 57, y: 81, size: 14, anim: "blink", delay: 0.986, dur: 1.44 },
      { type: "emoji", emoji: "🌟", x: 71, y: 43, size: 14, anim: "blink", delay: 1.829, dur: 1.79 }
    ],
  },
  crab_underwater_7_190: {
    v: 1,
    loop: 2.96,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff0f6", opacity: 0.35, anim: "twinkle", dur: 2.28, w: 92.78, h: 23.42 },
      { type: "emoji", emoji: "🦀", x: 64, y: 46, size: 33, anim: "twinkle", dur: 2.59 },
      { type: "emoji", emoji: "👮", x: 50, y: 18, size: 30, anim: "bounce", delay: 0.424, dur: 1.52 },
      { type: "emoji", emoji: "🌸", x: 70, y: 41, size: 27, anim: "rise", delay: 0.911, dur: 1.57 },
      { type: "emoji", emoji: "❄️", x: 54, y: 58, size: 14, anim: "pop", delay: 0.127, dur: 2.32 },
      { type: "emoji", emoji: "✨", x: 89, y: 89, size: 20, anim: "rise", delay: 0.197, dur: 2.31 },
      { type: "emoji", emoji: "🌸", x: 73, y: 78, size: 18, anim: "blink", delay: 0.959, dur: 2.39 },
      { type: "emoji", emoji: "💖", x: 38, y: 53, size: 18, anim: "blink", delay: 1.712, dur: 1.79 },
      { type: "emoji", emoji: "💫", x: 68, y: 62, size: 10, anim: "blink", delay: 1.999, dur: 1.55 }
    ],
  },
  crab_sky_7_191: {
    v: 1,
    loop: 3.21,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#81d4fa", opacity: 0.56, anim: "float", dur: 2.84, w: 107.8, h: 22.7 },
      { type: "emoji", emoji: "🦀", x: 63, y: 52, size: 35, anim: "float", dur: 2.95 },
      { type: "emoji", emoji: "🤠", x: 49, y: 13, size: 33, anim: "bounce", delay: 0.582, dur: 1.88 },
      { type: "emoji", emoji: "🍩", x: 72, y: 41, size: 27, anim: "rise", delay: 0.823, dur: 1.92 },
      { type: "emoji", emoji: "🌟", x: 74, y: 65, size: 13, anim: "wiggle", delay: 1.441, dur: 1.51 },
      { type: "emoji", emoji: "❄️", x: 28, y: 85, size: 20, anim: "rise", delay: 0.627, dur: 1.92 },
      { type: "emoji", emoji: "🔥", x: 35, y: 14, size: 20, anim: "pop", delay: 0.08, dur: 1.28 },
      { type: "emoji", emoji: "❄️", x: 49, y: 78, size: 24, anim: "float", delay: 0.014, dur: 1.42 },
      { type: "emoji", emoji: "💖", x: 25, y: 52, size: 15, anim: "blink", delay: 1.771, dur: 1.57 },
      { type: "emoji", emoji: "💫", x: 43, y: 24, size: 12, anim: "blink", delay: 1.894, dur: 1.66 }
    ],
  },
  crab_party_8_192: {
    v: 1,
    loop: 2.37,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ff9800", opacity: 0.59, anim: "pop", dur: 1.6, r: 49.61 },
      { type: "emoji", emoji: "🦀", x: 38, y: 50, size: 34, anim: "pop", dur: 1.61 },
      { type: "emoji", emoji: "👑", x: 50, y: 14, size: 30, anim: "bounce", delay: 0.668, dur: 1.75 },
      { type: "emoji", emoji: "💖", x: 80, y: 16, size: 23, anim: "rise", delay: 0.193, dur: 1.43 },
      { type: "emoji", emoji: "❤️", x: 58, y: 33, size: 25, anim: "blink", delay: 0.556, dur: 1.65 },
      { type: "emoji", emoji: "🔥", x: 86, y: 46, size: 20, anim: "pop", delay: 0.391, dur: 1.88 },
      { type: "emoji", emoji: "💫", x: 77, y: 82, size: 18, anim: "blink", delay: 0.876, dur: 1.23 },
      { type: "emoji", emoji: "💫", x: 15, y: 31, size: 12, anim: "blink", delay: 1.267, dur: 1.05 }
    ],
  },
  crab_beach_8_193: {
    v: 1,
    loop: 2.99,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#66bb6a", opacity: 0.43, anim: "heartbeat", dur: 2.54, r: 43.17 },
      { type: "emoji", emoji: "🦀", x: 69, y: 49, size: 39, anim: "heartbeat", dur: 2.36 },
      { type: "emoji", emoji: "🔥", x: 56, y: 27, size: 12, anim: "pop", delay: 0.096, dur: 1.8 },
      { type: "emoji", emoji: "🌟", x: 52, y: 47, size: 22, anim: "wiggle", delay: 1.043, dur: 1.64 },
      { type: "emoji", emoji: "💫", x: 54, y: 68, size: 24, anim: "rise", delay: 0.828, dur: 1.2 },
      { type: "emoji", emoji: "💫", x: 76, y: 78, size: 24, anim: "float", delay: 0.518, dur: 1.43 },
      { type: "emoji", emoji: "❄️", x: 81, y: 79, size: 17, anim: "pop", delay: 1.486, dur: 1.71 },
      { type: "emoji", emoji: "💫", x: 56, y: 37, size: 10, anim: "blink", delay: 1.788, dur: 1.95 },
      { type: "emoji", emoji: "💖", x: 21, y: 47, size: 13, anim: "blink", delay: 1.988, dur: 1.12 }
    ],
  },
  crab_winter_8_194: {
    v: 1,
    loop: 4.16,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#7e57c2", opacity: 0.61, anim: "float", dur: 3.7, w: 102.23, h: 18.24 },
      { type: "emoji", emoji: "🦀", x: 31, y: 46, size: 37, anim: "float", dur: 3.39 },
      { type: "emoji", emoji: "👒", x: 48, y: 13, size: 33, anim: "bounce", delay: 0.316, dur: 1.78 },
      { type: "emoji", emoji: "💖", x: 20, y: 30, size: 14, anim: "blink", delay: 1.006, dur: 2.2 },
      { type: "emoji", emoji: "💖", x: 69, y: 42, size: 21, anim: "float", delay: 1.36, dur: 2.16 },
      { type: "emoji", emoji: "🍂", x: 47, y: 61, size: 21, anim: "rise", delay: 1.4, dur: 1.38 },
      { type: "emoji", emoji: "🌟", x: 21, y: 31, size: 25, anim: "blink", delay: 0.671, dur: 1.57 },
      { type: "emoji", emoji: "🎉", x: 81, y: 54, size: 23, anim: "float", delay: 1.024, dur: 1.29 },
      { type: "emoji", emoji: "💖", x: 66, y: 54, size: 19, anim: "blink", delay: 1.578, dur: 1.15 },
      { type: "emoji", emoji: "💫", x: 62, y: 26, size: 10, anim: "blink", delay: 1.225, dur: 1.69 }
    ],
  },
  crab_spring_8_195: {
    v: 1,
    loop: 3.17,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 37, y: 45, size: 33, anim: "float", dur: 3.03 },
      { type: "emoji", emoji: "🎩", x: 48, y: 11, size: 30, anim: "bounce", delay: 0.301, dur: 1.75 },
      { type: "emoji", emoji: "🎀", x: 66, y: 28, size: 16, anim: "float", delay: 0.838, dur: 1.57 },
      { type: "emoji", emoji: "🎉", x: 74, y: 11, size: 25, anim: "pop", delay: 0.146, dur: 2.11 },
      { type: "emoji", emoji: "💖", x: 33, y: 57, size: 14, anim: "pop", delay: 1.038, dur: 1.52 },
      { type: "emoji", emoji: "🌟", x: 71, y: 42, size: 12, anim: "blink", delay: 1.337, dur: 1.72 },
      { type: "emoji", emoji: "⭐", x: 38, y: 28, size: 14, anim: "blink", delay: 1.341, dur: 1.78 }
    ],
  },
  crab_halloween_8_196: {
    v: 1,
    loop: 2.31,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e91e63", opacity: 0.45, anim: "wave", dur: 1.95, r: 40.43 },
      { type: "emoji", emoji: "🦀", x: 55, y: 54, size: 33, anim: "wave", dur: 1.8 },
      { type: "emoji", emoji: "🍦", x: 69, y: 41, size: 27, anim: "blink", delay: 0.853, dur: 1.65 },
      { type: "emoji", emoji: "❤️", x: 16, y: 15, size: 24, anim: "float", delay: 0.03, dur: 1.86 },
      { type: "emoji", emoji: "🌸", x: 78, y: 57, size: 23, anim: "blink", delay: 1.162, dur: 1.53 },
      { type: "emoji", emoji: "🌟", x: 60, y: 77, size: 17, anim: "blink", delay: 1.675, dur: 1.41 },
      { type: "emoji", emoji: "✨", x: 32, y: 79, size: 18, anim: "blink", delay: 1.028, dur: 1.21 }
    ],
  },
  crab_christmas_8_197: {
    v: 1,
    loop: 2.09,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 64, y: 44, size: 43, anim: "bounce", dur: 1.63 },
      { type: "emoji", emoji: "🧣", x: 50, y: 56, size: 26, anim: "bounce", delay: 0.681, dur: 1.84 },
      { type: "emoji", emoji: "🍦", x: 68, y: 42, size: 29, anim: "blink", delay: 0.498, dur: 1.61 },
      { type: "emoji", emoji: "🌟", x: 35, y: 24, size: 14, anim: "pop", delay: 0.987, dur: 2.3 },
      { type: "emoji", emoji: "🌿", x: 34, y: 25, size: 21, anim: "wiggle", delay: 0.534, dur: 1.68 },
      { type: "emoji", emoji: "🍂", x: 80, y: 68, size: 24, anim: "wiggle", delay: 0.843, dur: 2.1 },
      { type: "emoji", emoji: "🍂", x: 25, y: 72, size: 16, anim: "rise", delay: 0.933, dur: 1.91 },
      { type: "emoji", emoji: "⭐", x: 19, y: 78, size: 12, anim: "blink", delay: 1.526, dur: 1.84 },
      { type: "emoji", emoji: "💖", x: 58, y: 57, size: 15, anim: "blink", delay: 0.965, dur: 1.12 }
    ],
  },
  crab_coding_8_198: {
    v: 1,
    loop: 2.28,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffeb3b", opacity: 0.45, anim: "wiggle", dur: 1.4, w: 105.26, h: 22.17 },
      { type: "emoji", emoji: "🦀", x: 45, y: 45, size: 37, anim: "wiggle", dur: 1.37 },
      { type: "emoji", emoji: "🤠", x: 51, y: 14, size: 32, anim: "bounce", delay: 0.385, dur: 1.73 },
      { type: "emoji", emoji: "🌸", x: 70, y: 40, size: 27, anim: "rise", delay: 0.621, dur: 1.68 },
      { type: "emoji", emoji: "🔥", x: 72, y: 39, size: 17, anim: "pop", delay: 1.309, dur: 1.38 },
      { type: "emoji", emoji: "🌿", x: 26, y: 81, size: 17, anim: "rise", delay: 1.221, dur: 1.62 },
      { type: "emoji", emoji: "✨", x: 52, y: 75, size: 10, anim: "blink", delay: 1.776, dur: 1.93 },
      { type: "emoji", emoji: "⭐", x: 46, y: 28, size: 11, anim: "blink", delay: 1.87, dur: 1.57 }
    ],
  },
  crab_music_8_199: {
    v: 1,
    loop: 3.97,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 51, y: 49, size: 34, anim: "breathe", dur: 3.48 },
      { type: "emoji", emoji: "🧢", x: 48, y: 16, size: 29, anim: "bounce", delay: 0.38, dur: 1.78 },
      { type: "emoji", emoji: "💌", x: 68, y: 41, size: 24, anim: "pop", delay: 0.407, dur: 1.73 },
      { type: "emoji", emoji: "⭐", x: 11, y: 65, size: 14, anim: "wiggle", delay: 0.276, dur: 2.1 },
      { type: "emoji", emoji: "🍃", x: 80, y: 69, size: 25, anim: "blink", delay: 0.029, dur: 1.24 },
      { type: "emoji", emoji: "⭐", x: 17, y: 21, size: 17, anim: "blink", delay: 0.549, dur: 1.97 },
      { type: "emoji", emoji: "⭐", x: 22, y: 31, size: 14, anim: "blink", delay: 0.719, dur: 1.85 },
      { type: "emoji", emoji: "💖", x: 47, y: 66, size: 11, anim: "blink", delay: 0.574, dur: 1.26 }
    ],
  },
  crab_sports_8_200: {
    v: 1,
    loop: 2.89,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 45, y: 50, size: 42, anim: "pulse", dur: 1.88 },
      { type: "emoji", emoji: "🧙", x: 49, y: 12, size: 35, anim: "bounce", delay: 0.607, dur: 1.85 },
      { type: "emoji", emoji: "🍄", x: 72, y: 44, size: 25, anim: "float", delay: 0.599, dur: 1.61 },
      { type: "emoji", emoji: "❄️", x: 50, y: 48, size: 20, anim: "wiggle", delay: 0.018, dur: 1.61 },
      { type: "emoji", emoji: "💫", x: 18, y: 79, size: 18, anim: "rise", delay: 0.082, dur: 2.17 },
      { type: "emoji", emoji: "🌟", x: 30, y: 84, size: 18, anim: "pop", delay: 0.829, dur: 1.92 },
      { type: "emoji", emoji: "⭐", x: 68, y: 24, size: 17, anim: "blink", delay: 1.267, dur: 1.72 },
      { type: "emoji", emoji: "💖", x: 80, y: 62, size: 13, anim: "blink", delay: 1.654, dur: 1.2 }
    ],
  },
  crab_food_8_201: {
    v: 1,
    loop: 2.67,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#b3e5fc", opacity: 0.45, anim: "pulse", dur: 2.15, r: 49.19 },
      { type: "emoji", emoji: "🦀", x: 58, y: 47, size: 35, anim: "pulse", dur: 2.2 },
      { type: "emoji", emoji: "🎭", x: 51, y: 29, size: 28, anim: "bounce", delay: 0.384, dur: 1.95 },
      { type: "emoji", emoji: "🍭", x: 69, y: 42, size: 27, anim: "pop", delay: 0.644, dur: 1.58 },
      { type: "emoji", emoji: "💫", x: 76, y: 71, size: 12, anim: "wiggle", delay: 0.058, dur: 1.28 },
      { type: "emoji", emoji: "🍃", x: 76, y: 49, size: 16, anim: "float", delay: 1.244, dur: 1.3 },
      { type: "emoji", emoji: "🌸", x: 53, y: 69, size: 12, anim: "rise", delay: 0.647, dur: 1.94 },
      { type: "emoji", emoji: "❄️", x: 17, y: 47, size: 25, anim: "blink", delay: 0.479, dur: 2.3 },
      { type: "emoji", emoji: "🌟", x: 50, y: 47, size: 16, anim: "blink", delay: 1.9, dur: 1.44 },
      { type: "emoji", emoji: "💖", x: 26, y: 69, size: 12, anim: "blink", delay: 1.283, dur: 1.21 }
    ],
  },
  crab_space_8_202: {
    v: 1,
    loop: 3.23,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#f57c00", opacity: 0.56, anim: "float", dur: 2.8, r: 41.5 },
      { type: "emoji", emoji: "🦀", x: 49, y: 47, size: 34, anim: "float", dur: 2.71 },
      { type: "emoji", emoji: "⭐", x: 67, y: 28, size: 23, anim: "pop", delay: 0.965, dur: 1.43 },
      { type: "emoji", emoji: "💖", x: 79, y: 50, size: 19, anim: "pop", delay: 1.237, dur: 2.02 },
      { type: "emoji", emoji: "❄️", x: 50, y: 33, size: 19, anim: "blink", delay: 1.071, dur: 2.39 },
      { type: "emoji", emoji: "💫", x: 36, y: 49, size: 21, anim: "rise", delay: 1.302, dur: 1.84 },
      { type: "emoji", emoji: "⭐", x: 26, y: 81, size: 18, anim: "pop", delay: 0.91, dur: 1.94 },
      { type: "emoji", emoji: "❄️", x: 49, y: 67, size: 14, anim: "rise", delay: 0.267, dur: 1.89 },
      { type: "emoji", emoji: "⭐", x: 51, y: 58, size: 17, anim: "blink", delay: 1.698, dur: 1.47 },
      { type: "emoji", emoji: "⭐", x: 22, y: 51, size: 14, anim: "blink", delay: 0.839, dur: 1.37 }
    ],
  },
  crab_fantasy_8_203: {
    v: 1,
    loop: 3.47,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#c8e6c9", opacity: 0.44, anim: "settle", dur: 2.91, w: 100.62, h: 19.36 },
      { type: "emoji", emoji: "🦀", x: 68, y: 47, size: 33, anim: "settle", dur: 2.93 },
      { type: "emoji", emoji: "👑", x: 52, y: 14, size: 31, anim: "bounce", delay: 0.548, dur: 1.66 },
      { type: "emoji", emoji: "🌹", x: 73, y: 43, size: 26, anim: "pop", delay: 0.743, dur: 1.75 },
      { type: "emoji", emoji: "❄️", x: 70, y: 54, size: 25, anim: "rise", delay: 0.772, dur: 1.27 },
      { type: "emoji", emoji: "🔥", x: 87, y: 16, size: 18, anim: "blink", delay: 0.494, dur: 2.36 },
      { type: "emoji", emoji: "✨", x: 23, y: 25, size: 14, anim: "blink", delay: 1.375, dur: 1.86 },
      { type: "emoji", emoji: "💫", x: 50, y: 50, size: 12, anim: "blink", delay: 0.503, dur: 1.86 }
    ],
  },
  crab_office_8_204: {
    v: 1,
    loop: 2.02,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#9575cd", opacity: 0.49, anim: "bounce", dur: 1.06, r: 49.51 },
      { type: "emoji", emoji: "🦀", x: 32, y: 47, size: 41, anim: "bounce", dur: 1.19 },
      { type: "emoji", emoji: "🧙", x: 50, y: 11, size: 33, anim: "bounce", delay: 0.527, dur: 1.62 },
      { type: "emoji", emoji: "🌸", x: 71, y: 45, size: 27, anim: "rise", delay: 0.737, dur: 1.7 },
      { type: "emoji", emoji: "🍃", x: 82, y: 21, size: 24, anim: "wiggle", delay: 1.446, dur: 1.72 },
      { type: "emoji", emoji: "🌊", x: 64, y: 26, size: 24, anim: "blink", delay: 1.166, dur: 1.85 },
      { type: "emoji", emoji: "🌟", x: 65, y: 49, size: 23, anim: "wiggle", delay: 1.26, dur: 1.92 },
      { type: "emoji", emoji: "✨", x: 53, y: 77, size: 15, anim: "blink", delay: 1.562, dur: 1.06 },
      { type: "emoji", emoji: "🌟", x: 51, y: 81, size: 18, anim: "blink", delay: 0.967, dur: 1.76 }
    ],
  },
  crab_fitness_8_205: {
    v: 1,
    loop: 2.94,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fbe9e7", opacity: 0.51, anim: "twinkle", dur: 2.42, r: 43.34 },
      { type: "emoji", emoji: "🦀", x: 42, y: 48, size: 35, anim: "twinkle", dur: 2.64 },
      { type: "emoji", emoji: "🧙", x: 49, y: 13, size: 35, anim: "bounce", delay: 0.432, dur: 2 },
      { type: "emoji", emoji: "🎀", x: 67, y: 32, size: 16, anim: "blink", delay: 0.616, dur: 1.84 },
      { type: "emoji", emoji: "💫", x: 21, y: 84, size: 22, anim: "pop", delay: 0.559, dur: 1.32 },
      { type: "emoji", emoji: "🔥", x: 21, y: 45, size: 23, anim: "rise", delay: 1.344, dur: 2.02 },
      { type: "emoji", emoji: "❄️", x: 32, y: 63, size: 12, anim: "pop", delay: 1.409, dur: 1.88 },
      { type: "emoji", emoji: "🌟", x: 47, y: 57, size: 15, anim: "rise", delay: 1.075, dur: 1.62 },
      { type: "emoji", emoji: "💫", x: 64, y: 39, size: 14, anim: "blink", delay: 1.189, dur: 1.74 },
      { type: "emoji", emoji: "💖", x: 50, y: 74, size: 18, anim: "blink", delay: 1.596, dur: 1.97 }
    ],
  },
  crab_travel_8_206: {
    v: 1,
    loop: 3.36,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ec407a", opacity: 0.65, anim: "float", dur: 2.96, w: 93.67, h: 21.9 },
      { type: "emoji", emoji: "🦀", x: 68, y: 50, size: 41, anim: "float", dur: 2.93 },
      { type: "emoji", emoji: "🪖", x: 50, y: 16, size: 30, anim: "bounce", delay: 0.32, dur: 1.68 },
      { type: "emoji", emoji: "🍫", x: 68, y: 42, size: 26, anim: "rise", delay: 0.746, dur: 1.69 },
      { type: "emoji", emoji: "🎉", x: 10, y: 71, size: 23, anim: "blink", delay: 1.408, dur: 1.56 },
      { type: "emoji", emoji: "🎊", x: 42, y: 24, size: 21, anim: "wiggle", delay: 0.586, dur: 2.16 },
      { type: "emoji", emoji: "✨", x: 71, y: 20, size: 12, anim: "blink", delay: 1.809, dur: 1 },
      { type: "emoji", emoji: "💫", x: 25, y: 23, size: 14, anim: "blink", delay: 1.188, dur: 1.82 }
    ],
  },
  crab_art_8_207: {
    v: 1,
    loop: 2.13,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ba68c8", opacity: 0.47, anim: "pop", dur: 1.69, r: 46.91 },
      { type: "emoji", emoji: "🦀", x: 36, y: 53, size: 41, anim: "pop", dur: 1.55 },
      { type: "emoji", emoji: "🍳", x: 50, y: 17, size: 28, anim: "bounce", delay: 0.641, dur: 1.8 },
      { type: "emoji", emoji: "🎁", x: 70, y: 38, size: 27, anim: "pop", delay: 0.904, dur: 1.96 },
      { type: "emoji", emoji: "🔥", x: 85, y: 16, size: 14, anim: "blink", delay: 0.574, dur: 1.47 },
      { type: "emoji", emoji: "🎈", x: 17, y: 40, size: 20, anim: "float", delay: 1.307, dur: 2.36 },
      { type: "emoji", emoji: "💖", x: 69, y: 59, size: 17, anim: "pop", delay: 1.105, dur: 1.39 },
      { type: "emoji", emoji: "⭐", x: 26, y: 75, size: 13, anim: "blink", delay: 0.55, dur: 1.12 },
      { type: "emoji", emoji: "⭐", x: 61, y: 81, size: 14, anim: "blink", delay: 1.953, dur: 1.4 }
    ],
  },
  crab_science_8_208: {
    v: 1,
    loop: 2.84,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff176", opacity: 0.53, anim: "heartbeat", dur: 2.53, w: 101.43, h: 24.7 },
      { type: "emoji", emoji: "🦀", x: 57, y: 46, size: 41, anim: "heartbeat", dur: 2.65 },
      { type: "emoji", emoji: "🍳", x: 48, y: 15, size: 28, anim: "bounce", delay: 0.605, dur: 1.66 },
      { type: "emoji", emoji: "🌟", x: 71, y: 57, size: 17, anim: "rise", delay: 0.148, dur: 1.39 },
      { type: "emoji", emoji: "❄️", x: 47, y: 86, size: 25, anim: "pop", delay: 1.156, dur: 1.65 },
      { type: "emoji", emoji: "🎉", x: 26, y: 37, size: 22, anim: "float", delay: 0.203, dur: 1.86 },
      { type: "emoji", emoji: "🌟", x: 61, y: 83, size: 13, anim: "blink", delay: 1.711, dur: 1.38 },
      { type: "emoji", emoji: "💫", x: 40, y: 63, size: 11, anim: "blink", delay: 1.115, dur: 1.95 }
    ],
  },
  crab_pets_8_209: {
    v: 1,
    loop: 3.75,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 69, y: 47, size: 34, anim: "float", dur: 3.46 },
      { type: "emoji", emoji: "🎭", x: 49, y: 27, size: 28, anim: "bounce", delay: 0.529, dur: 1.77 },
      { type: "emoji", emoji: "🍫", x: 68, y: 46, size: 24, anim: "float", delay: 0.949, dur: 1.84 },
      { type: "emoji", emoji: "⭐", x: 66, y: 21, size: 21, anim: "wiggle", delay: 1.031, dur: 1.83 },
      { type: "emoji", emoji: "💫", x: 12, y: 75, size: 14, anim: "pop", delay: 0.085, dur: 2.18 },
      { type: "emoji", emoji: "🍃", x: 76, y: 19, size: 19, anim: "pop", delay: 0.056, dur: 2.14 },
      { type: "emoji", emoji: "💖", x: 42, y: 63, size: 12, anim: "blink", delay: 0.644, dur: 1.24 },
      { type: "emoji", emoji: "✨", x: 30, y: 70, size: 11, anim: "blink", delay: 1.75, dur: 1.65 }
    ],
  },
  crab_magic_8_210: {
    v: 1,
    loop: 2.89,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff0f6", opacity: 0.35, anim: "float", dur: 2.96, w: 97.44, h: 25.98 },
      { type: "emoji", emoji: "🦀", x: 34, y: 54, size: 40, anim: "float", dur: 3.13 },
      { type: "emoji", emoji: "🍂", x: 12, y: 55, size: 17, anim: "float", delay: 1.033, dur: 1.89 },
      { type: "emoji", emoji: "💖", x: 54, y: 28, size: 19, anim: "rise", delay: 0.258, dur: 1.52 },
      { type: "emoji", emoji: "⭐", x: 78, y: 41, size: 18, anim: "blink", delay: 1.771, dur: 1.5 },
      { type: "emoji", emoji: "🌟", x: 84, y: 67, size: 17, anim: "blink", delay: 0.826, dur: 1.29 }
    ],
  },
  crab_retro_8_211: {
    v: 1,
    loop: 2.54,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#81d4fa", opacity: 0.44, anim: "wave", dur: 1.59, r: 47.25 },
      { type: "emoji", emoji: "🦀", x: 61, y: 56, size: 32, anim: "wave", dur: 1.84 },
      { type: "emoji", emoji: "🎓", x: 50, y: 16, size: 26, anim: "bounce", delay: 0.495, dur: 1.84 },
      { type: "emoji", emoji: "🌹", x: 70, y: 42, size: 26, anim: "float", delay: 0.763, dur: 1.55 },
      { type: "emoji", emoji: "🎈", x: 61, y: 70, size: 18, anim: "float", delay: 0.028, dur: 1.41 },
      { type: "emoji", emoji: "🔥", x: 22, y: 41, size: 25, anim: "pop", delay: 1.115, dur: 2.4 },
      { type: "emoji", emoji: "🌊", x: 31, y: 52, size: 13, anim: "float", delay: 0.123, dur: 1.6 },
      { type: "emoji", emoji: "🎊", x: 80, y: 27, size: 20, anim: "blink", delay: 0.18, dur: 1.55 },
      { type: "emoji", emoji: "🌟", x: 79, y: 79, size: 18, anim: "blink", delay: 1.536, dur: 1.09 },
      { type: "emoji", emoji: "✨", x: 73, y: 36, size: 19, anim: "blink", delay: 1.399, dur: 1.15 }
    ],
  },
  crab_cyber_8_212: {
    v: 1,
    loop: 1.83,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 33, y: 46, size: 34, anim: "bounce", dur: 1.37 },
      { type: "emoji", emoji: "🎁", x: 73, y: 42, size: 24, anim: "float", delay: 0.855, dur: 1.8 },
      { type: "emoji", emoji: "🌟", x: 77, y: 41, size: 13, anim: "float", delay: 0.65, dur: 1.63 },
      { type: "emoji", emoji: "⭐", x: 50, y: 50, size: 19, anim: "blink", delay: 1.961, dur: 1.28 },
      { type: "emoji", emoji: "✨", x: 45, y: 76, size: 13, anim: "blink", delay: 1.456, dur: 1.78 }
    ],
  },
  crab_nature_8_213: {
    v: 1,
    loop: 2.04,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#43a047", opacity: 0.68, anim: "wiggle", dur: 1.61, r: 42.36 },
      { type: "emoji", emoji: "🦀", x: 58, y: 49, size: 40, anim: "wiggle", dur: 1.43 },
      { type: "emoji", emoji: "🍀", x: 75, y: 46, size: 24, anim: "blink", delay: 0.708, dur: 1.87 },
      { type: "emoji", emoji: "🎉", x: 25, y: 62, size: 13, anim: "blink", delay: 0.988, dur: 1.25 },
      { type: "emoji", emoji: "🌟", x: 60, y: 68, size: 15, anim: "blink", delay: 0.585, dur: 2.09 },
      { type: "emoji", emoji: "🌟", x: 74, y: 62, size: 12, anim: "blink", delay: 0.69, dur: 1.12 },
      { type: "emoji", emoji: "💖", x: 21, y: 59, size: 14, anim: "blink", delay: 1.643, dur: 1.18 }
    ],
  },
  crab_underwater_8_214: {
    v: 1,
    loop: 3.78,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#b39ddb", opacity: 0.37, anim: "breathe", dur: 3.43, w: 100.85, h: 26.81 },
      { type: "emoji", emoji: "🦀", x: 64, y: 45, size: 33, anim: "breathe", dur: 3.36 },
      { type: "emoji", emoji: "🍄", x: 68, y: 46, size: 24, anim: "pop", delay: 0.554, dur: 1.99 },
      { type: "emoji", emoji: "🎉", x: 30, y: 25, size: 16, anim: "rise", delay: 1.423, dur: 2.33 },
      { type: "emoji", emoji: "💫", x: 87, y: 31, size: 16, anim: "blink", delay: 0.935, dur: 1.29 },
      { type: "emoji", emoji: "🌟", x: 74, y: 56, size: 17, anim: "blink", delay: 1.137, dur: 1.89 },
      { type: "emoji", emoji: "💖", x: 61, y: 32, size: 16, anim: "blink", delay: 1.318, dur: 1.82 }
    ],
  },
  crab_sky_8_215: {
    v: 1,
    loop: 2.79,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 41, y: 49, size: 34, anim: "pulse", dur: 2.14 },
      { type: "emoji", emoji: "🎩", x: 51, y: 11, size: 30, anim: "bounce", delay: 0.666, dur: 1.92 },
      { type: "emoji", emoji: "🍀", x: 74, y: 46, size: 22, anim: "rise", delay: 0.833, dur: 1.61 },
      { type: "emoji", emoji: "❤️", x: 48, y: 43, size: 19, anim: "float", delay: 1.167, dur: 1.52 },
      { type: "emoji", emoji: "🌟", x: 68, y: 15, size: 18, anim: "rise", delay: 0.774, dur: 1.94 },
      { type: "emoji", emoji: "⭐", x: 46, y: 14, size: 24, anim: "blink", delay: 0.692, dur: 1.55 },
      { type: "emoji", emoji: "❄️", x: 12, y: 79, size: 19, anim: "float", delay: 1.373, dur: 1.65 },
      { type: "emoji", emoji: "🌟", x: 60, y: 35, size: 10, anim: "blink", delay: 1.182, dur: 1.96 },
      { type: "emoji", emoji: "✨", x: 64, y: 47, size: 17, anim: "blink", delay: 1.775, dur: 1.58 }
    ],
  },
  crab_party_9_216: {
    v: 1,
    loop: 2.32,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#f06292", opacity: 0.59, anim: "pulse", dur: 2.16, r: 41 },
      { type: "emoji", emoji: "🦀", x: 44, y: 55, size: 42, anim: "pulse", dur: 2.35 },
      { type: "emoji", emoji: "🍭", x: 70, y: 41, size: 25, anim: "float", delay: 0.955, dur: 1.8 },
      { type: "emoji", emoji: "💖", x: 30, y: 67, size: 17, anim: "rise", delay: 1.204, dur: 2.13 },
      { type: "emoji", emoji: "🌊", x: 23, y: 59, size: 15, anim: "blink", delay: 0.984, dur: 1.22 },
      { type: "emoji", emoji: "✨", x: 40, y: 43, size: 23, anim: "float", delay: 0.219, dur: 2.2 },
      { type: "emoji", emoji: "🍂", x: 49, y: 57, size: 21, anim: "blink", delay: 1.299, dur: 1.57 },
      { type: "emoji", emoji: "🔥", x: 21, y: 69, size: 13, anim: "pop", delay: 0.357, dur: 1.38 },
      { type: "emoji", emoji: "✨", x: 71, y: 56, size: 16, anim: "blink", delay: 0.679, dur: 1.07 },
      { type: "emoji", emoji: "💖", x: 22, y: 70, size: 18, anim: "blink", delay: 0.903, dur: 1.54 }
    ],
  },
  crab_beach_9_217: {
    v: 1,
    loop: 2.97,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ab47bc", opacity: 0.39, anim: "float", dur: 2.8, r: 48.86 },
      { type: "emoji", emoji: "🦀", x: 50, y: 45, size: 38, anim: "float", dur: 2.68 },
      { type: "emoji", emoji: "👑", x: 52, y: 13, size: 32, anim: "bounce", delay: 0.474, dur: 1.81 },
      { type: "emoji", emoji: "🌟", x: 72, y: 27, size: 25, anim: "pop", delay: 0.91, dur: 1.6 },
      { type: "emoji", emoji: "🍂", x: 80, y: 38, size: 19, anim: "rise", delay: 1.415, dur: 1.36 },
      { type: "emoji", emoji: "🍂", x: 61, y: 82, size: 17, anim: "float", delay: 0.165, dur: 2.4 },
      { type: "emoji", emoji: "🌟", x: 66, y: 59, size: 11, anim: "blink", delay: 1.095, dur: 1.61 },
      { type: "emoji", emoji: "⭐", x: 40, y: 20, size: 13, anim: "blink", delay: 1.648, dur: 1.22 }
    ],
  },
  crab_winter_9_218: {
    v: 1,
    loop: 3.35,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fff176", opacity: 0.57, anim: "settle", dur: 3.15, r: 45.87 },
      { type: "emoji", emoji: "🦀", x: 45, y: 47, size: 33, anim: "settle", dur: 2.94 },
      { type: "emoji", emoji: "🕶️", x: 51, y: 29, size: 28, anim: "bounce", delay: 0.399, dur: 1.6 },
      { type: "emoji", emoji: "⭐", x: 68, y: 33, size: 22, anim: "pop", delay: 0.57, dur: 1.75 },
      { type: "emoji", emoji: "🎉", x: 24, y: 21, size: 16, anim: "rise", delay: 0.309, dur: 1.64 },
      { type: "emoji", emoji: "🌸", x: 15, y: 70, size: 13, anim: "rise", delay: 1.156, dur: 1.91 },
      { type: "emoji", emoji: "💖", x: 52, y: 45, size: 14, anim: "rise", delay: 0.968, dur: 1.75 },
      { type: "emoji", emoji: "💫", x: 54, y: 39, size: 24, anim: "pop", delay: 1.451, dur: 1.66 },
      { type: "emoji", emoji: "🌟", x: 29, y: 35, size: 12, anim: "blink", delay: 0.962, dur: 1.15 },
      { type: "emoji", emoji: "⭐", x: 53, y: 49, size: 16, anim: "blink", delay: 0.676, dur: 1.59 }
    ],
  },
  crab_spring_9_219: {
    v: 1,
    loop: 2.09,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#7986cb", opacity: 0.65, anim: "bounce", dur: 1.07, r: 49.61 },
      { type: "emoji", emoji: "🦀", x: 35, y: 45, size: 38, anim: "bounce", dur: 1.43 },
      { type: "emoji", emoji: "🎩", x: 51, y: 13, size: 30, anim: "bounce", delay: 0.39, dur: 1.99 },
      { type: "emoji", emoji: "🎀", x: 67, y: 32, size: 16, anim: "pop", delay: 0.754, dur: 1.52 },
      { type: "emoji", emoji: "🎈", x: 39, y: 17, size: 24, anim: "rise", delay: 1.053, dur: 2.25 },
      { type: "emoji", emoji: "🌊", x: 82, y: 23, size: 14, anim: "pop", delay: 0.772, dur: 2.22 },
      { type: "emoji", emoji: "🌿", x: 36, y: 26, size: 22, anim: "float", delay: 0.684, dur: 1.7 },
      { type: "emoji", emoji: "🍂", x: 60, y: 60, size: 12, anim: "blink", delay: 1.162, dur: 2.18 },
      { type: "emoji", emoji: "💖", x: 55, y: 73, size: 12, anim: "blink", delay: 1.105, dur: 1.34 },
      { type: "emoji", emoji: "⭐", x: 50, y: 70, size: 19, anim: "blink", delay: 1.362, dur: 1.01 }
    ],
  },
  crab_halloween_9_220: {
    v: 1,
    loop: 3.06,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffe6e6", opacity: 0.44, anim: "twinkle", dur: 2.38, w: 107.98, h: 25.62 },
      { type: "emoji", emoji: "🦀", x: 58, y: 46, size: 33, anim: "twinkle", dur: 2.45 },
      { type: "emoji", emoji: "🍀", x: 71, y: 46, size: 23, anim: "rise", delay: 0.851, dur: 1.98 },
      { type: "emoji", emoji: "🌊", x: 85, y: 13, size: 17, anim: "wiggle", delay: 1.02, dur: 1.84 },
      { type: "emoji", emoji: "🌟", x: 48, y: 21, size: 15, anim: "wiggle", delay: 0.174, dur: 1.29 },
      { type: "emoji", emoji: "🌟", x: 21, y: 19, size: 11, anim: "blink", delay: 1.385, dur: 1.46 },
      { type: "emoji", emoji: "🌟", x: 65, y: 40, size: 13, anim: "blink", delay: 0.838, dur: 1.96 }
    ],
  },
  crab_christmas_9_221: {
    v: 1,
    loop: 3.33,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#0288d1", opacity: 0.65, anim: "float", dur: 2.83, r: 44.74 },
      { type: "emoji", emoji: "🦀", x: 40, y: 48, size: 36, anim: "float", dur: 2.91 },
      { type: "emoji", emoji: "👑", x: 51, y: 13, size: 30, anim: "bounce", delay: 0.57, dur: 1.95 },
      { type: "emoji", emoji: "🌹", x: 72, y: 44, size: 29, anim: "pop", delay: 0.985, dur: 1.81 },
      { type: "emoji", emoji: "🌊", x: 58, y: 40, size: 23, anim: "pop", delay: 1.112, dur: 1.88 },
      { type: "emoji", emoji: "🌊", x: 87, y: 84, size: 19, anim: "pop", delay: 1.226, dur: 1.54 },
      { type: "emoji", emoji: "💖", x: 18, y: 35, size: 14, anim: "pop", delay: 1.183, dur: 2.02 },
      { type: "emoji", emoji: "✨", x: 56, y: 37, size: 20, anim: "rise", delay: 1.415, dur: 1.5 },
      { type: "emoji", emoji: "💖", x: 39, y: 28, size: 19, anim: "blink", delay: 0.999, dur: 1.94 },
      { type: "emoji", emoji: "💫", x: 19, y: 80, size: 17, anim: "blink", delay: 1.195, dur: 1.8 }
    ],
  },
  crab_coding_9_222: {
    v: 1,
    loop: 2.12,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ffa726", opacity: 0.66, anim: "pop", dur: 1.4, w: 94.44, h: 20.84 },
      { type: "emoji", emoji: "🦀", x: 36, y: 44, size: 38, anim: "pop", dur: 1.74 },
      { type: "emoji", emoji: "👮", x: 51, y: 17, size: 29, anim: "bounce", delay: 0.498, dur: 1.7 },
      { type: "emoji", emoji: "🔥", x: 66, y: 32, size: 14, anim: "wiggle", delay: 0.658, dur: 1.21 },
      { type: "emoji", emoji: "💫", x: 75, y: 76, size: 22, anim: "blink", delay: 1.206, dur: 1.39 },
      { type: "emoji", emoji: "❤️", x: 87, y: 66, size: 19, anim: "blink", delay: 0.043, dur: 1.59 },
      { type: "emoji", emoji: "🎉", x: 78, y: 39, size: 20, anim: "wiggle", delay: 0.659, dur: 1.54 },
      { type: "emoji", emoji: "🌟", x: 43, y: 27, size: 24, anim: "pop", delay: 0.761, dur: 2.05 },
      { type: "emoji", emoji: "🌟", x: 23, y: 80, size: 19, anim: "blink", delay: 0.546, dur: 1.69 },
      { type: "emoji", emoji: "🌟", x: 66, y: 23, size: 15, anim: "blink", delay: 1.546, dur: 1.37 }
    ],
  },
  crab_music_9_223: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 57, y: 51, size: 40, anim: "heartbeat", dur: 2.39 },
      { type: "emoji", emoji: "🌸", x: 72, y: 42, size: 24, anim: "float", delay: 0.741, dur: 1.81 },
      { type: "emoji", emoji: "🍂", x: 53, y: 64, size: 22, anim: "rise", delay: 1.223, dur: 2.28 },
      { type: "emoji", emoji: "⭐", x: 27, y: 50, size: 14, anim: "blink", delay: 1.071, dur: 2.33 },
      { type: "emoji", emoji: "💫", x: 33, y: 25, size: 12, anim: "blink", delay: 0.997, dur: 1.99 },
      { type: "emoji", emoji: "✨", x: 58, y: 72, size: 15, anim: "blink", delay: 1.084, dur: 1.61 }
    ],
  },
  crab_sports_9_224: {
    v: 1,
    loop: 4.01,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 68, y: 52, size: 35, anim: "float", dur: 3.37 },
      { type: "emoji", emoji: "💫", x: 29, y: 53, size: 24, anim: "float", delay: 1.01, dur: 1.97 },
      { type: "emoji", emoji: "✨", x: 72, y: 52, size: 19, anim: "blink", delay: 0.507, dur: 1.4 },
      { type: "emoji", emoji: "💖", x: 25, y: 28, size: 12, anim: "blink", delay: 1.966, dur: 1.37 },
      { type: "emoji", emoji: "💖", x: 74, y: 78, size: 13, anim: "blink", delay: 1.995, dur: 1.77 }
    ],
  },
  crab_food_9_225: {
    v: 1,
    loop: 3.17,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ff8a65", opacity: 0.52, anim: "float", dur: 2.76, r: 41.77 },
      { type: "emoji", emoji: "🦀", x: 40, y: 51, size: 37, anim: "float", dur: 2.92 },
      { type: "emoji", emoji: "🎁", x: 70, y: 39, size: 27, anim: "pop", delay: 0.736, dur: 1.49 },
      { type: "emoji", emoji: "💫", x: 14, y: 10, size: 24, anim: "pop", delay: 0.372, dur: 2.25 },
      { type: "emoji", emoji: "💖", x: 13, y: 87, size: 17, anim: "wiggle", delay: 1.458, dur: 2.03 },
      { type: "emoji", emoji: "🍃", x: 60, y: 41, size: 24, anim: "blink", delay: 0.532, dur: 2.15 },
      { type: "emoji", emoji: "💫", x: 77, y: 38, size: 16, anim: "blink", delay: 1.518, dur: 1.24 },
      { type: "emoji", emoji: "✨", x: 49, y: 55, size: 12, anim: "blink", delay: 0.857, dur: 1.87 }
    ],
  },
  crab_space_9_226: {
    v: 1,
    loop: 2.34,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 70, y: 45, size: 40, anim: "wave", dur: 1.78 },
      { type: "emoji", emoji: "👑", x: 48, y: 13, size: 31, anim: "bounce", delay: 0.304, dur: 1.5 },
      { type: "emoji", emoji: "🍭", x: 71, y: 43, size: 25, anim: "rise", delay: 0.982, dur: 1.88 },
      { type: "emoji", emoji: "❄️", x: 74, y: 30, size: 17, anim: "pop", delay: 0.017, dur: 2.19 },
      { type: "emoji", emoji: "🌊", x: 67, y: 50, size: 18, anim: "float", delay: 0.486, dur: 1.72 },
      { type: "emoji", emoji: "🌟", x: 25, y: 40, size: 13, anim: "blink", delay: 0.847, dur: 1.81 },
      { type: "emoji", emoji: "💖", x: 27, y: 44, size: 18, anim: "blink", delay: 0.811, dur: 1.46 }
    ],
  },
  crab_fantasy_9_227: {
    v: 1,
    loop: 2.23,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ba68c8", opacity: 0.51, anim: "bounce", dur: 1.36, w: 91.82, h: 22.56 },
      { type: "emoji", emoji: "🦀", x: 44, y: 55, size: 41, anim: "bounce", dur: 1.58 },
      { type: "emoji", emoji: "🪖", x: 52, y: 17, size: 29, anim: "bounce", delay: 0.564, dur: 1.99 },
      { type: "emoji", emoji: "⭐", x: 37, y: 84, size: 15, anim: "blink", delay: 1.325, dur: 1.67 },
      { type: "emoji", emoji: "❄️", x: 75, y: 75, size: 23, anim: "wiggle", delay: 1.418, dur: 1.23 },
      { type: "emoji", emoji: "🌟", x: 62, y: 41, size: 10, anim: "blink", delay: 1.086, dur: 1.65 },
      { type: "emoji", emoji: "✨", x: 27, y: 43, size: 10, anim: "blink", delay: 1.511, dur: 1.54 }
    ],
  },
  crab_office_9_228: {
    v: 1,
    loop: 2.37,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff9c4", opacity: 0.56, anim: "wiggle", dur: 1.51, w: 95.24, h: 24.04 },
      { type: "emoji", emoji: "🦀", x: 66, y: 49, size: 40, anim: "wiggle", dur: 1.46 },
      { type: "emoji", emoji: "👑", x: 49, y: 14, size: 31, anim: "bounce", delay: 0.568, dur: 1.86 },
      { type: "emoji", emoji: "🍄", x: 70, y: 45, size: 26, anim: "rise", delay: 0.611, dur: 1.75 },
      { type: "emoji", emoji: "🎈", x: 14, y: 48, size: 14, anim: "float", delay: 0.012, dur: 1.67 },
      { type: "emoji", emoji: "🌊", x: 20, y: 13, size: 24, anim: "rise", delay: 1.127, dur: 2 },
      { type: "emoji", emoji: "🌿", x: 69, y: 82, size: 16, anim: "blink", delay: 0.142, dur: 1.57 },
      { type: "emoji", emoji: "⭐", x: 30, y: 73, size: 14, anim: "blink", delay: 0.888, dur: 1.37 },
      { type: "emoji", emoji: "✨", x: 21, y: 43, size: 15, anim: "blink", delay: 1.575, dur: 1.62 }
    ],
  },
  crab_fitness_9_229: {
    v: 1,
    loop: 4.04,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#3949ab", opacity: 0.57, anim: "breathe", dur: 3.53, w: 105.7, h: 25.44 },
      { type: "emoji", emoji: "🦀", x: 54, y: 56, size: 39, anim: "breathe", dur: 3.52 },
      { type: "emoji", emoji: "👒", x: 48, y: 14, size: 35, anim: "bounce", delay: 0.588, dur: 1.91 },
      { type: "emoji", emoji: "🍦", x: 68, y: 44, size: 26, anim: "blink", delay: 0.528, dur: 1.98 },
      { type: "emoji", emoji: "🌊", x: 69, y: 48, size: 19, anim: "rise", delay: 1.089, dur: 1.46 },
      { type: "emoji", emoji: "🎉", x: 73, y: 68, size: 25, anim: "rise", delay: 0.465, dur: 1.84 },
      { type: "emoji", emoji: "🍂", x: 64, y: 45, size: 21, anim: "blink", delay: 1.375, dur: 2.25 },
      { type: "emoji", emoji: "🌟", x: 62, y: 88, size: 16, anim: "blink", delay: 1.043, dur: 1.84 },
      { type: "emoji", emoji: "🔥", x: 65, y: 42, size: 19, anim: "blink", delay: 1.428, dur: 1.65 },
      { type: "emoji", emoji: "💫", x: 48, y: 36, size: 18, anim: "blink", delay: 0.826, dur: 1.32 },
      { type: "emoji", emoji: "💫", x: 60, y: 33, size: 17, anim: "blink", delay: 0.726, dur: 1.98 }
    ],
  },
  crab_travel_9_230: {
    v: 1,
    loop: 3.03,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e1f5fe", opacity: 0.55, anim: "pulse", dur: 2.06, r: 40.47 },
      { type: "emoji", emoji: "🦀", x: 50, y: 50, size: 33, anim: "pulse", dur: 2.03 },
      { type: "emoji", emoji: "🤠", x: 51, y: 15, size: 30, anim: "bounce", delay: 0.425, dur: 1.69 },
      { type: "emoji", emoji: "🍩", x: 67, y: 44, size: 26, anim: "blink", delay: 0.577, dur: 1.9 },
      { type: "emoji", emoji: "✨", x: 33, y: 38, size: 20, anim: "rise", delay: 1.176, dur: 1.64 },
      { type: "emoji", emoji: "🔥", x: 44, y: 30, size: 25, anim: "wiggle", delay: 1.206, dur: 1.99 },
      { type: "emoji", emoji: "🔥", x: 36, y: 10, size: 20, anim: "float", delay: 0.487, dur: 1.85 },
      { type: "emoji", emoji: "🍂", x: 11, y: 73, size: 21, anim: "pop", delay: 1.444, dur: 1.92 },
      { type: "emoji", emoji: "💫", x: 49, y: 71, size: 15, anim: "blink", delay: 1.439, dur: 1.1 },
      { type: "emoji", emoji: "💫", x: 62, y: 54, size: 11, anim: "blink", delay: 0.98, dur: 1.71 }
    ],
  },
  crab_art_9_231: {
    v: 1,
    loop: 2.47,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#81d4fa", opacity: 0.49, anim: "pulse", dur: 2.05, r: 40.99 },
      { type: "emoji", emoji: "🦀", x: 33, y: 48, size: 42, anim: "pulse", dur: 2.08 },
      { type: "emoji", emoji: "🍫", x: 68, y: 45, size: 25, anim: "blink", delay: 0.911, dur: 1.98 },
      { type: "emoji", emoji: "⭐", x: 24, y: 75, size: 14, anim: "rise", delay: 0.673, dur: 1.27 },
      { type: "emoji", emoji: "🍃", x: 23, y: 40, size: 20, anim: "rise", delay: 1.028, dur: 1.95 },
      { type: "emoji", emoji: "🌸", x: 47, y: 15, size: 24, anim: "float", delay: 0.548, dur: 1.21 },
      { type: "emoji", emoji: "💫", x: 46, y: 42, size: 16, anim: "blink", delay: 1.201, dur: 1.78 },
      { type: "emoji", emoji: "⭐", x: 54, y: 84, size: 11, anim: "blink", delay: 0.56, dur: 1.47 }
    ],
  },
  crab_science_9_232: {
    v: 1,
    loop: 2.89,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 33, y: 51, size: 39, anim: "float", dur: 2.76 },
      { type: "emoji", emoji: "🌿", x: 84, y: 57, size: 25, anim: "float", delay: 0.304, dur: 1.88 },
      { type: "emoji", emoji: "⭐", x: 17, y: 68, size: 18, anim: "float", delay: 1.242, dur: 1.61 },
      { type: "emoji", emoji: "❄️", x: 34, y: 67, size: 18, anim: "blink", delay: 0.15, dur: 2.02 },
      { type: "emoji", emoji: "💖", x: 29, y: 47, size: 17, anim: "wiggle", delay: 0.346, dur: 2.16 },
      { type: "emoji", emoji: "💖", x: 18, y: 22, size: 11, anim: "blink", delay: 0.745, dur: 1.34 },
      { type: "emoji", emoji: "💫", x: 40, y: 68, size: 19, anim: "blink", delay: 1.639, dur: 1.76 }
    ],
  },
  crab_pets_9_233: {
    v: 1,
    loop: 3.3,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 37, y: 45, size: 34, anim: "settle", dur: 3.13 },
      { type: "emoji", emoji: "🌟", x: 74, y: 28, size: 24, anim: "rise", delay: 0.683, dur: 1.85 },
      { type: "emoji", emoji: "🔥", x: 84, y: 73, size: 12, anim: "blink", delay: 1.49, dur: 1.62 },
      { type: "emoji", emoji: "🎉", x: 57, y: 40, size: 20, anim: "float", delay: 0.929, dur: 1.76 },
      { type: "emoji", emoji: "🌟", x: 64, y: 60, size: 18, anim: "pop", delay: 1.09, dur: 1.66 },
      { type: "emoji", emoji: "🌊", x: 67, y: 30, size: 25, anim: "float", delay: 1.353, dur: 2.29 },
      { type: "emoji", emoji: "🎈", x: 41, y: 59, size: 22, anim: "float", delay: 0.987, dur: 1.79 },
      { type: "emoji", emoji: "💫", x: 50, y: 57, size: 17, anim: "blink", delay: 0.569, dur: 1.51 },
      { type: "emoji", emoji: "💫", x: 24, y: 83, size: 13, anim: "blink", delay: 1.236, dur: 1.09 }
    ],
  },
  crab_magic_9_234: {
    v: 1,
    loop: 1.93,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 35, y: 54, size: 38, anim: "bounce", dur: 1.37 },
      { type: "emoji", emoji: "🎓", x: 49, y: 15, size: 29, anim: "bounce", delay: 0.457, dur: 1.57 },
      { type: "emoji", emoji: "💝", x: 71, y: 42, size: 25, anim: "pop", delay: 0.438, dur: 1.84 },
      { type: "emoji", emoji: "🍃", x: 52, y: 84, size: 24, anim: "rise", delay: 0.448, dur: 1.54 },
      { type: "emoji", emoji: "🌊", x: 63, y: 41, size: 25, anim: "wiggle", delay: 0.691, dur: 1.93 },
      { type: "emoji", emoji: "🌿", x: 53, y: 79, size: 22, anim: "pop", delay: 0.645, dur: 1.31 },
      { type: "emoji", emoji: "🌟", x: 30, y: 50, size: 17, anim: "blink", delay: 1.85, dur: 1.91 },
      { type: "emoji", emoji: "✨", x: 16, y: 71, size: 18, anim: "blink", delay: 1.127, dur: 1.62 }
    ],
  },
  crab_retro_9_235: {
    v: 1,
    loop: 3.15,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#e64a19", opacity: 0.39, anim: "twinkle", dur: 2.49, w: 101.53, h: 19.53 },
      { type: "emoji", emoji: "🦀", x: 41, y: 48, size: 34, anim: "twinkle", dur: 2.43 },
      { type: "emoji", emoji: "👷", x: 52, y: 16, size: 30, anim: "bounce", delay: 0.339, dur: 1.93 },
      { type: "emoji", emoji: "💎", x: 67, y: 37, size: 25, anim: "float", delay: 0.799, dur: 1.95 },
      { type: "emoji", emoji: "🌊", x: 55, y: 57, size: 20, anim: "float", delay: 0.136, dur: 1.63 },
      { type: "emoji", emoji: "❄️", x: 65, y: 58, size: 19, anim: "wiggle", delay: 0.261, dur: 1.46 },
      { type: "emoji", emoji: "💖", x: 24, y: 88, size: 23, anim: "rise", delay: 0.238, dur: 2.24 },
      { type: "emoji", emoji: "🎊", x: 58, y: 12, size: 14, anim: "rise", delay: 0.083, dur: 1.53 },
      { type: "emoji", emoji: "✨", x: 77, y: 85, size: 23, anim: "rise", delay: 0.049, dur: 1.39 },
      { type: "emoji", emoji: "✨", x: 73, y: 59, size: 13, anim: "blink", delay: 0.728, dur: 1.41 },
      { type: "emoji", emoji: "💖", x: 65, y: 82, size: 16, anim: "blink", delay: 1.342, dur: 1.71 }
    ],
  },
  crab_cyber_9_236: {
    v: 1,
    loop: 3.29,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e91e63", opacity: 0.68, anim: "float", dur: 3.08, r: 43.77 },
      { type: "emoji", emoji: "🦀", x: 33, y: 55, size: 39, anim: "float", dur: 2.91 },
      { type: "emoji", emoji: "👑", x: 50, y: 16, size: 30, anim: "bounce", delay: 0.327, dur: 1.85 },
      { type: "emoji", emoji: "🎁", x: 73, y: 42, size: 26, anim: "float", delay: 0.534, dur: 1.58 },
      { type: "emoji", emoji: "🍃", x: 58, y: 60, size: 25, anim: "float", delay: 0.063, dur: 2.31 },
      { type: "emoji", emoji: "⭐", x: 55, y: 28, size: 18, anim: "blink", delay: 0.637, dur: 1.83 },
      { type: "emoji", emoji: "⭐", x: 26, y: 21, size: 19, anim: "blink", delay: 1.549, dur: 1.42 }
    ],
  },
  crab_nature_9_237: {
    v: 1,
    loop: 1.97,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 46, y: 54, size: 36, anim: "pop", dur: 1.68 },
      { type: "emoji", emoji: "👒", x: 51, y: 14, size: 33, anim: "bounce", delay: 0.518, dur: 1.57 },
      { type: "emoji", emoji: "🍪", x: 69, y: 41, size: 25, anim: "pop", delay: 0.877, dur: 1.51 },
      { type: "emoji", emoji: "❤️", x: 87, y: 40, size: 15, anim: "float", delay: 0.185, dur: 1.54 },
      { type: "emoji", emoji: "❄️", x: 26, y: 69, size: 14, anim: "blink", delay: 0.91, dur: 1.87 },
      { type: "emoji", emoji: "🎉", x: 63, y: 66, size: 22, anim: "pop", delay: 0.758, dur: 2.24 },
      { type: "emoji", emoji: "⭐", x: 66, y: 76, size: 16, anim: "blink", delay: 0.883, dur: 1.55 },
      { type: "emoji", emoji: "⭐", x: 51, y: 84, size: 12, anim: "blink", delay: 0.578, dur: 1.86 }
    ],
  },
  crab_underwater_9_238: {
    v: 1,
    loop: 3.11,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fffde7", opacity: 0.69, anim: "heartbeat", dur: 2.34, w: 95, h: 18.76 },
      { type: "emoji", emoji: "🦀", x: 62, y: 52, size: 37, anim: "heartbeat", dur: 2.52 },
      { type: "emoji", emoji: "🪖", x: 49, y: 18, size: 29, anim: "bounce", delay: 0.476, dur: 1.85 },
      { type: "emoji", emoji: "🎈", x: 70, y: 25, size: 27, anim: "blink", delay: 0.47, dur: 1.98 },
      { type: "emoji", emoji: "✨", x: 34, y: 48, size: 23, anim: "wiggle", delay: 0.174, dur: 1.6 },
      { type: "emoji", emoji: "💖", x: 83, y: 11, size: 13, anim: "rise", delay: 0.633, dur: 2.09 },
      { type: "emoji", emoji: "💖", x: 76, y: 38, size: 19, anim: "blink", delay: 1.815, dur: 1.71 },
      { type: "emoji", emoji: "💖", x: 45, y: 56, size: 11, anim: "blink", delay: 0.673, dur: 1.85 }
    ],
  },
  crab_sky_9_239: {
    v: 1,
    loop: 3.94,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 45, y: 55, size: 43, anim: "float", dur: 3.6 },
      { type: "emoji", emoji: "🧢", x: 49, y: 17, size: 29, anim: "bounce", delay: 0.626, dur: 1.99 },
      { type: "emoji", emoji: "🍦", x: 69, y: 41, size: 27, anim: "pop", delay: 0.494, dur: 2 },
      { type: "emoji", emoji: "🍃", x: 74, y: 84, size: 19, anim: "rise", delay: 0.302, dur: 1.52 },
      { type: "emoji", emoji: "💖", x: 79, y: 83, size: 17, anim: "float", delay: 0.845, dur: 1.62 },
      { type: "emoji", emoji: "✨", x: 50, y: 69, size: 18, anim: "pop", delay: 0.537, dur: 1.57 },
      { type: "emoji", emoji: "💫", x: 23, y: 58, size: 12, anim: "blink", delay: 0.559, dur: 1.81 },
      { type: "emoji", emoji: "💫", x: 48, y: 17, size: 19, anim: "blink", delay: 0.823, dur: 1.79 }
    ],
  },
  crab_party_10_240: {
    v: 1,
    loop: 3.24,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 52, y: 45, size: 36, anim: "float", dur: 2.91 },
      { type: "emoji", emoji: "👑", x: 50, y: 13, size: 31, anim: "bounce", delay: 0.567, dur: 1.95 },
      { type: "emoji", emoji: "🍄", x: 71, y: 44, size: 27, anim: "rise", delay: 0.829, dur: 1.48 },
      { type: "emoji", emoji: "⭐", x: 79, y: 25, size: 18, anim: "rise", delay: 0.301, dur: 1.7 },
      { type: "emoji", emoji: "💖", x: 49, y: 31, size: 24, anim: "float", delay: 1.296, dur: 2.31 },
      { type: "emoji", emoji: "❄️", x: 65, y: 72, size: 22, anim: "pop", delay: 0.067, dur: 1.42 },
      { type: "emoji", emoji: "🎊", x: 10, y: 61, size: 23, anim: "float", delay: 0.87, dur: 2.17 },
      { type: "emoji", emoji: "💖", x: 15, y: 80, size: 18, anim: "blink", delay: 1.911, dur: 1.28 },
      { type: "emoji", emoji: "⭐", x: 72, y: 56, size: 17, anim: "blink", delay: 1.204, dur: 1.17 }
    ],
  },
  crab_beach_10_241: {
    v: 1,
    loop: 2.54,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#039be5", opacity: 0.54, anim: "wave", dur: 1.75, r: 40.35 },
      { type: "emoji", emoji: "🦀", x: 49, y: 50, size: 34, anim: "wave", dur: 1.81 },
      { type: "emoji", emoji: "🤠", x: 50, y: 14, size: 33, anim: "bounce", delay: 0.566, dur: 1.51 },
      { type: "emoji", emoji: "🍩", x: 71, y: 44, size: 24, anim: "pop", delay: 0.874, dur: 1.96 },
      { type: "emoji", emoji: "🌿", x: 51, y: 72, size: 12, anim: "float", delay: 0.45, dur: 1.39 },
      { type: "emoji", emoji: "❄️", x: 54, y: 68, size: 25, anim: "float", delay: 1.341, dur: 1.45 },
      { type: "emoji", emoji: "⭐", x: 17, y: 89, size: 21, anim: "float", delay: 0.243, dur: 1.57 },
      { type: "emoji", emoji: "✨", x: 22, y: 48, size: 18, anim: "blink", delay: 0.531, dur: 1.82 },
      { type: "emoji", emoji: "🌟", x: 84, y: 53, size: 17, anim: "blink", delay: 1.57, dur: 1.59 }
    ],
  },
  crab_winter_10_242: {
    v: 1,
    loop: 1.95,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 67, y: 50, size: 32, anim: "bounce", dur: 1.55 },
      { type: "emoji", emoji: "👮", x: 51, y: 15, size: 29, anim: "bounce", delay: 0.544, dur: 1.71 },
      { type: "emoji", emoji: "🍫", x: 71, y: 43, size: 27, anim: "float", delay: 0.836, dur: 1.58 },
      { type: "emoji", emoji: "🌊", x: 61, y: 78, size: 12, anim: "wiggle", delay: 0.71, dur: 1.75 },
      { type: "emoji", emoji: "💖", x: 42, y: 39, size: 21, anim: "wiggle", delay: 0.287, dur: 1.49 },
      { type: "emoji", emoji: "🎊", x: 72, y: 28, size: 15, anim: "float", delay: 0.172, dur: 2.02 },
      { type: "emoji", emoji: "🌊", x: 30, y: 39, size: 13, anim: "blink", delay: 0.4, dur: 1.52 },
      { type: "emoji", emoji: "✨", x: 66, y: 19, size: 12, anim: "blink", delay: 1.144, dur: 1.23 },
      { type: "emoji", emoji: "✨", x: 43, y: 65, size: 19, anim: "blink", delay: 1.147, dur: 1.11 }
    ],
  },
  crab_spring_10_243: {
    v: 1,
    loop: 1.97,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#43a047", opacity: 0.39, anim: "wiggle", dur: 1.51, r: 41.45 },
      { type: "emoji", emoji: "🦀", x: 65, y: 49, size: 36, anim: "wiggle", dur: 1.36 },
      { type: "emoji", emoji: "🧢", x: 52, y: 17, size: 29, anim: "bounce", delay: 0.532, dur: 1.61 },
      { type: "emoji", emoji: "🎁", x: 69, y: 38, size: 27, anim: "float", delay: 0.92, dur: 1.83 },
      { type: "emoji", emoji: "🍂", x: 63, y: 32, size: 19, anim: "pop", delay: 0.959, dur: 1.5 },
      { type: "emoji", emoji: "🌟", x: 86, y: 59, size: 18, anim: "float", delay: 1.234, dur: 2.18 },
      { type: "emoji", emoji: "💖", x: 70, y: 22, size: 21, anim: "wiggle", delay: 0.183, dur: 1.76 },
      { type: "emoji", emoji: "❄️", x: 52, y: 26, size: 24, anim: "rise", delay: 1.094, dur: 2.36 },
      { type: "emoji", emoji: "🌟", x: 47, y: 37, size: 19, anim: "blink", delay: 1.86, dur: 1.02 },
      { type: "emoji", emoji: "⭐", x: 47, y: 25, size: 10, anim: "blink", delay: 0.558, dur: 1.45 }
    ],
  },
  crab_halloween_10_244: {
    v: 1,
    loop: 4.02,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#7e57c2", opacity: 0.31, anim: "breathe", dur: 3.63, r: 43.27 },
      { type: "emoji", emoji: "🦀", x: 52, y: 46, size: 44, anim: "breathe", dur: 3.41 },
      { type: "emoji", emoji: "❤️", x: 72, y: 52, size: 23, anim: "blink", delay: 0.184, dur: 2.11 },
      { type: "emoji", emoji: "🔥", x: 34, y: 46, size: 23, anim: "blink", delay: 0.607, dur: 2.19 },
      { type: "emoji", emoji: "🍃", x: 74, y: 89, size: 21, anim: "wiggle", delay: 1.023, dur: 2.09 },
      { type: "emoji", emoji: "🔥", x: 32, y: 28, size: 24, anim: "blink", delay: 1.351, dur: 1.45 },
      { type: "emoji", emoji: "🌟", x: 59, y: 62, size: 18, anim: "float", delay: 0.469, dur: 2.26 },
      { type: "emoji", emoji: "✨", x: 61, y: 37, size: 18, anim: "blink", delay: 1.806, dur: 1.49 },
      { type: "emoji", emoji: "🌟", x: 60, y: 26, size: 18, anim: "blink", delay: 1.562, dur: 1.37 }
    ],
  },
  crab_christmas_10_245: {
    v: 1,
    loop: 2.88,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 53, y: 45, size: 33, anim: "pulse", dur: 2.07 },
      { type: "emoji", emoji: "🎩", x: 50, y: 12, size: 31, anim: "bounce", delay: 0.42, dur: 1.54 },
      { type: "emoji", emoji: "❄️", x: 26, y: 55, size: 17, anim: "float", delay: 0.899, dur: 2.12 },
      { type: "emoji", emoji: "🎉", x: 67, y: 60, size: 25, anim: "rise", delay: 1.452, dur: 1.88 },
      { type: "emoji", emoji: "🌟", x: 41, y: 15, size: 16, anim: "blink", delay: 0.839, dur: 1.7 },
      { type: "emoji", emoji: "🌟", x: 42, y: 77, size: 10, anim: "blink", delay: 1.113, dur: 1.18 }
    ],
  },
  crab_coding_10_246: {
    v: 1,
    loop: 2.59,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 41, y: 50, size: 43, anim: "pulse", dur: 2.26 },
      { type: "emoji", emoji: "🧙", x: 50, y: 13, size: 33, anim: "bounce", delay: 0.522, dur: 1.85 },
      { type: "emoji", emoji: "🎉", x: 70, y: 66, size: 25, anim: "pop", delay: 0.938, dur: 1.3 },
      { type: "emoji", emoji: "⭐", x: 18, y: 22, size: 20, anim: "blink", delay: 0.896, dur: 2.12 },
      { type: "emoji", emoji: "⭐", x: 42, y: 28, size: 10, anim: "blink", delay: 1.936, dur: 1.81 },
      { type: "emoji", emoji: "💖", x: 75, y: 30, size: 10, anim: "blink", delay: 0.681, dur: 1.82 }
    ],
  },
  crab_music_10_247: {
    v: 1,
    loop: 3.22,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ba68c8", opacity: 0.6, anim: "float", dur: 2.76, r: 46.94 },
      { type: "emoji", emoji: "🦀", x: 53, y: 49, size: 34, anim: "float", dur: 2.77 },
      { type: "emoji", emoji: "🍪", x: 74, y: 41, size: 24, anim: "float", delay: 0.996, dur: 1.91 },
      { type: "emoji", emoji: "🎊", x: 67, y: 55, size: 20, anim: "rise", delay: 1.02, dur: 1.41 },
      { type: "emoji", emoji: "❤️", x: 27, y: 41, size: 17, anim: "wiggle", delay: 1.492, dur: 1.52 },
      { type: "emoji", emoji: "⭐", x: 61, y: 74, size: 19, anim: "blink", delay: 1.774, dur: 1.49 },
      { type: "emoji", emoji: "✨", x: 76, y: 72, size: 12, anim: "blink", delay: 1.317, dur: 1.69 }
    ],
  },
  crab_sports_10_248: {
    v: 1,
    loop: 3.39,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fffde7", opacity: 0.33, anim: "settle", dur: 2.77, r: 49.64 },
      { type: "emoji", emoji: "🦀", x: 66, y: 56, size: 38, anim: "settle", dur: 2.88 },
      { type: "emoji", emoji: "🎁", x: 74, y: 39, size: 27, anim: "float", delay: 0.585, dur: 1.88 },
      { type: "emoji", emoji: "⭐", x: 58, y: 14, size: 17, anim: "blink", delay: 1.011, dur: 1.47 },
      { type: "emoji", emoji: "🍂", x: 70, y: 60, size: 18, anim: "rise", delay: 1.074, dur: 1.85 },
      { type: "emoji", emoji: "🌟", x: 84, y: 56, size: 19, anim: "blink", delay: 0.767, dur: 1.43 },
      { type: "emoji", emoji: "💫", x: 54, y: 69, size: 12, anim: "blink", delay: 1.082, dur: 1.87 }
    ],
  },
  crab_food_10_249: {
    v: 1,
    loop: 2.13,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#3949ab", opacity: 0.46, anim: "bounce", dur: 1.47, w: 91.73, h: 19.52 },
      { type: "emoji", emoji: "🦀", x: 57, y: 46, size: 40, anim: "bounce", dur: 1.24 },
      { type: "emoji", emoji: "🌿", x: 49, y: 11, size: 12, anim: "wiggle", delay: 0.674, dur: 2.29 },
      { type: "emoji", emoji: "💫", x: 59, y: 70, size: 11, anim: "blink", delay: 0.62, dur: 1.51 },
      { type: "emoji", emoji: "💖", x: 80, y: 42, size: 16, anim: "blink", delay: 1.564, dur: 1.39 }
    ],
  },
  crab_space_10_250: {
    v: 1,
    loop: 2.83,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffe6e6", opacity: 0.65, anim: "twinkle", dur: 2.5, w: 95.87, h: 22.14 },
      { type: "emoji", emoji: "🦀", x: 54, y: 55, size: 43, anim: "twinkle", dur: 2.5 },
      { type: "emoji", emoji: "🌿", x: 21, y: 65, size: 24, anim: "pop", delay: 1.447, dur: 1.74 },
      { type: "emoji", emoji: "🔥", x: 21, y: 35, size: 24, anim: "wiggle", delay: 0.753, dur: 1.49 },
      { type: "emoji", emoji: "🍃", x: 16, y: 50, size: 21, anim: "wiggle", delay: 0.295, dur: 1.23 },
      { type: "emoji", emoji: "💖", x: 29, y: 22, size: 14, anim: "blink", delay: 0.14, dur: 1.92 },
      { type: "emoji", emoji: "⭐", x: 57, y: 28, size: 12, anim: "blink", delay: 1.544, dur: 1.32 },
      { type: "emoji", emoji: "✨", x: 23, y: 57, size: 15, anim: "blink", delay: 1.056, dur: 1.25 }
    ],
  },
  crab_fantasy_10_251: {
    v: 1,
    loop: 3.04,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#b3e5fc", opacity: 0.46, anim: "float", dur: 2.99, r: 41.53 },
      { type: "emoji", emoji: "🦀", x: 45, y: 55, size: 41, anim: "float", dur: 2.95 },
      { type: "emoji", emoji: "🎊", x: 74, y: 71, size: 20, anim: "float", delay: 0.156, dur: 2.19 },
      { type: "emoji", emoji: "🎊", x: 87, y: 18, size: 20, anim: "wiggle", delay: 1.48, dur: 1.52 },
      { type: "emoji", emoji: "💖", x: 80, y: 17, size: 16, anim: "blink", delay: 1.019, dur: 1.93 },
      { type: "emoji", emoji: "🌟", x: 15, y: 64, size: 11, anim: "blink", delay: 1.165, dur: 1.53 }
    ],
  },
  crab_office_10_252: {
    v: 1,
    loop: 2.38,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fff3e0", opacity: 0.48, anim: "pop", dur: 1.65, r: 42.16 },
      { type: "emoji", emoji: "🦀", x: 45, y: 48, size: 35, anim: "pop", dur: 1.69 },
      { type: "emoji", emoji: "🕶️", x: 51, y: 29, size: 30, anim: "bounce", delay: 0.323, dur: 1.98 },
      { type: "emoji", emoji: "🍫", x: 67, y: 43, size: 24, anim: "rise", delay: 0.865, dur: 1.84 },
      { type: "emoji", emoji: "✨", x: 64, y: 48, size: 25, anim: "wiggle", delay: 0.954, dur: 1.58 },
      { type: "emoji", emoji: "💫", x: 33, y: 59, size: 15, anim: "float", delay: 0.564, dur: 1.87 },
      { type: "emoji", emoji: "❤️", x: 69, y: 86, size: 21, anim: "rise", delay: 0.175, dur: 2.34 },
      { type: "emoji", emoji: "💖", x: 37, y: 47, size: 13, anim: "blink", delay: 1.157, dur: 1.23 },
      { type: "emoji", emoji: "⭐", x: 36, y: 70, size: 10, anim: "blink", delay: 1.883, dur: 1.23 }
    ],
  },
  crab_fitness_10_253: {
    v: 1,
    loop: 2.92,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 44, y: 53, size: 37, anim: "heartbeat", dur: 2.39 },
      { type: "emoji", emoji: "🍬", x: 73, y: 43, size: 21, anim: "pop", delay: 0.416, dur: 1.66 },
      { type: "emoji", emoji: "🌿", x: 84, y: 62, size: 15, anim: "float", delay: 1.167, dur: 2.28 },
      { type: "emoji", emoji: "🌿", x: 31, y: 78, size: 12, anim: "wiggle", delay: 0.278, dur: 1.53 },
      { type: "emoji", emoji: "💖", x: 82, y: 54, size: 14, anim: "blink", delay: 1.426, dur: 1.42 },
      { type: "emoji", emoji: "🌟", x: 21, y: 47, size: 12, anim: "blink", delay: 1.674, dur: 1.91 }
    ],
  },
  crab_travel_10_254: {
    v: 1,
    loop: 3.79,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ede7f6", opacity: 0.49, anim: "float", dur: 3.29, w: 105.87, h: 26.34 },
      { type: "emoji", emoji: "🦀", x: 57, y: 46, size: 33, anim: "float", dur: 3.6 },
      { type: "emoji", emoji: "🍬", x: 74, y: 47, size: 20, anim: "pop", delay: 0.806, dur: 1.83 },
      { type: "emoji", emoji: "🎊", x: 84, y: 54, size: 18, anim: "rise", delay: 1.322, dur: 1.58 },
      { type: "emoji", emoji: "🎊", x: 73, y: 22, size: 24, anim: "float", delay: 0.53, dur: 1.55 },
      { type: "emoji", emoji: "🌟", x: 82, y: 22, size: 13, anim: "blink", delay: 1.245, dur: 1.64 },
      { type: "emoji", emoji: "🌿", x: 34, y: 80, size: 15, anim: "pop", delay: 0.328, dur: 1.35 },
      { type: "emoji", emoji: "💫", x: 21, y: 72, size: 12, anim: "blink", delay: 1.145, dur: 1.92 },
      { type: "emoji", emoji: "⭐", x: 20, y: 83, size: 16, anim: "blink", delay: 1.435, dur: 1.09 }
    ],
  },
  crab_art_10_255: {
    v: 1,
    loop: 3.21,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffccbc", opacity: 0.31, anim: "float", dur: 3.21, r: 44.88 },
      { type: "emoji", emoji: "🦀", x: 54, y: 52, size: 39, anim: "float", dur: 2.9 },
      { type: "emoji", emoji: "🤠", x: 48, y: 14, size: 33, anim: "bounce", delay: 0.362, dur: 1.93 },
      { type: "emoji", emoji: "🎈", x: 71, y: 27, size: 28, anim: "float", delay: 0.575, dur: 1.69 },
      { type: "emoji", emoji: "🍃", x: 18, y: 62, size: 18, anim: "pop", delay: 0.792, dur: 1.66 },
      { type: "emoji", emoji: "✨", x: 26, y: 53, size: 19, anim: "blink", delay: 1.389, dur: 1.2 },
      { type: "emoji", emoji: "💫", x: 64, y: 51, size: 11, anim: "blink", delay: 1.236, dur: 1.49 }
    ],
  },
  crab_science_10_256: {
    v: 1,
    loop: 2.51,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 33, y: 52, size: 33, anim: "wave", dur: 1.8 },
      { type: "emoji", emoji: "🕶️", x: 51, y: 28, size: 28, anim: "bounce", delay: 0.363, dur: 1.71 },
      { type: "emoji", emoji: "🍪", x: 74, y: 44, size: 24, anim: "pop", delay: 0.597, dur: 1.99 },
      { type: "emoji", emoji: "❤️", x: 83, y: 24, size: 20, anim: "pop", delay: 0.885, dur: 1.51 },
      { type: "emoji", emoji: "🍃", x: 10, y: 12, size: 16, anim: "pop", delay: 1.112, dur: 1.45 },
      { type: "emoji", emoji: "🌸", x: 46, y: 57, size: 17, anim: "rise", delay: 0.546, dur: 1.89 },
      { type: "emoji", emoji: "💖", x: 80, y: 62, size: 17, anim: "blink", delay: 1.955, dur: 1.76 },
      { type: "emoji", emoji: "⭐", x: 76, y: 61, size: 10, anim: "blink", delay: 0.919, dur: 1.05 }
    ],
  },
  crab_pets_10_257: {
    v: 1,
    loop: 1.78,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 33, y: 47, size: 38, anim: "bounce", dur: 1.54 },
      { type: "emoji", emoji: "🌸", x: 72, y: 42, size: 26, anim: "rise", delay: 0.688, dur: 1.76 },
      { type: "emoji", emoji: "🍃", x: 79, y: 29, size: 20, anim: "blink", delay: 0.207, dur: 1.75 },
      { type: "emoji", emoji: "💖", x: 55, y: 51, size: 12, anim: "blink", delay: 1.061, dur: 1.62 },
      { type: "emoji", emoji: "✨", x: 79, y: 48, size: 11, anim: "blink", delay: 1.536, dur: 1.98 }
    ],
  },
  crab_magic_10_258: {
    v: 1,
    loop: 2.2,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fdd835", opacity: 0.64, anim: "wiggle", dur: 1.54, r: 40.64 },
      { type: "emoji", emoji: "🦀", x: 57, y: 46, size: 40, anim: "wiggle", dur: 1.51 },
      { type: "emoji", emoji: "🎭", x: 50, y: 29, size: 27, anim: "bounce", delay: 0.322, dur: 1.73 },
      { type: "emoji", emoji: "⭐", x: 68, y: 29, size: 22, anim: "blink", delay: 0.41, dur: 1.99 },
      { type: "emoji", emoji: "❤️", x: 33, y: 54, size: 23, anim: "rise", delay: 1.317, dur: 1.5 },
      { type: "emoji", emoji: "✨", x: 72, y: 68, size: 20, anim: "wiggle", delay: 0.773, dur: 2.23 },
      { type: "emoji", emoji: "🌊", x: 76, y: 63, size: 24, anim: "blink", delay: 0.387, dur: 1.51 },
      { type: "emoji", emoji: "🌟", x: 58, y: 27, size: 12, anim: "blink", delay: 1.024, dur: 1.57 },
      { type: "emoji", emoji: "⭐", x: 61, y: 37, size: 12, anim: "blink", delay: 1.952, dur: 1.89 }
    ],
  },
  crab_retro_10_259: {
    v: 1,
    loop: 4.09,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#9fa8da", opacity: 0.42, anim: "breathe", dur: 3.26, w: 98.58, h: 26.13 },
      { type: "emoji", emoji: "🦀", x: 45, y: 56, size: 37, anim: "breathe", dur: 3.45 },
      { type: "emoji", emoji: "🌹", x: 71, y: 39, size: 27, anim: "pop", delay: 0.562, dur: 1.52 },
      { type: "emoji", emoji: "🎊", x: 73, y: 51, size: 25, anim: "rise", delay: 1.497, dur: 1.24 },
      { type: "emoji", emoji: "🌿", x: 29, y: 75, size: 13, anim: "pop", delay: 0.31, dur: 1.33 },
      { type: "emoji", emoji: "🌟", x: 13, y: 23, size: 19, anim: "pop", delay: 0.631, dur: 1.45 },
      { type: "emoji", emoji: "🌟", x: 70, y: 57, size: 18, anim: "blink", delay: 1.02, dur: 1.88 },
      { type: "emoji", emoji: "💫", x: 83, y: 50, size: 12, anim: "blink", delay: 0.84, dur: 1.53 }
    ],
  },
  crab_cyber_10_260: {
    v: 1,
    loop: 2.62,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fff3e0", opacity: 0.63, anim: "pulse", dur: 2.15, r: 47.46 },
      { type: "emoji", emoji: "🦀", x: 65, y: 56, size: 38, anim: "pulse", dur: 1.95 },
      { type: "emoji", emoji: "🎀", x: 68, y: 31, size: 19, anim: "pop", delay: 0.741, dur: 1.71 },
      { type: "emoji", emoji: "🌟", x: 67, y: 61, size: 19, anim: "pop", delay: 0.339, dur: 2.2 },
      { type: "emoji", emoji: "❤️", x: 64, y: 46, size: 19, anim: "wiggle", delay: 0.28, dur: 2.12 },
      { type: "emoji", emoji: "⭐", x: 52, y: 83, size: 12, anim: "blink", delay: 0.962, dur: 1.29 },
      { type: "emoji", emoji: "🌟", x: 49, y: 29, size: 16, anim: "blink", delay: 0.926, dur: 1.07 }
    ],
  },
  crab_nature_10_261: {
    v: 1,
    loop: 2.5,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#039be5", opacity: 0.38, anim: "pulse", dur: 2.27, r: 43.19 },
      { type: "emoji", emoji: "🦀", x: 69, y: 51, size: 42, anim: "pulse", dur: 2.32 },
      { type: "emoji", emoji: "🎈", x: 37, y: 88, size: 17, anim: "pop", delay: 0.861, dur: 1.68 },
      { type: "emoji", emoji: "⭐", x: 58, y: 68, size: 13, anim: "blink", delay: 0.937, dur: 1.63 },
      { type: "emoji", emoji: "⭐", x: 69, y: 43, size: 14, anim: "blink", delay: 1.242, dur: 1.65 }
    ],
  },
  crab_underwater_10_262: {
    v: 1,
    loop: 2.76,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffcc80", opacity: 0.42, anim: "float", dur: 2.85, r: 42.08 },
      { type: "emoji", emoji: "🦀", x: 66, y: 51, size: 33, anim: "float", dur: 2.78 },
      { type: "emoji", emoji: "🍳", x: 51, y: 17, size: 29, anim: "bounce", delay: 0.315, dur: 1.93 },
      { type: "emoji", emoji: "🍰", x: 69, y: 41, size: 29, anim: "float", delay: 0.699, dur: 1.65 },
      { type: "emoji", emoji: "❤️", x: 30, y: 20, size: 18, anim: "wiggle", delay: 0.295, dur: 2.34 },
      { type: "emoji", emoji: "🌸", x: 12, y: 52, size: 13, anim: "blink", delay: 0.283, dur: 1.53 },
      { type: "emoji", emoji: "🔥", x: 66, y: 59, size: 25, anim: "pop", delay: 1.425, dur: 1.75 },
      { type: "emoji", emoji: "✨", x: 21, y: 21, size: 13, anim: "blink", delay: 1.835, dur: 1.88 },
      { type: "emoji", emoji: "⭐", x: 32, y: 29, size: 11, anim: "blink", delay: 0.74, dur: 1.67 }
    ],
  },
  crab_sky_10_263: {
    v: 1,
    loop: 3.62,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#388e3c", opacity: 0.33, anim: "settle", dur: 2.78, r: 48.51 },
      { type: "emoji", emoji: "🦀", x: 48, y: 47, size: 36, anim: "settle", dur: 3.09 },
      { type: "emoji", emoji: "🧙", x: 52, y: 11, size: 34, anim: "bounce", delay: 0.486, dur: 1.91 },
      { type: "emoji", emoji: "🍫", x: 67, y: 43, size: 24, anim: "pop", delay: 0.737, dur: 1.56 },
      { type: "emoji", emoji: "🍃", x: 50, y: 71, size: 22, anim: "float", delay: 1.221, dur: 1.24 },
      { type: "emoji", emoji: "❤️", x: 76, y: 64, size: 24, anim: "float", delay: 1.248, dur: 1.75 },
      { type: "emoji", emoji: "🍂", x: 17, y: 73, size: 20, anim: "float", delay: 0.638, dur: 2.22 },
      { type: "emoji", emoji: "🎉", x: 30, y: 34, size: 17, anim: "float", delay: 1.23, dur: 1.37 },
      { type: "emoji", emoji: "💫", x: 84, y: 42, size: 18, anim: "blink", delay: 1.598, dur: 1.81 },
      { type: "emoji", emoji: "🌟", x: 59, y: 58, size: 18, anim: "blink", delay: 1.173, dur: 1.42 }
    ],
  },
  crab_party_11_264: {
    v: 1,
    loop: 1.92,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 40, y: 54, size: 43, anim: "bounce", dur: 1.29 },
      { type: "emoji", emoji: "❤️", x: 26, y: 15, size: 24, anim: "wiggle", delay: 0.017, dur: 1.41 },
      { type: "emoji", emoji: "🍃", x: 33, y: 55, size: 20, anim: "blink", delay: 1.409, dur: 1.99 },
      { type: "emoji", emoji: "❄️", x: 48, y: 76, size: 18, anim: "pop", delay: 0.922, dur: 1.51 },
      { type: "emoji", emoji: "🌟", x: 20, y: 48, size: 12, anim: "blink", delay: 1.451, dur: 1.6 },
      { type: "emoji", emoji: "🌟", x: 57, y: 62, size: 10, anim: "blink", delay: 1.973, dur: 1.37 }
    ],
  },
  crab_beach_11_265: {
    v: 1,
    loop: 2.8,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ff5722", opacity: 0.63, anim: "twinkle", dur: 2.73, r: 48.1 },
      { type: "emoji", emoji: "🦀", x: 31, y: 52, size: 36, anim: "twinkle", dur: 2.37 },
      { type: "emoji", emoji: "🌹", x: 72, y: 41, size: 28, anim: "pop", delay: 0.944, dur: 1.82 },
      { type: "emoji", emoji: "💖", x: 18, y: 16, size: 19, anim: "wiggle", delay: 0.615, dur: 1.77 },
      { type: "emoji", emoji: "🌊", x: 74, y: 65, size: 19, anim: "rise", delay: 0.054, dur: 1.46 },
      { type: "emoji", emoji: "🌸", x: 83, y: 71, size: 12, anim: "wiggle", delay: 0.417, dur: 1.25 },
      { type: "emoji", emoji: "💫", x: 80, y: 68, size: 12, anim: "blink", delay: 0.713, dur: 1.84 },
      { type: "emoji", emoji: "✨", x: 35, y: 27, size: 14, anim: "blink", delay: 0.802, dur: 1.34 }
    ],
  },
  crab_winter_11_266: {
    v: 1,
    loop: 3.11,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#f48fb1", opacity: 0.65, anim: "float", dur: 2.83, r: 45.54 },
      { type: "emoji", emoji: "🦀", x: 62, y: 54, size: 35, anim: "float", dur: 3.02 },
      { type: "emoji", emoji: "🧣", x: 51, y: 56, size: 27, anim: "bounce", delay: 0.542, dur: 1.8 },
      { type: "emoji", emoji: "🌊", x: 13, y: 22, size: 17, anim: "blink", delay: 1.048, dur: 1.41 },
      { type: "emoji", emoji: "🔥", x: 44, y: 81, size: 20, anim: "rise", delay: 0.268, dur: 1.59 },
      { type: "emoji", emoji: "❤️", x: 16, y: 26, size: 16, anim: "pop", delay: 0.445, dur: 1.61 },
      { type: "emoji", emoji: "💫", x: 46, y: 44, size: 11, anim: "blink", delay: 0.822, dur: 1.36 },
      { type: "emoji", emoji: "✨", x: 26, y: 37, size: 14, anim: "blink", delay: 0.701, dur: 1.09 }
    ],
  },
  crab_spring_11_267: {
    v: 1,
    loop: 2.28,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ce93d8", opacity: 0.68, anim: "pop", dur: 1.75, w: 108.58, h: 18.28 },
      { type: "emoji", emoji: "🦀", x: 36, y: 54, size: 36, anim: "pop", dur: 1.6 },
      { type: "emoji", emoji: "🤠", x: 50, y: 12, size: 31, anim: "bounce", delay: 0.313, dur: 1.92 },
      { type: "emoji", emoji: "🌿", x: 75, y: 48, size: 24, anim: "rise", delay: 1.319, dur: 2.19 },
      { type: "emoji", emoji: "🍂", x: 68, y: 11, size: 20, anim: "pop", delay: 1.431, dur: 1.45 },
      { type: "emoji", emoji: "💖", x: 46, y: 31, size: 19, anim: "blink", delay: 1.165, dur: 1.58 },
      { type: "emoji", emoji: "🌟", x: 27, y: 48, size: 17, anim: "blink", delay: 0.866, dur: 1.04 }
    ],
  },
  crab_halloween_11_268: {
    v: 1,
    loop: 3.06,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fdd835", opacity: 0.43, anim: "heartbeat", dur: 2.5, r: 49.38 },
      { type: "emoji", emoji: "🦀", x: 40, y: 50, size: 36, anim: "heartbeat", dur: 2.61 },
      { type: "emoji", emoji: "🎓", x: 51, y: 15, size: 29, anim: "bounce", delay: 0.465, dur: 1.96 },
      { type: "emoji", emoji: "🍪", x: 74, y: 47, size: 22, anim: "float", delay: 0.874, dur: 1.55 },
      { type: "emoji", emoji: "❤️", x: 88, y: 64, size: 13, anim: "rise", delay: 1.142, dur: 1.85 },
      { type: "emoji", emoji: "🎊", x: 29, y: 50, size: 17, anim: "blink", delay: 0.263, dur: 2.28 },
      { type: "emoji", emoji: "🌊", x: 75, y: 34, size: 17, anim: "wiggle", delay: 0.986, dur: 1.64 },
      { type: "emoji", emoji: "🔥", x: 27, y: 78, size: 14, anim: "pop", delay: 1.457, dur: 1.55 },
      { type: "emoji", emoji: "💖", x: 51, y: 15, size: 12, anim: "blink", delay: 0.735, dur: 1.54 },
      { type: "emoji", emoji: "💫", x: 58, y: 47, size: 19, anim: "blink", delay: 1.436, dur: 1.87 }
    ],
  },
  crab_christmas_11_269: {
    v: 1,
    loop: 4.02,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 56, y: 49, size: 37, anim: "float", dur: 3.39 },
      { type: "emoji", emoji: "🕶️", x: 50, y: 30, size: 28, anim: "bounce", delay: 0.338, dur: 1.54 },
      { type: "emoji", emoji: "🌊", x: 74, y: 12, size: 24, anim: "pop", delay: 1.316, dur: 2.07 },
      { type: "emoji", emoji: "🌊", x: 40, y: 55, size: 16, anim: "pop", delay: 0.823, dur: 2.12 },
      { type: "emoji", emoji: "💫", x: 40, y: 51, size: 13, anim: "blink", delay: 0.61, dur: 1.3 },
      { type: "emoji", emoji: "⭐", x: 15, y: 65, size: 19, anim: "blink", delay: 0.615, dur: 1.56 }
    ],
  },
  crab_coding_11_270: {
    v: 1,
    loop: 2.78,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#e8f5e9", opacity: 0.59, anim: "float", dur: 2.76, w: 98.49, h: 20.42 },
      { type: "emoji", emoji: "🦀", x: 49, y: 46, size: 40, anim: "float", dur: 3.1 },
      { type: "emoji", emoji: "⭐", x: 70, y: 30, size: 25, anim: "rise", delay: 0.964, dur: 1.81 },
      { type: "emoji", emoji: "✨", x: 69, y: 53, size: 18, anim: "float", delay: 0.164, dur: 1.47 },
      { type: "emoji", emoji: "🌿", x: 62, y: 40, size: 20, anim: "blink", delay: 0.372, dur: 1.37 },
      { type: "emoji", emoji: "⭐", x: 17, y: 21, size: 13, anim: "blink", delay: 0.675, dur: 1.05 },
      { type: "emoji", emoji: "💖", x: 57, y: 19, size: 12, anim: "blink", delay: 0.976, dur: 1.17 }
    ],
  },
  crab_music_11_271: {
    v: 1,
    loop: 2.34,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 54, y: 51, size: 36, anim: "wave", dur: 1.65 },
      { type: "emoji", emoji: "🍰", x: 71, y: 42, size: 28, anim: "rise", delay: 0.722, dur: 1.93 },
      { type: "emoji", emoji: "💖", x: 10, y: 12, size: 14, anim: "pop", delay: 1.282, dur: 2.12 },
      { type: "emoji", emoji: "🌟", x: 78, y: 43, size: 24, anim: "wiggle", delay: 0.138, dur: 1.32 },
      { type: "emoji", emoji: "🍃", x: 46, y: 37, size: 25, anim: "float", delay: 0.265, dur: 1.3 },
      { type: "emoji", emoji: "🌟", x: 85, y: 48, size: 14, anim: "pop", delay: 0.31, dur: 1.46 },
      { type: "emoji", emoji: "💫", x: 52, y: 28, size: 16, anim: "blink", delay: 1.373, dur: 1.64 },
      { type: "emoji", emoji: "💖", x: 69, y: 30, size: 18, anim: "blink", delay: 1.704, dur: 1.42 }
    ],
  },
  crab_sports_11_272: {
    v: 1,
    loop: 2.02,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 35, y: 47, size: 42, anim: "bounce", dur: 1.44 },
      { type: "emoji", emoji: "🤠", x: 52, y: 12, size: 33, anim: "bounce", delay: 0.519, dur: 1.79 },
      { type: "emoji", emoji: "🔥", x: 15, y: 13, size: 25, anim: "float", delay: 1.278, dur: 1.31 },
      { type: "emoji", emoji: "💫", x: 42, y: 20, size: 12, anim: "rise", delay: 0.497, dur: 1.98 },
      { type: "emoji", emoji: "🌸", x: 51, y: 49, size: 17, anim: "wiggle", delay: 0.177, dur: 1.24 },
      { type: "emoji", emoji: "🔥", x: 10, y: 11, size: 12, anim: "pop", delay: 0.064, dur: 2.31 },
      { type: "emoji", emoji: "✨", x: 75, y: 36, size: 15, anim: "blink", delay: 0.682, dur: 1.65 },
      { type: "emoji", emoji: "⭐", x: 30, y: 75, size: 10, anim: "blink", delay: 1.225, dur: 1.73 },
      { type: "emoji", emoji: "💫", x: 55, y: 44, size: 17, anim: "blink", delay: 1.656, dur: 1.34 }
    ],
  },
  crab_food_11_273: {
    v: 1,
    loop: 2.4,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 31, y: 49, size: 36, anim: "wiggle", dur: 1.45 },
      { type: "emoji", emoji: "🌟", x: 71, y: 28, size: 27, anim: "pop", delay: 0.822, dur: 1.82 },
      { type: "emoji", emoji: "🌟", x: 21, y: 43, size: 18, anim: "rise", delay: 0.041, dur: 2.38 },
      { type: "emoji", emoji: "💫", x: 62, y: 50, size: 12, anim: "wiggle", delay: 1.431, dur: 2.11 },
      { type: "emoji", emoji: "💖", x: 62, y: 40, size: 13, anim: "blink", delay: 0.672, dur: 1.72 },
      { type: "emoji", emoji: "✨", x: 33, y: 16, size: 16, anim: "blink", delay: 1.366, dur: 1.42 }
    ],
  },
  crab_space_11_274: {
    v: 1,
    loop: 3.84,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#673ab7", opacity: 0.69, anim: "breathe", dur: 3.73, r: 40.85 },
      { type: "emoji", emoji: "🦀", x: 40, y: 56, size: 44, anim: "breathe", dur: 3.49 },
      { type: "emoji", emoji: "⭐", x: 69, y: 30, size: 25, anim: "blink", delay: 0.892, dur: 1.75 },
      { type: "emoji", emoji: "💖", x: 85, y: 55, size: 25, anim: "rise", delay: 0.896, dur: 1.7 },
      { type: "emoji", emoji: "🌸", x: 23, y: 56, size: 25, anim: "rise", delay: 0.517, dur: 2.34 },
      { type: "emoji", emoji: "💖", x: 50, y: 21, size: 15, anim: "blink", delay: 0.615, dur: 1.34 },
      { type: "emoji", emoji: "💖", x: 57, y: 29, size: 12, anim: "blink", delay: 1.961, dur: 1.4 }
    ],
  },
  crab_fantasy_11_275: {
    v: 1,
    loop: 2.82,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ff5722", opacity: 0.48, anim: "pulse", dur: 1.89, w: 108.07, h: 18.12 },
      { type: "emoji", emoji: "🦀", x: 47, y: 44, size: 41, anim: "pulse", dur: 2.02 },
      { type: "emoji", emoji: "🍦", x: 67, y: 40, size: 29, anim: "pop", delay: 0.511, dur: 1.68 },
      { type: "emoji", emoji: "✨", x: 29, y: 59, size: 24, anim: "rise", delay: 0.185, dur: 1.24 },
      { type: "emoji", emoji: "❤️", x: 72, y: 67, size: 12, anim: "wiggle", delay: 0.289, dur: 1.73 },
      { type: "emoji", emoji: "🎉", x: 45, y: 64, size: 20, anim: "pop", delay: 1.116, dur: 2.13 },
      { type: "emoji", emoji: "🌟", x: 77, y: 73, size: 11, anim: "blink", delay: 0.874, dur: 1.1 },
      { type: "emoji", emoji: "💫", x: 30, y: 42, size: 17, anim: "blink", delay: 1.695, dur: 1.77 }
    ],
  },
  crab_office_11_276: {
    v: 1,
    loop: 2.58,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 36, y: 45, size: 32, anim: "pulse", dur: 2.24 },
      { type: "emoji", emoji: "🎩", x: 50, y: 13, size: 32, anim: "bounce", delay: 0.65, dur: 1.84 },
      { type: "emoji", emoji: "🍭", x: 69, y: 40, size: 27, anim: "pop", delay: 0.891, dur: 2 },
      { type: "emoji", emoji: "🌿", x: 48, y: 67, size: 12, anim: "pop", delay: 0.401, dur: 1.33 },
      { type: "emoji", emoji: "💫", x: 75, y: 73, size: 23, anim: "pop", delay: 1.133, dur: 1.93 },
      { type: "emoji", emoji: "🎈", x: 61, y: 28, size: 19, anim: "pop", delay: 0.193, dur: 1.5 },
      { type: "emoji", emoji: "🎈", x: 60, y: 74, size: 17, anim: "pop", delay: 0.626, dur: 2.01 },
      { type: "emoji", emoji: "🍂", x: 18, y: 26, size: 24, anim: "blink", delay: 1.442, dur: 1.93 },
      { type: "emoji", emoji: "✨", x: 36, y: 77, size: 14, anim: "blink", delay: 1.545, dur: 1.23 },
      { type: "emoji", emoji: "💫", x: 25, y: 76, size: 14, anim: "blink", delay: 0.737, dur: 1.88 }
    ],
  },
  crab_fitness_11_277: {
    v: 1,
    loop: 3.05,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 64, y: 49, size: 43, anim: "float", dur: 2.73 },
      { type: "emoji", emoji: "👒", x: 48, y: 12, size: 33, anim: "bounce", delay: 0.359, dur: 1.61 },
      { type: "emoji", emoji: "🍪", x: 74, y: 44, size: 23, anim: "float", delay: 0.698, dur: 1.58 },
      { type: "emoji", emoji: "🎉", x: 40, y: 24, size: 23, anim: "float", delay: 0.607, dur: 1.55 },
      { type: "emoji", emoji: "💫", x: 68, y: 12, size: 15, anim: "float", delay: 0.105, dur: 1.49 },
      { type: "emoji", emoji: "🔥", x: 68, y: 74, size: 17, anim: "float", delay: 0.406, dur: 1.31 },
      { type: "emoji", emoji: "✨", x: 52, y: 44, size: 18, anim: "blink", delay: 1.508, dur: 1.63 },
      { type: "emoji", emoji: "💫", x: 26, y: 74, size: 10, anim: "blink", delay: 1.216, dur: 1.16 }
    ],
  },
  crab_travel_11_278: {
    v: 1,
    loop: 3.64,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fff59d", opacity: 0.43, anim: "settle", dur: 2.92, r: 45.79 },
      { type: "emoji", emoji: "🦀", x: 34, y: 53, size: 33, anim: "settle", dur: 2.85 },
      { type: "emoji", emoji: "🕶️", x: 51, y: 30, size: 28, anim: "bounce", delay: 0.328, dur: 1.88 },
      { type: "emoji", emoji: "🍭", x: 69, y: 37, size: 24, anim: "pop", delay: 0.82, dur: 1.82 },
      { type: "emoji", emoji: "🔥", x: 56, y: 57, size: 19, anim: "blink", delay: 0.25, dur: 2.21 },
      { type: "emoji", emoji: "❄️", x: 16, y: 77, size: 19, anim: "rise", delay: 0.942, dur: 2.31 },
      { type: "emoji", emoji: "❄️", x: 66, y: 19, size: 22, anim: "float", delay: 0.09, dur: 1.61 },
      { type: "emoji", emoji: "🌟", x: 15, y: 39, size: 11, anim: "blink", delay: 1.546, dur: 1.03 },
      { type: "emoji", emoji: "⭐", x: 59, y: 45, size: 17, anim: "blink", delay: 1.191, dur: 1.84 }
    ],
  },
  crab_art_11_279: {
    v: 1,
    loop: 1.95,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e8eaf6", opacity: 0.5, anim: "bounce", dur: 1.3, r: 44.42 },
      { type: "emoji", emoji: "🦀", x: 48, y: 54, size: 42, anim: "bounce", dur: 1.29 },
      { type: "emoji", emoji: "🎁", x: 71, y: 38, size: 26, anim: "rise", delay: 0.603, dur: 1.5 },
      { type: "emoji", emoji: "🔥", x: 84, y: 33, size: 16, anim: "float", delay: 0.305, dur: 1.25 },
      { type: "emoji", emoji: "🌿", x: 37, y: 72, size: 18, anim: "float", delay: 1.425, dur: 1.86 },
      { type: "emoji", emoji: "💖", x: 81, y: 30, size: 12, anim: "wiggle", delay: 1.014, dur: 2.28 },
      { type: "emoji", emoji: "⭐", x: 13, y: 38, size: 13, anim: "pop", delay: 1.461, dur: 2.12 },
      { type: "emoji", emoji: "✨", x: 42, y: 21, size: 10, anim: "blink", delay: 1.608, dur: 1.42 },
      { type: "emoji", emoji: "💖", x: 73, y: 36, size: 18, anim: "blink", delay: 1.479, dur: 1.6 }
    ],
  },
  crab_science_11_280: {
    v: 1,
    loop: 3.04,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 67, y: 56, size: 43, anim: "twinkle", dur: 2.64 },
      { type: "emoji", emoji: "🪖", x: 49, y: 16, size: 30, anim: "bounce", delay: 0.452, dur: 1.69 },
      { type: "emoji", emoji: "🍄", x: 67, y: 42, size: 25, anim: "blink", delay: 0.668, dur: 1.73 },
      { type: "emoji", emoji: "🌟", x: 47, y: 78, size: 21, anim: "wiggle", delay: 0.822, dur: 2.34 },
      { type: "emoji", emoji: "🍂", x: 51, y: 88, size: 20, anim: "blink", delay: 0.094, dur: 2.01 },
      { type: "emoji", emoji: "🔥", x: 78, y: 42, size: 12, anim: "rise", delay: 0.147, dur: 1.27 },
      { type: "emoji", emoji: "❄️", x: 84, y: 25, size: 19, anim: "wiggle", delay: 0.121, dur: 1.73 },
      { type: "emoji", emoji: "✨", x: 47, y: 23, size: 16, anim: "blink", delay: 1.639, dur: 1.44 },
      { type: "emoji", emoji: "⭐", x: 67, y: 66, size: 15, anim: "blink", delay: 1.428, dur: 1.31 }
    ],
  },
  crab_pets_11_281: {
    v: 1,
    loop: 3.31,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 41, y: 53, size: 39, anim: "float", dur: 2.95 },
      { type: "emoji", emoji: "🍩", x: 70, y: 39, size: 24, anim: "pop", delay: 0.68, dur: 1.41 },
      { type: "emoji", emoji: "🌿", x: 81, y: 25, size: 15, anim: "float", delay: 0.772, dur: 1.58 },
      { type: "emoji", emoji: "✨", x: 49, y: 26, size: 12, anim: "rise", delay: 0.243, dur: 1.39 },
      { type: "emoji", emoji: "❄️", x: 72, y: 42, size: 13, anim: "pop", delay: 0.004, dur: 2.37 },
      { type: "emoji", emoji: "💫", x: 50, y: 78, size: 15, anim: "blink", delay: 0.672, dur: 1.3 },
      { type: "emoji", emoji: "⭐", x: 79, y: 28, size: 16, anim: "blink", delay: 1.017, dur: 2 }
    ],
  },
  crab_magic_11_282: {
    v: 1,
    loop: 2.26,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff3e0", opacity: 0.56, anim: "pop", dur: 1.84, w: 104.07, h: 25.77 },
      { type: "emoji", emoji: "🦀", x: 60, y: 51, size: 38, anim: "pop", dur: 1.45 },
      { type: "emoji", emoji: "🧙", x: 51, y: 12, size: 33, anim: "bounce", delay: 0.5, dur: 1.9 },
      { type: "emoji", emoji: "🌿", x: 34, y: 72, size: 18, anim: "blink", delay: 0.194, dur: 1.57 },
      { type: "emoji", emoji: "✨", x: 57, y: 40, size: 18, anim: "blink", delay: 0.93, dur: 2.2 },
      { type: "emoji", emoji: "🎉", x: 86, y: 69, size: 23, anim: "float", delay: 0.749, dur: 1.89 },
      { type: "emoji", emoji: "⭐", x: 34, y: 28, size: 18, anim: "rise", delay: 1.392, dur: 2.08 },
      { type: "emoji", emoji: "💖", x: 78, y: 69, size: 13, anim: "pop", delay: 1.475, dur: 1.52 },
      { type: "emoji", emoji: "🌟", x: 70, y: 30, size: 18, anim: "blink", delay: 1.573, dur: 1.57 },
      { type: "emoji", emoji: "💫", x: 82, y: 26, size: 18, anim: "blink", delay: 1.605, dur: 1.38 }
    ],
  },
  crab_retro_11_283: {
    v: 1,
    loop: 2.92,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#66bb6a", opacity: 0.55, anim: "heartbeat", dur: 2.4, w: 93.78, h: 25.61 },
      { type: "emoji", emoji: "🦀", x: 66, y: 44, size: 39, anim: "heartbeat", dur: 2.41 },
      { type: "emoji", emoji: "🧙", x: 51, y: 12, size: 32, anim: "bounce", delay: 0.57, dur: 1.76 },
      { type: "emoji", emoji: "🍩", x: 69, y: 45, size: 24, anim: "pop", delay: 0.616, dur: 1.56 },
      { type: "emoji", emoji: "🌊", x: 76, y: 24, size: 12, anim: "pop", delay: 0.177, dur: 2.24 },
      { type: "emoji", emoji: "🔥", x: 71, y: 81, size: 18, anim: "wiggle", delay: 1.372, dur: 2.11 },
      { type: "emoji", emoji: "🌸", x: 35, y: 42, size: 14, anim: "wiggle", delay: 1.279, dur: 1.89 },
      { type: "emoji", emoji: "❤️", x: 24, y: 58, size: 23, anim: "wiggle", delay: 0.438, dur: 2.38 },
      { type: "emoji", emoji: "✨", x: 36, y: 60, size: 15, anim: "blink", delay: 1.566, dur: 1.55 },
      { type: "emoji", emoji: "✨", x: 78, y: 16, size: 10, anim: "blink", delay: 0.851, dur: 1.83 }
    ],
  },
  crab_cyber_11_284: {
    v: 1,
    loop: 3.89,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 37, y: 49, size: 37, anim: "float", dur: 3.56 },
      { type: "emoji", emoji: "🌊", x: 67, y: 55, size: 25, anim: "wiggle", delay: 0.583, dur: 1.28 },
      { type: "emoji", emoji: "❤️", x: 36, y: 69, size: 24, anim: "pop", delay: 0.774, dur: 2.26 },
      { type: "emoji", emoji: "⭐", x: 17, y: 20, size: 20, anim: "blink", delay: 0.2, dur: 2.34 },
      { type: "emoji", emoji: "⭐", x: 37, y: 26, size: 16, anim: "blink", delay: 1.502, dur: 1.78 },
      { type: "emoji", emoji: "💫", x: 79, y: 65, size: 16, anim: "blink", delay: 1.617, dur: 1.57 }
    ],
  },
  crab_nature_11_285: {
    v: 1,
    loop: 2.89,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f4511e", opacity: 0.63, anim: "float", dur: 3.12, r: 41.09 },
      { type: "emoji", emoji: "🦀", x: 46, y: 45, size: 36, anim: "float", dur: 3.1 },
      { type: "emoji", emoji: "🎭", x: 49, y: 28, size: 26, anim: "bounce", delay: 0.499, dur: 1.76 },
      { type: "emoji", emoji: "🎀", x: 69, y: 29, size: 17, anim: "float", delay: 0.413, dur: 1.49 },
      { type: "emoji", emoji: "💖", x: 65, y: 36, size: 15, anim: "blink", delay: 1.19, dur: 1.5 },
      { type: "emoji", emoji: "🔥", x: 89, y: 42, size: 24, anim: "blink", delay: 0.52, dur: 1.83 },
      { type: "emoji", emoji: "✨", x: 65, y: 23, size: 10, anim: "blink", delay: 0.998, dur: 1.98 },
      { type: "emoji", emoji: "✨", x: 16, y: 62, size: 13, anim: "blink", delay: 1.166, dur: 1.71 }
    ],
  },
  crab_underwater_11_286: {
    v: 1,
    loop: 2.68,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f8bbd0", opacity: 0.49, anim: "wave", dur: 1.93, w: 93.03, h: 21.93 },
      { type: "emoji", emoji: "🦀", x: 59, y: 52, size: 35, anim: "wave", dur: 1.75 },
      { type: "emoji", emoji: "👮", x: 52, y: 15, size: 31, anim: "bounce", delay: 0.507, dur: 1.99 },
      { type: "emoji", emoji: "✨", x: 30, y: 68, size: 24, anim: "pop", delay: 0.571, dur: 2.21 },
      { type: "emoji", emoji: "🌟", x: 48, y: 89, size: 18, anim: "rise", delay: 0.682, dur: 1.76 },
      { type: "emoji", emoji: "🔥", x: 69, y: 52, size: 14, anim: "rise", delay: 1.359, dur: 1.46 },
      { type: "emoji", emoji: "💫", x: 64, y: 59, size: 14, anim: "blink", delay: 1.199, dur: 1.14 },
      { type: "emoji", emoji: "💖", x: 15, y: 27, size: 17, anim: "blink", delay: 1.948, dur: 1.3 }
    ],
  },
  crab_sky_11_287: {
    v: 1,
    loop: 2.03,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#8e24aa", opacity: 0.45, anim: "bounce", dur: 1.34, r: 49.11 },
      { type: "emoji", emoji: "🦀", x: 52, y: 52, size: 39, anim: "bounce", dur: 1.35 },
      { type: "emoji", emoji: "🌹", x: 69, y: 40, size: 26, anim: "rise", delay: 0.644, dur: 1.63 },
      { type: "emoji", emoji: "✨", x: 50, y: 14, size: 15, anim: "wiggle", delay: 0.956, dur: 1.64 },
      { type: "emoji", emoji: "🎊", x: 26, y: 26, size: 23, anim: "pop", delay: 1.288, dur: 2.37 },
      { type: "emoji", emoji: "💖", x: 36, y: 27, size: 14, anim: "pop", delay: 1.353, dur: 1.61 },
      { type: "emoji", emoji: "💖", x: 29, y: 16, size: 17, anim: "blink", delay: 1.42, dur: 1.51 },
      { type: "emoji", emoji: "💫", x: 43, y: 60, size: 14, anim: "blink", delay: 1.689, dur: 1.25 }
    ],
  },
  crab_party_12_288: {
    v: 1,
    loop: 2.19,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 65, y: 45, size: 43, anim: "wiggle", dur: 1.48 },
      { type: "emoji", emoji: "🌸", x: 71, y: 44, size: 27, anim: "pop", delay: 0.444, dur: 1.96 },
      { type: "emoji", emoji: "🌿", x: 68, y: 80, size: 18, anim: "wiggle", delay: 1.27, dur: 1.67 },
      { type: "emoji", emoji: "⭐", x: 41, y: 67, size: 10, anim: "blink", delay: 1.748, dur: 1.88 },
      { type: "emoji", emoji: "🌟", x: 45, y: 52, size: 18, anim: "blink", delay: 1.527, dur: 1.93 }
    ],
  },
  crab_beach_12_289: {
    v: 1,
    loop: 4.2,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#5c6bc0", opacity: 0.39, anim: "breathe", dur: 3.46, r: 40.14 },
      { type: "emoji", emoji: "🦀", x: 52, y: 47, size: 41, anim: "breathe", dur: 3.57 },
      { type: "emoji", emoji: "🍦", x: 72, y: 42, size: 26, anim: "pop", delay: 0.577, dur: 1.58 },
      { type: "emoji", emoji: "🍂", x: 62, y: 41, size: 19, anim: "pop", delay: 0.013, dur: 1.56 },
      { type: "emoji", emoji: "❤️", x: 34, y: 33, size: 20, anim: "blink", delay: 0.121, dur: 1.97 },
      { type: "emoji", emoji: "🎈", x: 66, y: 12, size: 12, anim: "pop", delay: 1.34, dur: 2.3 },
      { type: "emoji", emoji: "🍂", x: 58, y: 24, size: 13, anim: "wiggle", delay: 0.567, dur: 1.72 },
      { type: "emoji", emoji: "💖", x: 56, y: 54, size: 17, anim: "blink", delay: 0.748, dur: 1.21 },
      { type: "emoji", emoji: "🌟", x: 16, y: 30, size: 11, anim: "blink", delay: 1.328, dur: 1.8 }
    ],
  },
  crab_winter_12_290: {
    v: 1,
    loop: 2.76,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fff3e0", opacity: 0.68, anim: "pulse", dur: 2.13, r: 40.14 },
      { type: "emoji", emoji: "🦀", x: 40, y: 45, size: 40, anim: "pulse", dur: 2.09 },
      { type: "emoji", emoji: "🍰", x: 65, y: 37, size: 26, anim: "pop", delay: 0.987, dur: 1.53 },
      { type: "emoji", emoji: "❄️", x: 46, y: 48, size: 19, anim: "blink", delay: 1.456, dur: 2.13 },
      { type: "emoji", emoji: "🌿", x: 39, y: 22, size: 12, anim: "rise", delay: 0.749, dur: 1.76 },
      { type: "emoji", emoji: "❄️", x: 21, y: 72, size: 21, anim: "wiggle", delay: 0.362, dur: 1.41 },
      { type: "emoji", emoji: "✨", x: 80, y: 17, size: 17, anim: "blink", delay: 1.329, dur: 1.78 },
      { type: "emoji", emoji: "✨", x: 71, y: 42, size: 15, anim: "blink", delay: 1.047, dur: 1.57 }
    ],
  },
  crab_spring_12_291: {
    v: 1,
    loop: 2.32,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#0288d1", opacity: 0.47, anim: "pulse", dur: 2.35, w: 108.94, h: 23.53 },
      { type: "emoji", emoji: "🦀", x: 49, y: 54, size: 40, anim: "pulse", dur: 2.23 },
      { type: "emoji", emoji: "🍂", x: 40, y: 83, size: 12, anim: "pop", delay: 0.809, dur: 1.29 },
      { type: "emoji", emoji: "🎊", x: 21, y: 10, size: 23, anim: "float", delay: 1.394, dur: 1.76 },
      { type: "emoji", emoji: "🎊", x: 42, y: 66, size: 22, anim: "pop", delay: 1.402, dur: 1.88 },
      { type: "emoji", emoji: "❄️", x: 60, y: 76, size: 23, anim: "pop", delay: 0.862, dur: 1.26 },
      { type: "emoji", emoji: "⭐", x: 82, y: 80, size: 18, anim: "blink", delay: 1.085, dur: 1.37 },
      { type: "emoji", emoji: "⭐", x: 17, y: 24, size: 18, anim: "blink", delay: 1.644, dur: 1.98 }
    ],
  },
  crab_halloween_12_292: {
    v: 1,
    loop: 2.9,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffb74d", opacity: 0.49, anim: "float", dur: 2.91, w: 94.4, h: 27.25 },
      { type: "emoji", emoji: "🦀", x: 52, y: 50, size: 34, anim: "float", dur: 2.89 },
      { type: "emoji", emoji: "👑", x: 48, y: 12, size: 29, anim: "bounce", delay: 0.358, dur: 1.86 },
      { type: "emoji", emoji: "🌟", x: 32, y: 23, size: 13, anim: "float", delay: 0.855, dur: 2.23 },
      { type: "emoji", emoji: "🌊", x: 21, y: 43, size: 23, anim: "blink", delay: 0.588, dur: 2.01 },
      { type: "emoji", emoji: "❤️", x: 88, y: 45, size: 25, anim: "float", delay: 0.16, dur: 1.81 },
      { type: "emoji", emoji: "🌟", x: 64, y: 37, size: 15, anim: "wiggle", delay: 1.055, dur: 1.3 },
      { type: "emoji", emoji: "⭐", x: 76, y: 63, size: 14, anim: "blink", delay: 1.568, dur: 1.09 },
      { type: "emoji", emoji: "💖", x: 43, y: 27, size: 19, anim: "blink", delay: 1.059, dur: 1.71 }
    ],
  },
  crab_christmas_12_293: {
    v: 1,
    loop: 3.28,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#81c784", opacity: 0.61, anim: "settle", dur: 2.83, r: 47.65 },
      { type: "emoji", emoji: "🦀", x: 41, y: 55, size: 42, anim: "settle", dur: 3.02 },
      { type: "emoji", emoji: "💝", x: 71, y: 37, size: 26, anim: "blink", delay: 0.857, dur: 1.41 },
      { type: "emoji", emoji: "🔥", x: 76, y: 44, size: 16, anim: "blink", delay: 0.851, dur: 1.25 },
      { type: "emoji", emoji: "🎈", x: 24, y: 25, size: 20, anim: "blink", delay: 0.953, dur: 1.7 },
      { type: "emoji", emoji: "✨", x: 30, y: 54, size: 14, anim: "blink", delay: 0.612, dur: 1.46 },
      { type: "emoji", emoji: "✨", x: 66, y: 39, size: 17, anim: "blink", delay: 1.665, dur: 1.18 }
    ],
  },
  crab_coding_12_294: {
    v: 1,
    loop: 1.97,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#7e57c2", opacity: 0.43, anim: "bounce", dur: 1.14, w: 94.86, h: 25.18 },
      { type: "emoji", emoji: "🦀", x: 33, y: 52, size: 36, anim: "bounce", dur: 1.38 },
      { type: "emoji", emoji: "🍪", x: 75, y: 43, size: 24, anim: "rise", delay: 0.552, dur: 1.61 },
      { type: "emoji", emoji: "🌿", x: 65, y: 87, size: 14, anim: "blink", delay: 0.428, dur: 1.9 },
      { type: "emoji", emoji: "✨", x: 86, y: 42, size: 20, anim: "rise", delay: 1.272, dur: 1.24 },
      { type: "emoji", emoji: "🌿", x: 11, y: 75, size: 23, anim: "rise", delay: 1.193, dur: 2.38 },
      { type: "emoji", emoji: "🔥", x: 18, y: 17, size: 20, anim: "pop", delay: 1.19, dur: 1.67 },
      { type: "emoji", emoji: "✨", x: 19, y: 82, size: 10, anim: "blink", delay: 1.607, dur: 1.58 },
      { type: "emoji", emoji: "🌟", x: 35, y: 80, size: 12, anim: "blink", delay: 1.266, dur: 1.37 }
    ],
  },
  crab_music_12_295: {
    v: 1,
    loop: 2.82,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fbe9e7", opacity: 0.39, anim: "twinkle", dur: 2.27, w: 92.27, h: 20.14 },
      { type: "emoji", emoji: "🦀", x: 32, y: 44, size: 38, anim: "twinkle", dur: 2.43 },
      { type: "emoji", emoji: "💌", x: 71, y: 43, size: 27, anim: "float", delay: 0.487, dur: 1.45 },
      { type: "emoji", emoji: "✨", x: 61, y: 72, size: 23, anim: "wiggle", delay: 1.308, dur: 1.43 },
      { type: "emoji", emoji: "💫", x: 74, y: 89, size: 16, anim: "rise", delay: 0.81, dur: 1.57 },
      { type: "emoji", emoji: "🍃", x: 81, y: 10, size: 18, anim: "wiggle", delay: 0.971, dur: 1.59 },
      { type: "emoji", emoji: "✨", x: 49, y: 78, size: 10, anim: "blink", delay: 1.247, dur: 1.88 },
      { type: "emoji", emoji: "🌟", x: 53, y: 33, size: 11, anim: "blink", delay: 1.965, dur: 1.81 }
    ],
  },
  crab_sports_12_296: {
    v: 1,
    loop: 3.34,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ec407a", opacity: 0.68, anim: "float", dur: 2.91, w: 102.56, h: 24.63 },
      { type: "emoji", emoji: "🦀", x: 55, y: 48, size: 39, anim: "float", dur: 3.09 },
      { type: "emoji", emoji: "🍃", x: 71, y: 56, size: 14, anim: "pop", delay: 0.211, dur: 1.35 },
      { type: "emoji", emoji: "🌿", x: 72, y: 20, size: 15, anim: "pop", delay: 0.996, dur: 1.33 },
      { type: "emoji", emoji: "🌊", x: 63, y: 33, size: 21, anim: "rise", delay: 0.813, dur: 1.56 },
      { type: "emoji", emoji: "🌟", x: 87, y: 21, size: 16, anim: "pop", delay: 0.825, dur: 1.41 },
      { type: "emoji", emoji: "⭐", x: 27, y: 52, size: 16, anim: "blink", delay: 1.21, dur: 1.86 },
      { type: "emoji", emoji: "💖", x: 84, y: 30, size: 11, anim: "blink", delay: 0.674, dur: 1 }
    ],
  },
  crab_food_12_297: {
    v: 1,
    loop: 2.32,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 69, y: 54, size: 39, anim: "pop", dur: 1.73 },
      { type: "emoji", emoji: "🎭", x: 50, y: 26, size: 29, anim: "bounce", delay: 0.45, dur: 1.5 },
      { type: "emoji", emoji: "🌿", x: 68, y: 20, size: 15, anim: "rise", delay: 0.383, dur: 1.72 },
      { type: "emoji", emoji: "🌿", x: 63, y: 60, size: 19, anim: "rise", delay: 0.288, dur: 2.18 },
      { type: "emoji", emoji: "🍃", x: 36, y: 69, size: 14, anim: "rise", delay: 1.391, dur: 2.01 },
      { type: "emoji", emoji: "🌊", x: 40, y: 72, size: 16, anim: "pop", delay: 1.25, dur: 1.41 },
      { type: "emoji", emoji: "🌟", x: 78, y: 22, size: 18, anim: "rise", delay: 0.757, dur: 2.29 },
      { type: "emoji", emoji: "🌟", x: 48, y: 56, size: 16, anim: "blink", delay: 0.997, dur: 1.4 },
      { type: "emoji", emoji: "💫", x: 66, y: 81, size: 10, anim: "blink", delay: 0.931, dur: 1.64 }
    ],
  },
  crab_space_12_298: {
    v: 1,
    loop: 3.18,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fff176", opacity: 0.48, anim: "heartbeat", dur: 2.4, r: 43.4 },
      { type: "emoji", emoji: "🦀", x: 62, y: 56, size: 33, anim: "heartbeat", dur: 2.41 },
      { type: "emoji", emoji: "🎁", x: 74, y: 43, size: 27, anim: "pop", delay: 0.754, dur: 1.85 },
      { type: "emoji", emoji: "🌿", x: 83, y: 85, size: 23, anim: "float", delay: 0.678, dur: 2.16 },
      { type: "emoji", emoji: "🌿", x: 70, y: 50, size: 21, anim: "rise", delay: 0.073, dur: 1.31 },
      { type: "emoji", emoji: "✨", x: 74, y: 66, size: 19, anim: "blink", delay: 1.465, dur: 1.62 },
      { type: "emoji", emoji: "✨", x: 69, y: 17, size: 10, anim: "blink", delay: 1.697, dur: 1.59 }
    ],
  },
  crab_fantasy_12_299: {
    v: 1,
    loop: 4.04,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#303f9f", opacity: 0.67, anim: "float", dur: 3.56, w: 92.15, h: 20.31 },
      { type: "emoji", emoji: "🦀", x: 55, y: 49, size: 37, anim: "float", dur: 3.57 },
      { type: "emoji", emoji: "✨", x: 42, y: 36, size: 25, anim: "wiggle", delay: 1.358, dur: 1.34 },
      { type: "emoji", emoji: "🌊", x: 57, y: 55, size: 13, anim: "blink", delay: 1.331, dur: 2.08 },
      { type: "emoji", emoji: "🌸", x: 16, y: 55, size: 15, anim: "wiggle", delay: 1.454, dur: 1.68 },
      { type: "emoji", emoji: "🍂", x: 30, y: 27, size: 25, anim: "wiggle", delay: 0.222, dur: 1.67 },
      { type: "emoji", emoji: "🎉", x: 49, y: 62, size: 18, anim: "pop", delay: 0.023, dur: 2.02 },
      { type: "emoji", emoji: "💫", x: 21, y: 21, size: 15, anim: "blink", delay: 0.574, dur: 1.41 },
      { type: "emoji", emoji: "✨", x: 18, y: 45, size: 18, anim: "blink", delay: 1.207, dur: 1.59 }
    ],
  },
  crab_office_12_300: {
    v: 1,
    loop: 2.86,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fff0f6", opacity: 0.38, anim: "float", dur: 2.86, r: 42.29 },
      { type: "emoji", emoji: "🦀", x: 46, y: 50, size: 39, anim: "float", dur: 2.98 },
      { type: "emoji", emoji: "🎓", x: 48, y: 16, size: 27, anim: "bounce", delay: 0.413, dur: 1.82 },
      { type: "emoji", emoji: "💫", x: 67, y: 79, size: 21, anim: "float", delay: 0.606, dur: 2.3 },
      { type: "emoji", emoji: "💫", x: 46, y: 59, size: 20, anim: "pop", delay: 1.07, dur: 1.53 },
      { type: "emoji", emoji: "🎉", x: 19, y: 15, size: 19, anim: "blink", delay: 1.43, dur: 1.4 },
      { type: "emoji", emoji: "🌸", x: 17, y: 73, size: 15, anim: "wiggle", delay: 0.631, dur: 1.2 },
      { type: "emoji", emoji: "🍂", x: 82, y: 49, size: 12, anim: "blink", delay: 0.762, dur: 1.78 },
      { type: "emoji", emoji: "💫", x: 65, y: 18, size: 10, anim: "blink", delay: 0.897, dur: 1.11 },
      { type: "emoji", emoji: "🌟", x: 26, y: 69, size: 17, anim: "blink", delay: 1.108, dur: 2 }
    ],
  },
  crab_fitness_12_301: {
    v: 1,
    loop: 2.3,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 44, y: 49, size: 32, anim: "wave", dur: 1.78 },
      { type: "emoji", emoji: "👑", x: 52, y: 13, size: 32, anim: "bounce", delay: 0.371, dur: 1.65 },
      { type: "emoji", emoji: "❄️", x: 61, y: 79, size: 20, anim: "float", delay: 1.407, dur: 1.28 },
      { type: "emoji", emoji: "🎉", x: 11, y: 11, size: 20, anim: "float", delay: 0.79, dur: 1.99 },
      { type: "emoji", emoji: "✨", x: 76, y: 70, size: 13, anim: "blink", delay: 1.796, dur: 1.44 },
      { type: "emoji", emoji: "⭐", x: 78, y: 17, size: 18, anim: "blink", delay: 1.848, dur: 1.64 }
    ],
  },
  crab_travel_12_302: {
    v: 1,
    loop: 1.85,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 34, y: 51, size: 42, anim: "bounce", dur: 1.54 },
      { type: "emoji", emoji: "🌸", x: 38, y: 26, size: 21, anim: "wiggle", delay: 0.215, dur: 2 },
      { type: "emoji", emoji: "🌊", x: 64, y: 87, size: 18, anim: "wiggle", delay: 0.124, dur: 1.59 },
      { type: "emoji", emoji: "✨", x: 85, y: 59, size: 23, anim: "rise", delay: 1.157, dur: 2.18 },
      { type: "emoji", emoji: "💫", x: 30, y: 28, size: 14, anim: "blink", delay: 1.995, dur: 1.72 },
      { type: "emoji", emoji: "💖", x: 30, y: 79, size: 17, anim: "blink", delay: 1.564, dur: 1.63 }
    ],
  },
  crab_art_12_303: {
    v: 1,
    loop: 2.14,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 41, y: 46, size: 43, anim: "wiggle", dur: 1.26 },
      { type: "emoji", emoji: "👒", x: 48, y: 14, size: 33, anim: "bounce", delay: 0.387, dur: 1.79 },
      { type: "emoji", emoji: "🌻", x: 68, y: 41, size: 29, anim: "float", delay: 0.892, dur: 1.43 },
      { type: "emoji", emoji: "🎊", x: 64, y: 51, size: 25, anim: "pop", delay: 0.051, dur: 1.55 },
      { type: "emoji", emoji: "🔥", x: 59, y: 23, size: 21, anim: "blink", delay: 0.599, dur: 2.04 },
      { type: "emoji", emoji: "🍂", x: 64, y: 79, size: 24, anim: "rise", delay: 0.801, dur: 2 },
      { type: "emoji", emoji: "🌟", x: 21, y: 35, size: 11, anim: "blink", delay: 1.322, dur: 1.58 },
      { type: "emoji", emoji: "✨", x: 84, y: 48, size: 19, anim: "blink", delay: 1.711, dur: 1.46 }
    ],
  },
  crab_science_12_304: {
    v: 1,
    loop: 3.84,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ede7f6", opacity: 0.45, anim: "breathe", dur: 3.52, w: 91.95, h: 24.98 },
      { type: "emoji", emoji: "🦀", x: 52, y: 49, size: 34, anim: "breathe", dur: 3.57 },
      { type: "emoji", emoji: "🎩", x: 51, y: 14, size: 32, anim: "bounce", delay: 0.573, dur: 1.61 },
      { type: "emoji", emoji: "🍄", x: 68, y: 45, size: 25, anim: "rise", delay: 0.746, dur: 1.43 },
      { type: "emoji", emoji: "🌿", x: 10, y: 65, size: 14, anim: "blink", delay: 0.843, dur: 1.39 },
      { type: "emoji", emoji: "🌿", x: 53, y: 47, size: 15, anim: "pop", delay: 1.018, dur: 2.2 },
      { type: "emoji", emoji: "⭐", x: 54, y: 51, size: 12, anim: "blink", delay: 1.599, dur: 1.86 },
      { type: "emoji", emoji: "💖", x: 77, y: 21, size: 16, anim: "blink", delay: 0.967, dur: 1.44 }
    ],
  },
  crab_pets_12_305: {
    v: 1,
    loop: 2.6,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ff7043", opacity: 0.38, anim: "pulse", dur: 1.87, w: 98.89, h: 22.95 },
      { type: "emoji", emoji: "🦀", x: 64, y: 52, size: 42, anim: "pulse", dur: 1.95 },
      { type: "emoji", emoji: "🌊", x: 17, y: 49, size: 24, anim: "blink", delay: 0.017, dur: 1.29 },
      { type: "emoji", emoji: "💫", x: 23, y: 14, size: 12, anim: "blink", delay: 0.846, dur: 1.93 },
      { type: "emoji", emoji: "❤️", x: 84, y: 64, size: 17, anim: "float", delay: 0.132, dur: 1.58 },
      { type: "emoji", emoji: "💖", x: 39, y: 18, size: 10, anim: "blink", delay: 0.79, dur: 1.79 },
      { type: "emoji", emoji: "✨", x: 39, y: 72, size: 11, anim: "blink", delay: 1.272, dur: 1.8 }
    ],
  },
  crab_magic_12_306: {
    v: 1,
    loop: 2.44,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#c2185b", opacity: 0.68, anim: "pulse", dur: 2.33, r: 45.19 },
      { type: "emoji", emoji: "🦀", x: 49, y: 55, size: 39, anim: "pulse", dur: 2.18 },
      { type: "emoji", emoji: "🍩", x: 70, y: 41, size: 26, anim: "pop", delay: 0.817, dur: 1.7 },
      { type: "emoji", emoji: "🌿", x: 40, y: 35, size: 15, anim: "rise", delay: 1.025, dur: 1.58 },
      { type: "emoji", emoji: "🌸", x: 63, y: 74, size: 17, anim: "rise", delay: 0.033, dur: 1.92 },
      { type: "emoji", emoji: "✨", x: 63, y: 45, size: 25, anim: "blink", delay: 0.067, dur: 1.63 },
      { type: "emoji", emoji: "🍃", x: 66, y: 62, size: 20, anim: "pop", delay: 1.055, dur: 1.4 },
      { type: "emoji", emoji: "🌿", x: 61, y: 46, size: 18, anim: "float", delay: 1.322, dur: 2.21 },
      { type: "emoji", emoji: "✨", x: 22, y: 53, size: 19, anim: "blink", delay: 0.58, dur: 1.8 },
      { type: "emoji", emoji: "✨", x: 64, y: 19, size: 19, anim: "blink", delay: 0.589, dur: 1.44 }
    ],
  },
  crab_retro_12_307: {
    v: 1,
    loop: 3.04,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#9c27b0", opacity: 0.62, anim: "float", dur: 2.75, w: 102.75, h: 27.2 },
      { type: "emoji", emoji: "🦀", x: 39, y: 46, size: 41, anim: "float", dur: 2.69 },
      { type: "emoji", emoji: "🤠", x: 49, y: 13, size: 32, anim: "bounce", delay: 0.43, dur: 1.82 },
      { type: "emoji", emoji: "❤️", x: 64, y: 13, size: 18, anim: "float", delay: 0.638, dur: 1.45 },
      { type: "emoji", emoji: "🎈", x: 44, y: 37, size: 25, anim: "pop", delay: 0.752, dur: 1.58 },
      { type: "emoji", emoji: "⭐", x: 82, y: 68, size: 14, anim: "wiggle", delay: 0.115, dur: 1.24 },
      { type: "emoji", emoji: "⭐", x: 74, y: 62, size: 19, anim: "blink", delay: 1.785, dur: 1.58 },
      { type: "emoji", emoji: "💖", x: 30, y: 32, size: 19, anim: "blink", delay: 1.827, dur: 1.04 }
    ],
  },
  crab_cyber_12_308: {
    v: 1,
    loop: 3.38,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fdd835", opacity: 0.39, anim: "settle", dur: 2.78, r: 45.33 },
      { type: "emoji", emoji: "🦀", x: 60, y: 56, size: 42, anim: "settle", dur: 3.11 },
      { type: "emoji", emoji: "🎁", x: 73, y: 43, size: 24, anim: "blink", delay: 0.684, dur: 1.68 },
      { type: "emoji", emoji: "⭐", x: 33, y: 50, size: 15, anim: "float", delay: 0.316, dur: 1.48 },
      { type: "emoji", emoji: "🌊", x: 41, y: 70, size: 17, anim: "wiggle", delay: 0.205, dur: 2.15 },
      { type: "emoji", emoji: "💖", x: 35, y: 32, size: 25, anim: "float", delay: 0.343, dur: 2.23 },
      { type: "emoji", emoji: "🍃", x: 59, y: 49, size: 16, anim: "wiggle", delay: 0.415, dur: 1.92 },
      { type: "emoji", emoji: "💫", x: 23, y: 40, size: 16, anim: "blink", delay: 1.839, dur: 1.86 },
      { type: "emoji", emoji: "💫", x: 61, y: 68, size: 11, anim: "blink", delay: 1.821, dur: 1.96 }
    ],
  },
  crab_nature_12_309: {
    v: 1,
    loop: 1.78,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#303f9f", opacity: 0.31, anim: "bounce", dur: 1.09, w: 105.97, h: 21.57 },
      { type: "emoji", emoji: "🦀", x: 56, y: 46, size: 43, anim: "bounce", dur: 1.34 },
      { type: "emoji", emoji: "🍭", x: 70, y: 43, size: 24, anim: "rise", delay: 0.973, dur: 1.69 },
      { type: "emoji", emoji: "🎈", x: 13, y: 64, size: 16, anim: "blink", delay: 0.077, dur: 1.71 },
      { type: "emoji", emoji: "🌿", x: 26, y: 60, size: 24, anim: "pop", delay: 0.653, dur: 1.36 },
      { type: "emoji", emoji: "⭐", x: 30, y: 32, size: 22, anim: "wiggle", delay: 0.823, dur: 2.07 },
      { type: "emoji", emoji: "🌿", x: 62, y: 78, size: 24, anim: "wiggle", delay: 0.029, dur: 1.4 },
      { type: "emoji", emoji: "⭐", x: 45, y: 24, size: 15, anim: "blink", delay: 1.207, dur: 1.93 },
      { type: "emoji", emoji: "🌟", x: 17, y: 64, size: 13, anim: "blink", delay: 0.75, dur: 1.26 }
    ],
  },
  crab_underwater_12_310: {
    v: 1,
    loop: 3.13,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 56, y: 54, size: 36, anim: "twinkle", dur: 2.6 },
      { type: "emoji", emoji: "🤠", x: 51, y: 15, size: 32, anim: "bounce", delay: 0.42, dur: 1.62 },
      { type: "emoji", emoji: "🍂", x: 45, y: 53, size: 20, anim: "wiggle", delay: 0.406, dur: 1.89 },
      { type: "emoji", emoji: "🎊", x: 61, y: 11, size: 23, anim: "pop", delay: 0.67, dur: 2.01 },
      { type: "emoji", emoji: "🌟", x: 82, y: 36, size: 14, anim: "blink", delay: 0.552, dur: 1.66 },
      { type: "emoji", emoji: "💫", x: 57, y: 67, size: 11, anim: "blink", delay: 0.838, dur: 1.84 }
    ],
  },
  crab_sky_12_311: {
    v: 1,
    loop: 3.35,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#0277bd", opacity: 0.31, anim: "float", dur: 2.95, w: 108.83, h: 18.46 },
      { type: "emoji", emoji: "🦀", x: 60, y: 55, size: 37, anim: "float", dur: 3.07 },
      { type: "emoji", emoji: "🎓", x: 50, y: 14, size: 28, anim: "bounce", delay: 0.453, dur: 1.76 },
      { type: "emoji", emoji: "🍰", x: 68, y: 40, size: 27, anim: "rise", delay: 0.917, dur: 1.84 },
      { type: "emoji", emoji: "🌊", x: 70, y: 65, size: 24, anim: "float", delay: 0.695, dur: 1.53 },
      { type: "emoji", emoji: "🌊", x: 43, y: 65, size: 25, anim: "wiggle", delay: 0.953, dur: 2.12 },
      { type: "emoji", emoji: "💫", x: 23, y: 27, size: 11, anim: "blink", delay: 1.355, dur: 1.84 },
      { type: "emoji", emoji: "✨", x: 16, y: 60, size: 14, anim: "blink", delay: 0.828, dur: 1.89 }
    ],
  },
  crab_party_13_312: {
    v: 1,
    loop: 2.21,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f57c00", opacity: 0.3, anim: "pop", dur: 1.76, w: 102.68, h: 20.63 },
      { type: "emoji", emoji: "🦀", x: 70, y: 56, size: 37, anim: "pop", dur: 1.71 },
      { type: "emoji", emoji: "👒", x: 48, y: 15, size: 33, anim: "bounce", delay: 0.514, dur: 1.93 },
      { type: "emoji", emoji: "🌸", x: 70, y: 43, size: 25, anim: "rise", delay: 0.96, dur: 1.54 },
      { type: "emoji", emoji: "🍃", x: 50, y: 56, size: 22, anim: "wiggle", delay: 0.453, dur: 2.04 },
      { type: "emoji", emoji: "💖", x: 49, y: 56, size: 18, anim: "blink", delay: 0.952, dur: 1.95 },
      { type: "emoji", emoji: "✨", x: 34, y: 83, size: 17, anim: "blink", delay: 1.532, dur: 1.18 }
    ],
  },
  crab_beach_13_313: {
    v: 1,
    loop: 2.76,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 51, y: 52, size: 44, anim: "heartbeat", dur: 2.38 },
      { type: "emoji", emoji: "🪖", x: 50, y: 18, size: 31, anim: "bounce", delay: 0.606, dur: 1.93 },
      { type: "emoji", emoji: "🍭", x: 69, y: 39, size: 26, anim: "float", delay: 0.443, dur: 1.74 },
      { type: "emoji", emoji: "❤️", x: 34, y: 86, size: 18, anim: "float", delay: 0.005, dur: 1.79 },
      { type: "emoji", emoji: "🌊", x: 61, y: 71, size: 21, anim: "rise", delay: 0.476, dur: 1.54 },
      { type: "emoji", emoji: "💖", x: 30, y: 27, size: 19, anim: "float", delay: 0.014, dur: 1.47 },
      { type: "emoji", emoji: "✨", x: 80, y: 75, size: 25, anim: "float", delay: 1.468, dur: 2.21 },
      { type: "emoji", emoji: "🔥", x: 14, y: 24, size: 12, anim: "pop", delay: 0.597, dur: 1.91 },
      { type: "emoji", emoji: "💫", x: 83, y: 20, size: 13, anim: "blink", delay: 1.367, dur: 1.62 },
      { type: "emoji", emoji: "💫", x: 30, y: 40, size: 10, anim: "blink", delay: 1.339, dur: 1.97 }
    ],
  },
  crab_winter_13_314: {
    v: 1,
    loop: 4.02,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 66, y: 50, size: 35, anim: "float", dur: 3.63 },
      { type: "emoji", emoji: "🪖", x: 52, y: 16, size: 29, anim: "bounce", delay: 0.52, dur: 1.96 },
      { type: "emoji", emoji: "🎈", x: 21, y: 65, size: 20, anim: "wiggle", delay: 0.828, dur: 1.69 },
      { type: "emoji", emoji: "🍂", x: 18, y: 60, size: 24, anim: "float", delay: 1.46, dur: 1.62 },
      { type: "emoji", emoji: "🌟", x: 83, y: 28, size: 12, anim: "blink", delay: 1.585, dur: 1.57 },
      { type: "emoji", emoji: "⭐", x: 22, y: 68, size: 14, anim: "blink", delay: 1.39, dur: 1.01 }
    ],
  },
  crab_spring_13_315: {
    v: 1,
    loop: 3.13,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ff5722", opacity: 0.68, anim: "float", dur: 2.87, w: 97, h: 18.74 },
      { type: "emoji", emoji: "🦀", x: 53, y: 46, size: 41, anim: "float", dur: 2.97 },
      { type: "emoji", emoji: "👑", x: 50, y: 14, size: 32, anim: "bounce", delay: 0.465, dur: 1.63 },
      { type: "emoji", emoji: "🌻", x: 70, y: 41, size: 29, anim: "blink", delay: 0.91, dur: 1.53 },
      { type: "emoji", emoji: "🍂", x: 33, y: 75, size: 18, anim: "rise", delay: 0.098, dur: 2.26 },
      { type: "emoji", emoji: "🌊", x: 60, y: 85, size: 22, anim: "wiggle", delay: 0.618, dur: 1.48 },
      { type: "emoji", emoji: "💖", x: 81, y: 19, size: 12, anim: "blink", delay: 0.608, dur: 1.58 },
      { type: "emoji", emoji: "✨", x: 48, y: 62, size: 17, anim: "blink", delay: 0.755, dur: 1.12 }
    ],
  },
  crab_halloween_13_316: {
    v: 1,
    loop: 2.63,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#d81b60", opacity: 0.42, anim: "wave", dur: 1.59, r: 41.27 },
      { type: "emoji", emoji: "🦀", x: 69, y: 49, size: 35, anim: "wave", dur: 1.93 },
      { type: "emoji", emoji: "🎩", x: 49, y: 11, size: 31, anim: "bounce", delay: 0.674, dur: 1.86 },
      { type: "emoji", emoji: "🌊", x: 63, y: 59, size: 15, anim: "float", delay: 1.015, dur: 1.85 },
      { type: "emoji", emoji: "🌟", x: 76, y: 67, size: 20, anim: "blink", delay: 0.886, dur: 2.13 },
      { type: "emoji", emoji: "💖", x: 59, y: 32, size: 16, anim: "wiggle", delay: 0.49, dur: 1.31 },
      { type: "emoji", emoji: "🍃", x: 20, y: 43, size: 20, anim: "rise", delay: 0.266, dur: 2 },
      { type: "emoji", emoji: "🌟", x: 27, y: 25, size: 10, anim: "blink", delay: 0.998, dur: 1.13 },
      { type: "emoji", emoji: "✨", x: 22, y: 18, size: 10, anim: "blink", delay: 0.965, dur: 1.82 }
    ],
  },
  crab_christmas_13_317: {
    v: 1,
    loop: 2.13,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#8e24aa", opacity: 0.62, anim: "bounce", dur: 1.63, w: 108.12, h: 20.79 },
      { type: "emoji", emoji: "🦀", x: 51, y: 44, size: 40, anim: "bounce", dur: 1.52 },
      { type: "emoji", emoji: "🤠", x: 48, y: 12, size: 32, anim: "bounce", delay: 0.375, dur: 1.78 },
      { type: "emoji", emoji: "💌", x: 67, y: 44, size: 27, anim: "float", delay: 0.727, dur: 1.93 },
      { type: "emoji", emoji: "🍂", x: 24, y: 51, size: 15, anim: "wiggle", delay: 1.446, dur: 1.92 },
      { type: "emoji", emoji: "✨", x: 33, y: 74, size: 10, anim: "blink", delay: 1.103, dur: 1.24 },
      { type: "emoji", emoji: "💫", x: 39, y: 23, size: 12, anim: "blink", delay: 1.68, dur: 1.94 }
    ],
  },
  crab_coding_13_318: {
    v: 1,
    loop: 2.08,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff59d", opacity: 0.46, anim: "wiggle", dur: 1.33, w: 108.02, h: 18.3 },
      { type: "emoji", emoji: "🦀", x: 57, y: 46, size: 35, anim: "wiggle", dur: 1.51 },
      { type: "emoji", emoji: "🕶️", x: 51, y: 29, size: 31, anim: "bounce", delay: 0.321, dur: 1.64 },
      { type: "emoji", emoji: "🍪", x: 74, y: 47, size: 24, anim: "float", delay: 0.794, dur: 1.97 },
      { type: "emoji", emoji: "🎊", x: 65, y: 50, size: 24, anim: "wiggle", delay: 0.305, dur: 2.21 },
      { type: "emoji", emoji: "⭐", x: 22, y: 64, size: 20, anim: "rise", delay: 0.848, dur: 2.27 },
      { type: "emoji", emoji: "❤️", x: 29, y: 15, size: 17, anim: "float", delay: 1.442, dur: 2.28 },
      { type: "emoji", emoji: "🔥", x: 55, y: 71, size: 23, anim: "blink", delay: 0.418, dur: 1.3 },
      { type: "emoji", emoji: "⭐", x: 65, y: 34, size: 16, anim: "float", delay: 0.343, dur: 2.15 },
      { type: "emoji", emoji: "💖", x: 25, y: 73, size: 19, anim: "blink", delay: 1.711, dur: 1.61 },
      { type: "emoji", emoji: "🌟", x: 47, y: 20, size: 11, anim: "blink", delay: 1.311, dur: 1.95 }
    ],
  },
  crab_music_13_319: {
    v: 1,
    loop: 4.18,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 38, y: 45, size: 43, anim: "breathe", dur: 3.45 },
      { type: "emoji", emoji: "🌟", x: 75, y: 29, size: 27, anim: "blink", delay: 0.749, dur: 1.99 },
      { type: "emoji", emoji: "✨", x: 44, y: 78, size: 23, anim: "pop", delay: 1.133, dur: 2.34 },
      { type: "emoji", emoji: "🍃", x: 31, y: 53, size: 17, anim: "rise", delay: 0.004, dur: 2.11 },
      { type: "emoji", emoji: "🌟", x: 87, y: 17, size: 23, anim: "blink", delay: 1.268, dur: 1.92 },
      { type: "emoji", emoji: "❄️", x: 10, y: 49, size: 13, anim: "blink", delay: 1.432, dur: 2.1 },
      { type: "emoji", emoji: "✨", x: 26, y: 84, size: 14, anim: "float", delay: 1.109, dur: 2.16 },
      { type: "emoji", emoji: "💫", x: 74, y: 45, size: 19, anim: "blink", delay: 1.571, dur: 1.29 },
      { type: "emoji", emoji: "✨", x: 16, y: 58, size: 17, anim: "blink", delay: 1.001, dur: 1.72 }
    ],
  },
  crab_sports_13_320: {
    v: 1,
    loop: 2.68,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#e1f5fe", opacity: 0.58, anim: "pulse", dur: 1.94, w: 103.51, h: 24.32 },
      { type: "emoji", emoji: "🦀", x: 55, y: 48, size: 35, anim: "pulse", dur: 1.91 },
      { type: "emoji", emoji: "🌸", x: 17, y: 12, size: 23, anim: "pop", delay: 0.027, dur: 1.21 },
      { type: "emoji", emoji: "💫", x: 13, y: 75, size: 21, anim: "wiggle", delay: 0.653, dur: 1.62 },
      { type: "emoji", emoji: "✨", x: 10, y: 12, size: 20, anim: "rise", delay: 0.84, dur: 2.19 },
      { type: "emoji", emoji: "⭐", x: 62, y: 57, size: 17, anim: "blink", delay: 1.458, dur: 1.47 },
      { type: "emoji", emoji: "🌟", x: 56, y: 80, size: 17, anim: "blink", delay: 0.622, dur: 1.08 }
    ],
  },
  crab_food_13_321: {
    v: 1,
    loop: 2.61,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#81d4fa", opacity: 0.57, anim: "pulse", dur: 2.43, w: 103.74, h: 26.29 },
      { type: "emoji", emoji: "🦀", x: 52, y: 47, size: 38, anim: "pulse", dur: 2.05 },
      { type: "emoji", emoji: "🧣", x: 51, y: 59, size: 25, anim: "bounce", delay: 0.57, dur: 1.58 },
      { type: "emoji", emoji: "💖", x: 32, y: 10, size: 17, anim: "blink", delay: 0.972, dur: 2.38 },
      { type: "emoji", emoji: "🍂", x: 86, y: 60, size: 22, anim: "blink", delay: 0.235, dur: 2.22 },
      { type: "emoji", emoji: "🔥", x: 56, y: 75, size: 18, anim: "pop", delay: 1.208, dur: 1.44 },
      { type: "emoji", emoji: "❤️", x: 73, y: 38, size: 19, anim: "wiggle", delay: 0.728, dur: 2.15 },
      { type: "emoji", emoji: "🌟", x: 50, y: 72, size: 20, anim: "wiggle", delay: 0.966, dur: 2.15 },
      { type: "emoji", emoji: "💖", x: 29, y: 41, size: 19, anim: "blink", delay: 1.117, dur: 1.01 },
      { type: "emoji", emoji: "✨", x: 64, y: 15, size: 19, anim: "blink", delay: 1.099, dur: 1.1 }
    ],
  },
  crab_space_13_322: {
    v: 1,
    loop: 2.9,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffcc80", opacity: 0.67, anim: "float", dur: 2.92, w: 96.08, h: 22.14 },
      { type: "emoji", emoji: "🦀", x: 53, y: 45, size: 40, anim: "float", dur: 2.93 },
      { type: "emoji", emoji: "👒", x: 51, y: 16, size: 34, anim: "bounce", delay: 0.579, dur: 1.52 },
      { type: "emoji", emoji: "🌟", x: 34, y: 11, size: 14, anim: "pop", delay: 0.634, dur: 1.57 },
      { type: "emoji", emoji: "🎉", x: 14, y: 37, size: 16, anim: "pop", delay: 0.44, dur: 1.6 },
      { type: "emoji", emoji: "⭐", x: 30, y: 48, size: 14, anim: "blink", delay: 1.715, dur: 1.49 },
      { type: "emoji", emoji: "✨", x: 71, y: 82, size: 14, anim: "blink", delay: 1.754, dur: 1.91 }
    ],
  },
  crab_fantasy_13_323: {
    v: 1,
    loop: 3.34,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#c8e6c9", opacity: 0.45, anim: "settle", dur: 2.99, r: 48.04 },
      { type: "emoji", emoji: "🦀", x: 30, y: 52, size: 36, anim: "settle", dur: 3 },
      { type: "emoji", emoji: "🎈", x: 38, y: 20, size: 18, anim: "pop", delay: 0.521, dur: 1.45 },
      { type: "emoji", emoji: "💖", x: 83, y: 61, size: 12, anim: "blink", delay: 0.107, dur: 1.25 },
      { type: "emoji", emoji: "🌟", x: 35, y: 24, size: 11, anim: "blink", delay: 1.357, dur: 1.46 },
      { type: "emoji", emoji: "🌟", x: 78, y: 47, size: 16, anim: "blink", delay: 1.356, dur: 1.07 }
    ],
  },
  crab_office_13_324: {
    v: 1,
    loop: 1.93,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#5e35b1", opacity: 0.52, anim: "bounce", dur: 1.15, r: 44.08 },
      { type: "emoji", emoji: "🦀", x: 49, y: 46, size: 35, anim: "bounce", dur: 1.16 },
      { type: "emoji", emoji: "✨", x: 44, y: 66, size: 19, anim: "pop", delay: 0.202, dur: 1.36 },
      { type: "emoji", emoji: "🌸", x: 64, y: 42, size: 14, anim: "rise", delay: 1.197, dur: 2.26 },
      { type: "emoji", emoji: "🎊", x: 83, y: 31, size: 12, anim: "rise", delay: 1.394, dur: 1.4 },
      { type: "emoji", emoji: "💖", x: 18, y: 21, size: 16, anim: "blink", delay: 1.105, dur: 1.94 },
      { type: "emoji", emoji: "🌟", x: 18, y: 44, size: 14, anim: "blink", delay: 1.022, dur: 1.64 }
    ],
  },
  crab_fitness_13_325: {
    v: 1,
    loop: 2.99,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e64a19", opacity: 0.39, anim: "twinkle", dur: 2.26, r: 45.39 },
      { type: "emoji", emoji: "🦀", x: 57, y: 52, size: 40, anim: "twinkle", dur: 2.52 },
      { type: "emoji", emoji: "🧢", x: 51, y: 15, size: 30, anim: "bounce", delay: 0.683, dur: 1.64 },
      { type: "emoji", emoji: "🍦", x: 69, y: 39, size: 28, anim: "blink", delay: 0.418, dur: 1.45 },
      { type: "emoji", emoji: "💖", x: 65, y: 25, size: 12, anim: "wiggle", delay: 1.35, dur: 1.45 },
      { type: "emoji", emoji: "💫", x: 71, y: 57, size: 13, anim: "rise", delay: 0.071, dur: 1.25 },
      { type: "emoji", emoji: "🔥", x: 75, y: 33, size: 14, anim: "rise", delay: 1.279, dur: 1.31 },
      { type: "emoji", emoji: "⭐", x: 60, y: 25, size: 11, anim: "blink", delay: 1.894, dur: 1.9 },
      { type: "emoji", emoji: "⭐", x: 76, y: 17, size: 10, anim: "blink", delay: 0.592, dur: 2 }
    ],
  },
  crab_travel_13_326: {
    v: 1,
    loop: 3.07,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 60, y: 48, size: 43, anim: "float", dur: 3.11 },
      { type: "emoji", emoji: "👮", x: 49, y: 17, size: 28, anim: "bounce", delay: 0.554, dur: 1.61 },
      { type: "emoji", emoji: "💖", x: 83, y: 23, size: 19, anim: "pop", delay: 0.11, dur: 2.18 },
      { type: "emoji", emoji: "❤️", x: 76, y: 39, size: 17, anim: "pop", delay: 0.733, dur: 1.75 },
      { type: "emoji", emoji: "🍃", x: 31, y: 36, size: 17, anim: "rise", delay: 0.431, dur: 1.34 },
      { type: "emoji", emoji: "💖", x: 65, y: 37, size: 18, anim: "blink", delay: 1.801, dur: 1.97 },
      { type: "emoji", emoji: "💫", x: 71, y: 45, size: 19, anim: "blink", delay: 0.947, dur: 1.11 }
    ],
  },
  crab_art_13_327: {
    v: 1,
    loop: 2.37,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 40, y: 51, size: 38, anim: "pop", dur: 1.46 },
      { type: "emoji", emoji: "🤠", x: 52, y: 15, size: 32, anim: "bounce", delay: 0.403, dur: 1.94 },
      { type: "emoji", emoji: "🍃", x: 36, y: 79, size: 15, anim: "rise", delay: 1.387, dur: 1.53 },
      { type: "emoji", emoji: "🔥", x: 30, y: 28, size: 19, anim: "pop", delay: 0.303, dur: 1.83 },
      { type: "emoji", emoji: "⭐", x: 83, y: 51, size: 24, anim: "wiggle", delay: 0.866, dur: 1.51 },
      { type: "emoji", emoji: "✨", x: 21, y: 82, size: 11, anim: "blink", delay: 1.789, dur: 1.32 },
      { type: "emoji", emoji: "💫", x: 62, y: 81, size: 13, anim: "blink", delay: 1.72, dur: 1.29 }
    ],
  },
  crab_science_13_328: {
    v: 1,
    loop: 3.16,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fbc02d", opacity: 0.35, anim: "heartbeat", dur: 2.66, r: 44.39 },
      { type: "emoji", emoji: "🦀", x: 64, y: 45, size: 43, anim: "heartbeat", dur: 2.53 },
      { type: "emoji", emoji: "💌", x: 68, y: 41, size: 26, anim: "rise", delay: 0.646, dur: 1.59 },
      { type: "emoji", emoji: "🌸", x: 77, y: 78, size: 12, anim: "float", delay: 0.297, dur: 1.28 },
      { type: "emoji", emoji: "💫", x: 79, y: 42, size: 24, anim: "float", delay: 0.363, dur: 1.23 },
      { type: "emoji", emoji: "🍃", x: 18, y: 59, size: 24, anim: "float", delay: 0.265, dur: 1.77 },
      { type: "emoji", emoji: "🎉", x: 54, y: 25, size: 14, anim: "pop", delay: 0.662, dur: 1.28 },
      { type: "emoji", emoji: "💖", x: 47, y: 65, size: 13, anim: "blink", delay: 0.949, dur: 1.99 },
      { type: "emoji", emoji: "🌟", x: 44, y: 56, size: 16, anim: "blink", delay: 0.57, dur: 1.07 }
    ],
  },
  crab_pets_13_329: {
    v: 1,
    loop: 4.19,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#9fa8da", opacity: 0.55, anim: "float", dur: 3.61, r: 46.7 },
      { type: "emoji", emoji: "🦀", x: 60, y: 47, size: 39, anim: "float", dur: 3.48 },
      { type: "emoji", emoji: "👑", x: 49, y: 14, size: 31, anim: "bounce", delay: 0.668, dur: 1.67 },
      { type: "emoji", emoji: "🎈", x: 74, y: 27, size: 29, anim: "pop", delay: 0.46, dur: 1.69 },
      { type: "emoji", emoji: "🍃", x: 16, y: 67, size: 24, anim: "float", delay: 1.492, dur: 1.5 },
      { type: "emoji", emoji: "🔥", x: 86, y: 23, size: 17, anim: "float", delay: 0.976, dur: 1.22 },
      { type: "emoji", emoji: "🍃", x: 47, y: 42, size: 18, anim: "wiggle", delay: 0.686, dur: 1.54 },
      { type: "emoji", emoji: "⭐", x: 33, y: 24, size: 13, anim: "blink", delay: 0.965, dur: 1.35 },
      { type: "emoji", emoji: "💫", x: 64, y: 72, size: 19, anim: "blink", delay: 1.594, dur: 1.54 }
    ],
  },
  crab_magic_13_330: {
    v: 1,
    loop: 2.76,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#e8f5e9", opacity: 0.53, anim: "float", dur: 2.93, w: 99.7, h: 21.56 },
      { type: "emoji", emoji: "🦀", x: 55, y: 45, size: 44, anim: "float", dur: 2.9 },
      { type: "emoji", emoji: "🎓", x: 52, y: 14, size: 28, anim: "bounce", delay: 0.397, dur: 1.58 },
      { type: "emoji", emoji: "🍫", x: 70, y: 47, size: 24, anim: "rise", delay: 0.723, dur: 1.92 },
      { type: "emoji", emoji: "🍃", x: 27, y: 71, size: 16, anim: "pop", delay: 1.399, dur: 1.39 },
      { type: "emoji", emoji: "🍂", x: 61, y: 88, size: 20, anim: "wiggle", delay: 0.923, dur: 1.67 },
      { type: "emoji", emoji: "💫", x: 57, y: 25, size: 17, anim: "blink", delay: 1.106, dur: 1.72 },
      { type: "emoji", emoji: "🌟", x: 30, y: 57, size: 14, anim: "blink", delay: 0.637, dur: 1.2 }
    ],
  },
  crab_retro_13_331: {
    v: 1,
    loop: 2.63,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 46, y: 55, size: 39, anim: "wave", dur: 1.9 },
      { type: "emoji", emoji: "👮", x: 50, y: 16, size: 31, anim: "bounce", delay: 0.468, dur: 1.88 },
      { type: "emoji", emoji: "🔥", x: 25, y: 39, size: 25, anim: "rise", delay: 0.509, dur: 1.89 },
      { type: "emoji", emoji: "❤️", x: 46, y: 12, size: 20, anim: "pop", delay: 0.424, dur: 1.45 },
      { type: "emoji", emoji: "🌸", x: 23, y: 78, size: 12, anim: "pop", delay: 0.364, dur: 1.75 },
      { type: "emoji", emoji: "💖", x: 25, y: 33, size: 18, anim: "blink", delay: 1.469, dur: 1.97 },
      { type: "emoji", emoji: "💫", x: 75, y: 34, size: 19, anim: "blink", delay: 1.559, dur: 1.86 }
    ],
  },
  crab_cyber_13_332: {
    v: 1,
    loop: 1.95,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 37, y: 54, size: 32, anim: "bounce", dur: 1.51 },
      { type: "emoji", emoji: "🤠", x: 49, y: 12, size: 32, anim: "bounce", delay: 0.528, dur: 1.56 },
      { type: "emoji", emoji: "💎", x: 67, y: 40, size: 23, anim: "float", delay: 0.569, dur: 1.86 },
      { type: "emoji", emoji: "💖", x: 41, y: 66, size: 21, anim: "blink", delay: 1.18, dur: 1.81 },
      { type: "emoji", emoji: "⭐", x: 78, y: 16, size: 20, anim: "rise", delay: 1.132, dur: 1.98 },
      { type: "emoji", emoji: "💖", x: 61, y: 62, size: 18, anim: "blink", delay: 0.712, dur: 1.81 },
      { type: "emoji", emoji: "🌟", x: 19, y: 66, size: 17, anim: "blink", delay: 1.07, dur: 1.73 }
    ],
  },
  crab_nature_13_333: {
    v: 1,
    loop: 2.17,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#43a047", opacity: 0.53, anim: "wiggle", dur: 1.64, w: 101.21, h: 24.77 },
      { type: "emoji", emoji: "🦀", x: 52, y: 47, size: 35, anim: "wiggle", dur: 1.46 },
      { type: "emoji", emoji: "⭐", x: 73, y: 30, size: 23, anim: "pop", delay: 0.656, dur: 1.46 },
      { type: "emoji", emoji: "❤️", x: 74, y: 37, size: 18, anim: "blink", delay: 1.21, dur: 1.7 },
      { type: "emoji", emoji: "💫", x: 78, y: 49, size: 12, anim: "wiggle", delay: 1.407, dur: 1.53 },
      { type: "emoji", emoji: "🌸", x: 56, y: 82, size: 21, anim: "rise", delay: 0.675, dur: 1.28 },
      { type: "emoji", emoji: "❄️", x: 56, y: 55, size: 17, anim: "blink", delay: 1.372, dur: 1.82 },
      { type: "emoji", emoji: "🔥", x: 39, y: 62, size: 13, anim: "pop", delay: 0.839, dur: 1.94 },
      { type: "emoji", emoji: "🌟", x: 45, y: 57, size: 14, anim: "blink", delay: 1.302, dur: 1.29 },
      { type: "emoji", emoji: "💖", x: 21, y: 24, size: 15, anim: "blink", delay: 0.588, dur: 1.36 }
    ],
  },
  crab_underwater_13_334: {
    v: 1,
    loop: 3.93,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#673ab7", opacity: 0.41, anim: "breathe", dur: 3.31, w: 98.52, h: 25.78 },
      { type: "emoji", emoji: "🦀", x: 63, y: 54, size: 43, anim: "breathe", dur: 3.48 },
      { type: "emoji", emoji: "👒", x: 49, y: 14, size: 32, anim: "bounce", delay: 0.495, dur: 2 },
      { type: "emoji", emoji: "💎", x: 68, y: 41, size: 24, anim: "rise", delay: 0.508, dur: 1.96 },
      { type: "emoji", emoji: "🔥", x: 33, y: 15, size: 22, anim: "rise", delay: 1.245, dur: 2.02 },
      { type: "emoji", emoji: "🎉", x: 44, y: 62, size: 25, anim: "rise", delay: 0.279, dur: 1.9 },
      { type: "emoji", emoji: "💖", x: 12, y: 68, size: 21, anim: "pop", delay: 1.239, dur: 1.46 },
      { type: "emoji", emoji: "✨", x: 21, y: 67, size: 16, anim: "blink", delay: 0.617, dur: 1.28 },
      { type: "emoji", emoji: "🌟", x: 20, y: 17, size: 14, anim: "blink", delay: 1.435, dur: 1.24 }
    ],
  },
  crab_sky_13_335: {
    v: 1,
    loop: 2.95,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 59, y: 56, size: 44, anim: "pulse", dur: 1.93 },
      { type: "emoji", emoji: "👷", x: 50, y: 17, size: 30, anim: "bounce", delay: 0.515, dur: 1.73 },
      { type: "emoji", emoji: "🌿", x: 61, y: 67, size: 14, anim: "pop", delay: 0.926, dur: 2.36 },
      { type: "emoji", emoji: "🍃", x: 40, y: 25, size: 25, anim: "rise", delay: 0.567, dur: 1.92 },
      { type: "emoji", emoji: "🎈", x: 66, y: 52, size: 23, anim: "pop", delay: 0.583, dur: 1.47 },
      { type: "emoji", emoji: "🎊", x: 12, y: 71, size: 20, anim: "wiggle", delay: 0.614, dur: 1.39 },
      { type: "emoji", emoji: "✨", x: 29, y: 60, size: 17, anim: "blink", delay: 1.996, dur: 1.94 },
      { type: "emoji", emoji: "⭐", x: 54, y: 84, size: 16, anim: "blink", delay: 0.962, dur: 1.39 }
    ],
  },
  crab_party_14_336: {
    v: 1,
    loop: 2.72,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 52, y: 47, size: 43, anim: "pulse", dur: 2.09 },
      { type: "emoji", emoji: "👑", x: 51, y: 15, size: 29, anim: "bounce", delay: 0.589, dur: 1.96 },
      { type: "emoji", emoji: "🍭", x: 68, y: 37, size: 26, anim: "blink", delay: 0.835, dur: 1.64 },
      { type: "emoji", emoji: "🌊", x: 44, y: 73, size: 15, anim: "pop", delay: 0.275, dur: 2.19 },
      { type: "emoji", emoji: "🌸", x: 30, y: 78, size: 25, anim: "float", delay: 0.721, dur: 2.26 },
      { type: "emoji", emoji: "💫", x: 87, y: 65, size: 25, anim: "blink", delay: 1.083, dur: 1.23 },
      { type: "emoji", emoji: "🔥", x: 18, y: 56, size: 25, anim: "rise", delay: 0.476, dur: 2.17 },
      { type: "emoji", emoji: "⭐", x: 47, y: 71, size: 17, anim: "blink", delay: 0.726, dur: 1.97 },
      { type: "emoji", emoji: "⭐", x: 49, y: 76, size: 15, anim: "blink", delay: 1.823, dur: 1.37 }
    ],
  },
  crab_beach_14_337: {
    v: 1,
    loop: 2.91,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 42, y: 48, size: 40, anim: "float", dur: 2.78 },
      { type: "emoji", emoji: "🌹", x: 68, y: 44, size: 29, anim: "blink", delay: 0.53, dur: 1.89 },
      { type: "emoji", emoji: "🌊", x: 83, y: 25, size: 23, anim: "float", delay: 0.763, dur: 2.18 },
      { type: "emoji", emoji: "🎈", x: 39, y: 81, size: 17, anim: "blink", delay: 0.403, dur: 1.58 },
      { type: "emoji", emoji: "🍂", x: 12, y: 41, size: 18, anim: "float", delay: 0.954, dur: 1.47 },
      { type: "emoji", emoji: "💖", x: 77, y: 18, size: 14, anim: "blink", delay: 1.033, dur: 1.94 },
      { type: "emoji", emoji: "🌟", x: 42, y: 43, size: 19, anim: "blink", delay: 1.758, dur: 1.7 }
    ],
  },
  crab_winter_14_338: {
    v: 1,
    loop: 3.72,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 60, y: 49, size: 35, anim: "settle", dur: 3.14 },
      { type: "emoji", emoji: "🔥", x: 14, y: 63, size: 23, anim: "pop", delay: 0.736, dur: 1.92 },
      { type: "emoji", emoji: "🌿", x: 68, y: 56, size: 13, anim: "blink", delay: 1.264, dur: 1.43 },
      { type: "emoji", emoji: "✨", x: 32, y: 81, size: 12, anim: "pop", delay: 0.704, dur: 1.76 },
      { type: "emoji", emoji: "✨", x: 58, y: 43, size: 15, anim: "blink", delay: 1.171, dur: 1 },
      { type: "emoji", emoji: "💫", x: 78, y: 77, size: 18, anim: "blink", delay: 0.869, dur: 1.06 }
    ],
  },
  crab_spring_14_339: {
    v: 1,
    loop: 1.87,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 54, y: 45, size: 36, anim: "bounce", dur: 1.2 },
      { type: "emoji", emoji: "🍫", x: 73, y: 44, size: 26, anim: "rise", delay: 0.818, dur: 1.58 },
      { type: "emoji", emoji: "❤️", x: 68, y: 50, size: 22, anim: "wiggle", delay: 0.018, dur: 2.27 },
      { type: "emoji", emoji: "🌟", x: 69, y: 76, size: 13, anim: "blink", delay: 0.637, dur: 1.99 },
      { type: "emoji", emoji: "❤️", x: 51, y: 82, size: 25, anim: "float", delay: 0.792, dur: 1.69 },
      { type: "emoji", emoji: "❤️", x: 26, y: 45, size: 17, anim: "wiggle", delay: 0.872, dur: 1.83 },
      { type: "emoji", emoji: "🌟", x: 49, y: 29, size: 15, anim: "blink", delay: 1.084, dur: 1.96 },
      { type: "emoji", emoji: "🌟", x: 25, y: 79, size: 15, anim: "blink", delay: 0.584, dur: 1.57 }
    ],
  },
  crab_halloween_14_340: {
    v: 1,
    loop: 2.82,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#f3e5f5", opacity: 0.56, anim: "twinkle", dur: 2.65, r: 46.03 },
      { type: "emoji", emoji: "🦀", x: 67, y: 52, size: 39, anim: "twinkle", dur: 2.42 },
      { type: "emoji", emoji: "🧙", x: 50, y: 14, size: 32, anim: "bounce", delay: 0.348, dur: 1.57 },
      { type: "emoji", emoji: "🎁", x: 74, y: 42, size: 26, anim: "float", delay: 0.638, dur: 1.76 },
      { type: "emoji", emoji: "🌟", x: 82, y: 69, size: 14, anim: "wiggle", delay: 0.341, dur: 2.22 },
      { type: "emoji", emoji: "⭐", x: 64, y: 67, size: 21, anim: "wiggle", delay: 0.23, dur: 1.99 },
      { type: "emoji", emoji: "❄️", x: 48, y: 63, size: 17, anim: "pop", delay: 0.601, dur: 1.93 },
      { type: "emoji", emoji: "✨", x: 75, y: 15, size: 11, anim: "blink", delay: 1.685, dur: 1.35 },
      { type: "emoji", emoji: "⭐", x: 49, y: 48, size: 11, anim: "blink", delay: 1.66, dur: 1.6 }
    ],
  },
  crab_christmas_14_341: {
    v: 1,
    loop: 3.06,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#039be5", opacity: 0.47, anim: "float", dur: 3.02, w: 94.42, h: 24.4 },
      { type: "emoji", emoji: "🦀", x: 49, y: 46, size: 39, anim: "float", dur: 3.03 },
      { type: "emoji", emoji: "🤠", x: 51, y: 14, size: 33, anim: "bounce", delay: 0.426, dur: 1.53 },
      { type: "emoji", emoji: "💌", x: 71, y: 45, size: 27, anim: "float", delay: 0.442, dur: 1.71 },
      { type: "emoji", emoji: "🎉", x: 27, y: 72, size: 25, anim: "pop", delay: 0.873, dur: 2.21 },
      { type: "emoji", emoji: "💫", x: 15, y: 85, size: 21, anim: "blink", delay: 0.686, dur: 1.34 },
      { type: "emoji", emoji: "🎊", x: 59, y: 12, size: 17, anim: "wiggle", delay: 0.705, dur: 1.23 },
      { type: "emoji", emoji: "🌊", x: 36, y: 33, size: 23, anim: "blink", delay: 1.211, dur: 1.64 },
      { type: "emoji", emoji: "💖", x: 21, y: 27, size: 19, anim: "blink", delay: 1.079, dur: 1.93 },
      { type: "emoji", emoji: "⭐", x: 56, y: 22, size: 14, anim: "blink", delay: 1.348, dur: 1.13 }
    ],
  },
  crab_coding_14_342: {
    v: 1,
    loop: 1.95,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f57c00", opacity: 0.37, anim: "pop", dur: 1.66, w: 102.01, h: 26.27 },
      { type: "emoji", emoji: "🦀", x: 50, y: 47, size: 36, anim: "pop", dur: 1.6 },
      { type: "emoji", emoji: "🌸", x: 17, y: 82, size: 22, anim: "rise", delay: 0.347, dur: 2.05 },
      { type: "emoji", emoji: "🎉", x: 56, y: 65, size: 22, anim: "blink", delay: 1.403, dur: 1.49 },
      { type: "emoji", emoji: "✨", x: 15, y: 20, size: 11, anim: "blink", delay: 1.781, dur: 1.59 },
      { type: "emoji", emoji: "⭐", x: 46, y: 71, size: 11, anim: "blink", delay: 0.511, dur: 1.28 }
    ],
  },
  crab_music_14_343: {
    v: 1,
    loop: 3.13,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 41, y: 52, size: 34, anim: "heartbeat", dur: 2.38 },
      { type: "emoji", emoji: "🍳", x: 49, y: 15, size: 26, anim: "bounce", delay: 0.5, dur: 1.69 },
      { type: "emoji", emoji: "🌸", x: 69, y: 41, size: 24, anim: "blink", delay: 0.458, dur: 1.9 },
      { type: "emoji", emoji: "🍂", x: 54, y: 10, size: 22, anim: "pop", delay: 1.046, dur: 1.62 },
      { type: "emoji", emoji: "🌿", x: 33, y: 74, size: 20, anim: "pop", delay: 1.087, dur: 2.04 },
      { type: "emoji", emoji: "✨", x: 10, y: 33, size: 19, anim: "blink", delay: 0.325, dur: 1.26 },
      { type: "emoji", emoji: "💖", x: 54, y: 24, size: 13, anim: "blink", delay: 1.513, dur: 1.4 },
      { type: "emoji", emoji: "💖", x: 69, y: 37, size: 14, anim: "blink", delay: 1.131, dur: 1.47 }
    ],
  },
  crab_sports_14_344: {
    v: 1,
    loop: 4.04,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#5e35b1", opacity: 0.51, anim: "float", dur: 3.42, w: 99, h: 27.58 },
      { type: "emoji", emoji: "🦀", x: 43, y: 50, size: 33, anim: "float", dur: 3.56 },
      { type: "emoji", emoji: "💌", x: 71, y: 43, size: 26, anim: "rise", delay: 0.599, dur: 1.95 },
      { type: "emoji", emoji: "🍂", x: 86, y: 23, size: 12, anim: "rise", delay: 1.15, dur: 2.36 },
      { type: "emoji", emoji: "✨", x: 53, y: 38, size: 18, anim: "rise", delay: 0.664, dur: 1.21 },
      { type: "emoji", emoji: "🌊", x: 14, y: 81, size: 24, anim: "rise", delay: 0.145, dur: 1.66 },
      { type: "emoji", emoji: "💖", x: 46, y: 71, size: 10, anim: "blink", delay: 1.726, dur: 1.22 },
      { type: "emoji", emoji: "🌟", x: 45, y: 37, size: 15, anim: "blink", delay: 1.034, dur: 1.71 }
    ],
  },
  crab_food_14_345: {
    v: 1,
    loop: 2.93,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffccbc", opacity: 0.61, anim: "float", dur: 3.23, w: 101.03, h: 21.84 },
      { type: "emoji", emoji: "🦀", x: 67, y: 45, size: 42, anim: "float", dur: 2.93 },
      { type: "emoji", emoji: "💫", x: 16, y: 42, size: 22, anim: "rise", delay: 0.208, dur: 2.08 },
      { type: "emoji", emoji: "🎊", x: 60, y: 78, size: 16, anim: "rise", delay: 0.268, dur: 2.19 },
      { type: "emoji", emoji: "🌊", x: 21, y: 65, size: 23, anim: "float", delay: 1.467, dur: 2.35 },
      { type: "emoji", emoji: "💖", x: 46, y: 79, size: 17, anim: "blink", delay: 0.887, dur: 1.47 },
      { type: "emoji", emoji: "✨", x: 58, y: 21, size: 15, anim: "blink", delay: 0.819, dur: 1.01 }
    ],
  },
  crab_space_14_346: {
    v: 1,
    loop: 2.67,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fce4ec", opacity: 0.44, anim: "wave", dur: 1.65, r: 41.2 },
      { type: "emoji", emoji: "🦀", x: 68, y: 55, size: 40, anim: "wave", dur: 1.85 },
      { type: "emoji", emoji: "🎀", x: 71, y: 31, size: 16, anim: "rise", delay: 0.574, dur: 1.57 },
      { type: "emoji", emoji: "🌊", x: 26, y: 69, size: 13, anim: "rise", delay: 0.609, dur: 1.22 },
      { type: "emoji", emoji: "💖", x: 38, y: 54, size: 17, anim: "pop", delay: 0.006, dur: 1.84 },
      { type: "emoji", emoji: "✨", x: 47, y: 41, size: 24, anim: "float", delay: 0.276, dur: 1.41 },
      { type: "emoji", emoji: "🎊", x: 59, y: 41, size: 23, anim: "rise", delay: 0.951, dur: 1.42 },
      { type: "emoji", emoji: "✨", x: 21, y: 84, size: 12, anim: "blink", delay: 1.514, dur: 1.16 },
      { type: "emoji", emoji: "✨", x: 72, y: 38, size: 18, anim: "blink", delay: 0.77, dur: 1.76 }
    ],
  },
  crab_fantasy_14_347: {
    v: 1,
    loop: 2.21,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#e1bee7", opacity: 0.59, anim: "bounce", dur: 1.3, w: 98.72, h: 25.84 },
      { type: "emoji", emoji: "🦀", x: 41, y: 46, size: 38, anim: "bounce", dur: 1.43 },
      { type: "emoji", emoji: "🎩", x: 48, y: 13, size: 32, anim: "bounce", delay: 0.574, dur: 1.86 },
      { type: "emoji", emoji: "💌", x: 70, y: 41, size: 27, anim: "pop", delay: 0.476, dur: 1.55 },
      { type: "emoji", emoji: "🌸", x: 10, y: 36, size: 22, anim: "pop", delay: 0.205, dur: 1.29 },
      { type: "emoji", emoji: "🍂", x: 57, y: 42, size: 17, anim: "float", delay: 1.095, dur: 1.97 },
      { type: "emoji", emoji: "🌟", x: 39, y: 70, size: 15, anim: "blink", delay: 0.713, dur: 1.6 },
      { type: "emoji", emoji: "💫", x: 75, y: 68, size: 17, anim: "blink", delay: 0.562, dur: 1.29 }
    ],
  },
  crab_office_14_348: {
    v: 1,
    loop: 2.14,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 63, y: 44, size: 41, anim: "wiggle", dur: 1.39 },
      { type: "emoji", emoji: "👷", x: 50, y: 14, size: 31, anim: "bounce", delay: 0.599, dur: 1.78 },
      { type: "emoji", emoji: "🎉", x: 66, y: 76, size: 15, anim: "pop", delay: 0.118, dur: 1.42 },
      { type: "emoji", emoji: "🔥", x: 87, y: 81, size: 12, anim: "float", delay: 1.386, dur: 1.88 },
      { type: "emoji", emoji: "💖", x: 77, y: 48, size: 14, anim: "blink", delay: 1.554, dur: 1.84 },
      { type: "emoji", emoji: "💫", x: 17, y: 37, size: 14, anim: "blink", delay: 0.954, dur: 1.34 }
    ],
  },
  crab_fitness_14_349: {
    v: 1,
    loop: 4.11,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#7986cb", opacity: 0.56, anim: "breathe", dur: 3.63, w: 94.21, h: 22.96 },
      { type: "emoji", emoji: "🦀", x: 51, y: 54, size: 40, anim: "breathe", dur: 3.65 },
      { type: "emoji", emoji: "🧣", x: 51, y: 57, size: 24, anim: "bounce", delay: 0.503, dur: 1.87 },
      { type: "emoji", emoji: "🍩", x: 69, y: 42, size: 24, anim: "blink", delay: 0.707, dur: 1.56 },
      { type: "emoji", emoji: "🌿", x: 46, y: 43, size: 17, anim: "rise", delay: 0.81, dur: 2.16 },
      { type: "emoji", emoji: "✨", x: 62, y: 17, size: 12, anim: "wiggle", delay: 0.464, dur: 1.41 },
      { type: "emoji", emoji: "🌿", x: 14, y: 23, size: 12, anim: "wiggle", delay: 1.381, dur: 1.76 },
      { type: "emoji", emoji: "✨", x: 55, y: 51, size: 15, anim: "blink", delay: 1.814, dur: 1.09 },
      { type: "emoji", emoji: "⭐", x: 22, y: 21, size: 11, anim: "blink", delay: 1.396, dur: 1.98 }
    ],
  },
  crab_travel_14_350: {
    v: 1,
    loop: 2.74,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff9c4", opacity: 0.42, anim: "pulse", dur: 1.86, w: 102.59, h: 23.01 },
      { type: "emoji", emoji: "🦀", x: 68, y: 48, size: 43, anim: "pulse", dur: 1.89 },
      { type: "emoji", emoji: "🍭", x: 73, y: 43, size: 25, anim: "pop", delay: 0.571, dur: 1.59 },
      { type: "emoji", emoji: "🎊", x: 60, y: 36, size: 21, anim: "blink", delay: 1.078, dur: 1.64 },
      { type: "emoji", emoji: "💫", x: 23, y: 74, size: 23, anim: "float", delay: 0.344, dur: 1.35 },
      { type: "emoji", emoji: "❤️", x: 51, y: 52, size: 15, anim: "wiggle", delay: 1.043, dur: 1.43 },
      { type: "emoji", emoji: "🌟", x: 67, y: 61, size: 12, anim: "blink", delay: 0.759, dur: 1.02 },
      { type: "emoji", emoji: "✨", x: 50, y: 42, size: 12, anim: "blink", delay: 0.953, dur: 1.07 }
    ],
  },
  crab_art_14_351: {
    v: 1,
    loop: 2.62,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#0277bd", opacity: 0.45, anim: "pulse", dur: 2.19, r: 43.72 },
      { type: "emoji", emoji: "🦀", x: 51, y: 52, size: 33, anim: "pulse", dur: 2.13 },
      { type: "emoji", emoji: "🧢", x: 50, y: 17, size: 30, anim: "bounce", delay: 0.31, dur: 1.59 },
      { type: "emoji", emoji: "💖", x: 31, y: 18, size: 21, anim: "wiggle", delay: 0.463, dur: 1.59 },
      { type: "emoji", emoji: "🌸", x: 70, y: 20, size: 25, anim: "blink", delay: 0.489, dur: 1.26 },
      { type: "emoji", emoji: "❄️", x: 43, y: 80, size: 25, anim: "float", delay: 0.68, dur: 1.66 },
      { type: "emoji", emoji: "✨", x: 59, y: 21, size: 19, anim: "pop", delay: 1.32, dur: 1.77 },
      { type: "emoji", emoji: "💖", x: 32, y: 80, size: 11, anim: "blink", delay: 1.649, dur: 1.53 },
      { type: "emoji", emoji: "🌟", x: 66, y: 75, size: 14, anim: "blink", delay: 1.281, dur: 1.07 }
    ],
  },
  crab_science_14_352: {
    v: 1,
    loop: 2.76,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffe0b2", opacity: 0.55, anim: "float", dur: 2.71, w: 100.92, h: 26.1 },
      { type: "emoji", emoji: "🦀", x: 64, y: 53, size: 37, anim: "float", dur: 2.71 },
      { type: "emoji", emoji: "👒", x: 48, y: 16, size: 35, anim: "bounce", delay: 0.451, dur: 1.61 },
      { type: "emoji", emoji: "🎁", x: 74, y: 41, size: 27, anim: "float", delay: 0.599, dur: 1.72 },
      { type: "emoji", emoji: "💫", x: 78, y: 10, size: 19, anim: "blink", delay: 0.924, dur: 2.26 },
      { type: "emoji", emoji: "🌟", x: 49, y: 70, size: 18, anim: "float", delay: 0.132, dur: 1.62 },
      { type: "emoji", emoji: "❤️", x: 78, y: 89, size: 25, anim: "float", delay: 0.445, dur: 1.64 },
      { type: "emoji", emoji: "✨", x: 17, y: 48, size: 22, anim: "blink", delay: 1.092, dur: 1.87 },
      { type: "emoji", emoji: "🌟", x: 24, y: 19, size: 12, anim: "blink", delay: 1.734, dur: 1.81 },
      { type: "emoji", emoji: "💫", x: 41, y: 71, size: 15, anim: "blink", delay: 0.913, dur: 1.92 }
    ],
  },
  crab_pets_14_353: {
    v: 1,
    loop: 3.5,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#43a047", opacity: 0.32, anim: "settle", dur: 2.9, r: 47.62 },
      { type: "emoji", emoji: "🦀", x: 44, y: 46, size: 35, anim: "settle", dur: 2.98 },
      { type: "emoji", emoji: "🍄", x: 68, y: 47, size: 27, anim: "rise", delay: 0.709, dur: 1.61 },
      { type: "emoji", emoji: "🎉", x: 82, y: 70, size: 20, anim: "pop", delay: 0.372, dur: 1.76 },
      { type: "emoji", emoji: "💖", x: 24, y: 53, size: 13, anim: "pop", delay: 1.436, dur: 1.41 },
      { type: "emoji", emoji: "🎉", x: 63, y: 50, size: 19, anim: "float", delay: 0.757, dur: 1.27 },
      { type: "emoji", emoji: "💖", x: 27, y: 36, size: 16, anim: "pop", delay: 0.339, dur: 1.47 },
      { type: "emoji", emoji: "🎉", x: 18, y: 63, size: 12, anim: "blink", delay: 1.337, dur: 1.74 },
      { type: "emoji", emoji: "💖", x: 56, y: 84, size: 19, anim: "blink", delay: 0.645, dur: 1.42 },
      { type: "emoji", emoji: "✨", x: 49, y: 71, size: 10, anim: "blink", delay: 1.225, dur: 1.97 }
    ],
  },
  crab_magic_14_354: {
    v: 1,
    loop: 1.91,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#7e57c2", opacity: 0.35, anim: "bounce", dur: 1.5, r: 47.72 },
      { type: "emoji", emoji: "🦀", x: 36, y: 54, size: 35, anim: "bounce", dur: 1.42 },
      { type: "emoji", emoji: "🍀", x: 73, y: 43, size: 22, anim: "rise", delay: 0.502, dur: 1.98 },
      { type: "emoji", emoji: "🍃", x: 71, y: 88, size: 23, anim: "float", delay: 0.749, dur: 1.45 },
      { type: "emoji", emoji: "🎊", x: 32, y: 20, size: 19, anim: "wiggle", delay: 1.451, dur: 1.86 },
      { type: "emoji", emoji: "🌟", x: 37, y: 39, size: 11, anim: "blink", delay: 1.817, dur: 1.88 },
      { type: "emoji", emoji: "💖", x: 70, y: 43, size: 17, anim: "blink", delay: 1.889, dur: 1.77 }
    ],
  },
  crab_retro_14_355: {
    v: 1,
    loop: 2.79,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ff8a65", opacity: 0.68, anim: "twinkle", dur: 2.55, w: 104.03, h: 26.38 },
      { type: "emoji", emoji: "🦀", x: 66, y: 53, size: 37, anim: "twinkle", dur: 2.42 },
      { type: "emoji", emoji: "🎉", x: 85, y: 71, size: 25, anim: "pop", delay: 0.714, dur: 1.21 },
      { type: "emoji", emoji: "💫", x: 84, y: 12, size: 22, anim: "blink", delay: 0.427, dur: 1.51 },
      { type: "emoji", emoji: "🌸", x: 59, y: 19, size: 13, anim: "wiggle", delay: 1.411, dur: 1.77 },
      { type: "emoji", emoji: "✨", x: 41, y: 81, size: 23, anim: "pop", delay: 0.623, dur: 1.45 },
      { type: "emoji", emoji: "❤️", x: 12, y: 77, size: 13, anim: "wiggle", delay: 0.847, dur: 1.95 },
      { type: "emoji", emoji: "🌟", x: 24, y: 71, size: 12, anim: "blink", delay: 1.666, dur: 1.18 },
      { type: "emoji", emoji: "💫", x: 77, y: 51, size: 10, anim: "blink", delay: 1.851, dur: 1.87 }
    ],
  },
  crab_cyber_14_356: {
    v: 1,
    loop: 2.96,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#f06292", opacity: 0.47, anim: "float", dur: 2.79, r: 45.53 },
      { type: "emoji", emoji: "🦀", x: 35, y: 47, size: 38, anim: "float", dur: 2.95 },
      { type: "emoji", emoji: "🧙", x: 52, y: 12, size: 35, anim: "bounce", delay: 0.304, dur: 1.75 },
      { type: "emoji", emoji: "🌻", x: 73, y: 42, size: 26, anim: "float", delay: 0.727, dur: 1.56 },
      { type: "emoji", emoji: "🍂", x: 30, y: 18, size: 15, anim: "pop", delay: 0.81, dur: 2.34 },
      { type: "emoji", emoji: "🌟", x: 51, y: 23, size: 16, anim: "float", delay: 0.965, dur: 2.24 },
      { type: "emoji", emoji: "🌊", x: 29, y: 16, size: 16, anim: "pop", delay: 0.8, dur: 1.83 },
      { type: "emoji", emoji: "⭐", x: 24, y: 63, size: 11, anim: "blink", delay: 0.527, dur: 1.62 },
      { type: "emoji", emoji: "✨", x: 52, y: 56, size: 10, anim: "blink", delay: 1.393, dur: 1.64 }
    ],
  },
  crab_nature_14_357: {
    v: 1,
    loop: 2.23,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ba68c8", opacity: 0.35, anim: "pop", dur: 1.76, r: 40.51 },
      { type: "emoji", emoji: "🦀", x: 51, y: 54, size: 32, anim: "pop", dur: 1.67 },
      { type: "emoji", emoji: "🌊", x: 14, y: 53, size: 25, anim: "rise", delay: 0.511, dur: 1.6 },
      { type: "emoji", emoji: "🎈", x: 29, y: 76, size: 17, anim: "rise", delay: 1.447, dur: 2.06 },
      { type: "emoji", emoji: "🍂", x: 59, y: 49, size: 12, anim: "rise", delay: 1.284, dur: 1.8 },
      { type: "emoji", emoji: "💫", x: 23, y: 23, size: 15, anim: "blink", delay: 1.092, dur: 1.67 },
      { type: "emoji", emoji: "✨", x: 61, y: 30, size: 15, anim: "blink", delay: 1.834, dur: 1 }
    ],
  },
  crab_underwater_14_358: {
    v: 1,
    loop: 2.91,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fff9c4", opacity: 0.49, anim: "heartbeat", dur: 2.45, r: 40.31 },
      { type: "emoji", emoji: "🦀", x: 63, y: 54, size: 36, anim: "heartbeat", dur: 2.38 },
      { type: "emoji", emoji: "💖", x: 55, y: 86, size: 12, anim: "float", delay: 1.167, dur: 1.59 },
      { type: "emoji", emoji: "❄️", x: 36, y: 51, size: 19, anim: "float", delay: 0.618, dur: 2.37 },
      { type: "emoji", emoji: "🌸", x: 41, y: 84, size: 16, anim: "rise", delay: 1.107, dur: 2.36 },
      { type: "emoji", emoji: "⭐", x: 67, y: 18, size: 12, anim: "blink", delay: 0.779, dur: 1.69 },
      { type: "emoji", emoji: "⭐", x: 25, y: 15, size: 15, anim: "blink", delay: 0.873, dur: 1.06 }
    ],
  },
  crab_sky_14_359: {
    v: 1,
    loop: 3.96,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 39, y: 52, size: 37, anim: "float", dur: 3.52 },
      { type: "emoji", emoji: "🧢", x: 49, y: 16, size: 30, anim: "bounce", delay: 0.301, dur: 1.56 },
      { type: "emoji", emoji: "🍦", x: 71, y: 45, size: 26, anim: "rise", delay: 0.775, dur: 1.53 },
      { type: "emoji", emoji: "🎈", x: 45, y: 49, size: 16, anim: "rise", delay: 0.3, dur: 2.39 },
      { type: "emoji", emoji: "✨", x: 80, y: 28, size: 17, anim: "wiggle", delay: 0.619, dur: 1.77 },
      { type: "emoji", emoji: "🌟", x: 58, y: 69, size: 12, anim: "blink", delay: 1.696, dur: 1.63 },
      { type: "emoji", emoji: "💫", x: 21, y: 26, size: 15, anim: "blink", delay: 1.032, dur: 1.35 }
    ],
  },
  crab_party_15_360: {
    v: 1,
    loop: 3.03,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#e1f5fe", opacity: 0.51, anim: "float", dur: 2.99, w: 93.03, h: 19.14 },
      { type: "emoji", emoji: "🦀", x: 59, y: 53, size: 41, anim: "float", dur: 3.04 },
      { type: "emoji", emoji: "🍳", x: 51, y: 14, size: 28, anim: "bounce", delay: 0.434, dur: 1.82 },
      { type: "emoji", emoji: "🎈", x: 72, y: 26, size: 29, anim: "blink", delay: 0.877, dur: 1.55 },
      { type: "emoji", emoji: "🍂", x: 19, y: 47, size: 12, anim: "pop", delay: 1.317, dur: 1.25 },
      { type: "emoji", emoji: "🎉", x: 31, y: 89, size: 24, anim: "blink", delay: 0.918, dur: 1.77 },
      { type: "emoji", emoji: "🌿", x: 64, y: 25, size: 23, anim: "wiggle", delay: 0.727, dur: 1.75 },
      { type: "emoji", emoji: "❤️", x: 12, y: 76, size: 17, anim: "pop", delay: 1.394, dur: 2.2 },
      { type: "emoji", emoji: "❄️", x: 33, y: 15, size: 13, anim: "rise", delay: 0.957, dur: 2.3 },
      { type: "emoji", emoji: "✨", x: 71, y: 15, size: 13, anim: "blink", delay: 1.188, dur: 1.15 },
      { type: "emoji", emoji: "✨", x: 70, y: 64, size: 16, anim: "blink", delay: 0.584, dur: 1.33 }
    ],
  },
  crab_beach_15_361: {
    v: 1,
    loop: 2.59,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#b3e5fc", opacity: 0.49, anim: "wave", dur: 1.9, r: 44.6 },
      { type: "emoji", emoji: "🦀", x: 48, y: 48, size: 38, anim: "wave", dur: 1.81 },
      { type: "emoji", emoji: "👷", x: 49, y: 17, size: 29, anim: "bounce", delay: 0.674, dur: 1.55 },
      { type: "emoji", emoji: "❄️", x: 57, y: 35, size: 24, anim: "pop", delay: 1.287, dur: 2.06 },
      { type: "emoji", emoji: "💖", x: 27, y: 45, size: 16, anim: "pop", delay: 0.569, dur: 2.34 },
      { type: "emoji", emoji: "⭐", x: 65, y: 49, size: 11, anim: "blink", delay: 1.766, dur: 1.54 },
      { type: "emoji", emoji: "💖", x: 42, y: 55, size: 17, anim: "blink", delay: 1.405, dur: 1.28 }
    ],
  },
  crab_winter_15_362: {
    v: 1,
    loop: 2.14,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f57c00", opacity: 0.56, anim: "bounce", dur: 1.52, r: 43.21 },
      { type: "emoji", emoji: "🦀", x: 63, y: 49, size: 36, anim: "bounce", dur: 1.49 },
      { type: "emoji", emoji: "👑", x: 48, y: 16, size: 29, anim: "bounce", delay: 0.425, dur: 1.96 },
      { type: "emoji", emoji: "🍪", x: 69, y: 43, size: 22, anim: "float", delay: 0.86, dur: 1.84 },
      { type: "emoji", emoji: "🎊", x: 47, y: 52, size: 19, anim: "rise", delay: 0.319, dur: 1.44 },
      { type: "emoji", emoji: "🔥", x: 24, y: 81, size: 14, anim: "blink", delay: 1.153, dur: 2.11 },
      { type: "emoji", emoji: "✨", x: 17, y: 52, size: 18, anim: "blink", delay: 0.597, dur: 1.18 },
      { type: "emoji", emoji: "💫", x: 51, y: 64, size: 12, anim: "blink", delay: 0.664, dur: 1.97 }
    ],
  },
  crab_spring_15_363: {
    v: 1,
    loop: 2.32,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#4caf50", opacity: 0.37, anim: "wiggle", dur: 1.45, r: 47.19 },
      { type: "emoji", emoji: "🦀", x: 42, y: 46, size: 38, anim: "wiggle", dur: 1.52 },
      { type: "emoji", emoji: "🧢", x: 51, y: 14, size: 29, anim: "bounce", delay: 0.33, dur: 1.56 },
      { type: "emoji", emoji: "🍩", x: 69, y: 41, size: 26, anim: "float", delay: 0.981, dur: 1.42 },
      { type: "emoji", emoji: "🌊", x: 76, y: 36, size: 25, anim: "blink", delay: 1.028, dur: 2.31 },
      { type: "emoji", emoji: "🎉", x: 54, y: 21, size: 22, anim: "rise", delay: 0.523, dur: 2.28 },
      { type: "emoji", emoji: "✨", x: 72, y: 50, size: 12, anim: "blink", delay: 1.77, dur: 1.91 },
      { type: "emoji", emoji: "⭐", x: 37, y: 20, size: 14, anim: "blink", delay: 1.579, dur: 1.16 }
    ],
  },
  crab_halloween_15_364: {
    v: 1,
    loop: 4.17,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 35, y: 56, size: 34, anim: "breathe", dur: 3.44 },
      { type: "emoji", emoji: "🧢", x: 49, y: 15, size: 31, anim: "bounce", delay: 0.496, dur: 1.89 },
      { type: "emoji", emoji: "🍬", x: 70, y: 45, size: 20, anim: "rise", delay: 0.819, dur: 1.5 },
      { type: "emoji", emoji: "❤️", x: 68, y: 18, size: 16, anim: "pop", delay: 1.239, dur: 1.52 },
      { type: "emoji", emoji: "🎉", x: 51, y: 59, size: 19, anim: "rise", delay: 1.396, dur: 1.88 },
      { type: "emoji", emoji: "❤️", x: 21, y: 74, size: 17, anim: "float", delay: 1.023, dur: 1.65 },
      { type: "emoji", emoji: "⭐", x: 15, y: 65, size: 12, anim: "blink", delay: 1.016, dur: 1.3 },
      { type: "emoji", emoji: "💖", x: 53, y: 33, size: 17, anim: "blink", delay: 0.815, dur: 1.44 }
    ],
  },
  crab_christmas_15_365: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ff7043", opacity: 0.49, anim: "pulse", dur: 2.18, w: 101.19, h: 21.4 },
      { type: "emoji", emoji: "🦀", x: 33, y: 47, size: 36, anim: "pulse", dur: 1.93 },
      { type: "emoji", emoji: "⭐", x: 68, y: 31, size: 25, anim: "pop", delay: 0.84, dur: 1.54 },
      { type: "emoji", emoji: "🌊", x: 67, y: 50, size: 21, anim: "pop", delay: 0.738, dur: 1.37 },
      { type: "emoji", emoji: "✨", x: 33, y: 71, size: 11, anim: "blink", delay: 1.595, dur: 1.13 },
      { type: "emoji", emoji: "💖", x: 62, y: 48, size: 19, anim: "blink", delay: 1.581, dur: 1.23 }
    ],
  },
  crab_coding_15_366: {
    v: 1,
    loop: 2.28,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ec407a", opacity: 0.44, anim: "pulse", dur: 2.03, r: 48 },
      { type: "emoji", emoji: "🦀", x: 42, y: 44, size: 44, anim: "pulse", dur: 2.33 },
      { type: "emoji", emoji: "👮", x: 49, y: 17, size: 29, anim: "bounce", delay: 0.476, dur: 1.57 },
      { type: "emoji", emoji: "🎊", x: 67, y: 57, size: 13, anim: "pop", delay: 0.852, dur: 2.15 },
      { type: "emoji", emoji: "🌿", x: 36, y: 20, size: 19, anim: "float", delay: 0.447, dur: 1.27 },
      { type: "emoji", emoji: "🍃", x: 35, y: 43, size: 22, anim: "float", delay: 0.566, dur: 2.04 },
      { type: "emoji", emoji: "⭐", x: 75, y: 37, size: 16, anim: "blink", delay: 0.999, dur: 1.82 },
      { type: "emoji", emoji: "⭐", x: 71, y: 47, size: 17, anim: "blink", delay: 1.534, dur: 1.66 }
    ],
  },
  crab_music_15_367: {
    v: 1,
    loop: 3.08,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ab47bc", opacity: 0.61, anim: "float", dur: 2.57, w: 108.42, h: 18.24 },
      { type: "emoji", emoji: "🦀", x: 54, y: 56, size: 34, anim: "float", dur: 2.73 },
      { type: "emoji", emoji: "🎓", x: 52, y: 14, size: 27, anim: "bounce", delay: 0.38, dur: 1.79 },
      { type: "emoji", emoji: "🌸", x: 70, y: 42, size: 24, anim: "float", delay: 0.886, dur: 1.99 },
      { type: "emoji", emoji: "🍃", x: 67, y: 37, size: 12, anim: "wiggle", delay: 0.618, dur: 1.75 },
      { type: "emoji", emoji: "🔥", x: 65, y: 43, size: 22, anim: "wiggle", delay: 0.714, dur: 1.27 },
      { type: "emoji", emoji: "🌿", x: 41, y: 74, size: 13, anim: "rise", delay: 0.396, dur: 2.19 },
      { type: "emoji", emoji: "🌊", x: 63, y: 57, size: 21, anim: "rise", delay: 1.117, dur: 1.71 },
      { type: "emoji", emoji: "🌟", x: 58, y: 40, size: 18, anim: "blink", delay: 1.58, dur: 1.85 },
      { type: "emoji", emoji: "⭐", x: 58, y: 61, size: 15, anim: "blink", delay: 1.75, dur: 1.07 }
    ],
  },
  crab_sports_15_368: {
    v: 1,
    loop: 3.6,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff9c4", opacity: 0.54, anim: "settle", dur: 2.97, w: 108.11, h: 20.29 },
      { type: "emoji", emoji: "🦀", x: 58, y: 46, size: 38, anim: "settle", dur: 3.05 },
      { type: "emoji", emoji: "🌿", x: 35, y: 13, size: 20, anim: "float", delay: 0.149, dur: 1.2 },
      { type: "emoji", emoji: "🎉", x: 14, y: 49, size: 16, anim: "pop", delay: 1.159, dur: 1.69 },
      { type: "emoji", emoji: "💖", x: 36, y: 29, size: 18, anim: "rise", delay: 1.155, dur: 1.36 },
      { type: "emoji", emoji: "❤️", x: 40, y: 45, size: 25, anim: "blink", delay: 1.139, dur: 1.56 },
      { type: "emoji", emoji: "💖", x: 24, y: 57, size: 18, anim: "float", delay: 0.572, dur: 1.73 },
      { type: "emoji", emoji: "⭐", x: 31, y: 62, size: 15, anim: "blink", delay: 0.511, dur: 1.06 },
      { type: "emoji", emoji: "✨", x: 27, y: 34, size: 15, anim: "blink", delay: 0.686, dur: 1.87 }
    ],
  },
  crab_food_15_369: {
    v: 1,
    loop: 2.16,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 68, y: 49, size: 44, anim: "bounce", dur: 1.38 },
      { type: "emoji", emoji: "👒", x: 51, y: 14, size: 32, anim: "bounce", delay: 0.56, dur: 1.88 },
      { type: "emoji", emoji: "🍫", x: 70, y: 41, size: 27, anim: "float", delay: 0.816, dur: 1.51 },
      { type: "emoji", emoji: "🍃", x: 65, y: 79, size: 13, anim: "pop", delay: 0.423, dur: 2.04 },
      { type: "emoji", emoji: "🌟", x: 26, y: 49, size: 13, anim: "blink", delay: 1.493, dur: 1.29 },
      { type: "emoji", emoji: "✨", x: 22, y: 53, size: 18, anim: "blink", delay: 1.424, dur: 1.44 }
    ],
  },
  crab_space_15_370: {
    v: 1,
    loop: 2.93,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 31, y: 55, size: 42, anim: "twinkle", dur: 2.58 },
      { type: "emoji", emoji: "👷", x: 50, y: 15, size: 30, anim: "bounce", delay: 0.436, dur: 1.58 },
      { type: "emoji", emoji: "🌊", x: 69, y: 63, size: 16, anim: "wiggle", delay: 0.229, dur: 1.97 },
      { type: "emoji", emoji: "❄️", x: 14, y: 57, size: 16, anim: "pop", delay: 0.868, dur: 1.7 },
      { type: "emoji", emoji: "💫", x: 33, y: 21, size: 21, anim: "rise", delay: 0.229, dur: 1.95 },
      { type: "emoji", emoji: "🌟", x: 71, y: 36, size: 12, anim: "blink", delay: 1.993, dur: 1.92 },
      { type: "emoji", emoji: "🌟", x: 31, y: 33, size: 15, anim: "blink", delay: 0.617, dur: 1.97 }
    ],
  },
  crab_fantasy_15_371: {
    v: 1,
    loop: 3.26,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#81d4fa", opacity: 0.42, anim: "float", dur: 2.82, r: 47.07 },
      { type: "emoji", emoji: "🦀", x: 42, y: 47, size: 36, anim: "float", dur: 3.01 },
      { type: "emoji", emoji: "🕶️", x: 48, y: 28, size: 28, anim: "bounce", delay: 0.566, dur: 1.88 },
      { type: "emoji", emoji: "🍩", x: 69, y: 44, size: 26, anim: "rise", delay: 0.605, dur: 1.49 },
      { type: "emoji", emoji: "🔥", x: 87, y: 32, size: 18, anim: "pop", delay: 1.089, dur: 2.26 },
      { type: "emoji", emoji: "❄️", x: 74, y: 53, size: 23, anim: "rise", delay: 0.369, dur: 1.54 },
      { type: "emoji", emoji: "❤️", x: 72, y: 16, size: 16, anim: "rise", delay: 1.406, dur: 1.74 },
      { type: "emoji", emoji: "💫", x: 62, y: 58, size: 12, anim: "blink", delay: 0.751, dur: 1.09 },
      { type: "emoji", emoji: "⭐", x: 74, y: 31, size: 15, anim: "blink", delay: 1.97, dur: 1.91 }
    ],
  },
  crab_office_15_372: {
    v: 1,
    loop: 2.22,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 43, y: 47, size: 35, anim: "pop", dur: 1.64 },
      { type: "emoji", emoji: "👒", x: 51, y: 14, size: 32, anim: "bounce", delay: 0.442, dur: 1.66 },
      { type: "emoji", emoji: "💎", x: 71, y: 36, size: 25, anim: "rise", delay: 0.812, dur: 1.91 },
      { type: "emoji", emoji: "🍂", x: 85, y: 57, size: 21, anim: "rise", delay: 0.792, dur: 1.88 },
      { type: "emoji", emoji: "🌟", x: 34, y: 62, size: 24, anim: "pop", delay: 1.145, dur: 1.74 },
      { type: "emoji", emoji: "🔥", x: 10, y: 61, size: 24, anim: "blink", delay: 1.086, dur: 2.02 },
      { type: "emoji", emoji: "⭐", x: 73, y: 45, size: 14, anim: "blink", delay: 1.771, dur: 1.19 },
      { type: "emoji", emoji: "✨", x: 49, y: 59, size: 15, anim: "blink", delay: 1.54, dur: 1.81 }
    ],
  },
  crab_fitness_15_373: {
    v: 1,
    loop: 3.2,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#66bb6a", opacity: 0.69, anim: "heartbeat", dur: 2.48, w: 105.23, h: 27.47 },
      { type: "emoji", emoji: "🦀", x: 48, y: 54, size: 40, anim: "heartbeat", dur: 2.48 },
      { type: "emoji", emoji: "🎩", x: 52, y: 10, size: 33, anim: "bounce", delay: 0.515, dur: 1.68 },
      { type: "emoji", emoji: "🌹", x: 68, y: 42, size: 27, anim: "rise", delay: 0.481, dur: 1.73 },
      { type: "emoji", emoji: "❤️", x: 26, y: 40, size: 20, anim: "blink", delay: 0.688, dur: 2.15 },
      { type: "emoji", emoji: "❄️", x: 23, y: 50, size: 25, anim: "blink", delay: 1.026, dur: 1.41 },
      { type: "emoji", emoji: "💖", x: 39, y: 38, size: 12, anim: "blink", delay: 1.833, dur: 1.27 },
      { type: "emoji", emoji: "💖", x: 71, y: 70, size: 18, anim: "blink", delay: 1.191, dur: 1.23 }
    ],
  },
  crab_travel_15_374: {
    v: 1,
    loop: 3.9,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ede7f6", opacity: 0.53, anim: "float", dur: 3.44, r: 41.95 },
      { type: "emoji", emoji: "🦀", x: 35, y: 45, size: 36, anim: "float", dur: 3.65 },
      { type: "emoji", emoji: "👑", x: 51, y: 15, size: 31, anim: "bounce", delay: 0.609, dur: 1.61 },
      { type: "emoji", emoji: "🍪", x: 70, y: 44, size: 25, anim: "blink", delay: 0.704, dur: 1.5 },
      { type: "emoji", emoji: "❄️", x: 40, y: 73, size: 21, anim: "pop", delay: 1.162, dur: 1.41 },
      { type: "emoji", emoji: "✨", x: 31, y: 27, size: 22, anim: "float", delay: 0.101, dur: 2.17 },
      { type: "emoji", emoji: "🌿", x: 14, y: 18, size: 15, anim: "float", delay: 0.466, dur: 1.85 },
      { type: "emoji", emoji: "🎉", x: 23, y: 40, size: 19, anim: "blink", delay: 0.756, dur: 1.87 },
      { type: "emoji", emoji: "⭐", x: 61, y: 84, size: 16, anim: "blink", delay: 1.038, dur: 1.29 },
      { type: "emoji", emoji: "💖", x: 75, y: 34, size: 18, anim: "blink", delay: 1.042, dur: 1.1 },
      { type: "emoji", emoji: "💖", x: 37, y: 39, size: 16, anim: "blink", delay: 1.089, dur: 1.29 }
    ],
  },
  crab_art_15_375: {
    v: 1,
    loop: 3.21,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 34, y: 51, size: 34, anim: "float", dur: 2.94 },
      { type: "emoji", emoji: "🍪", x: 70, y: 43, size: 23, anim: "rise", delay: 0.66, dur: 1.98 },
      { type: "emoji", emoji: "🌸", x: 50, y: 15, size: 13, anim: "rise", delay: 0.617, dur: 2.32 },
      { type: "emoji", emoji: "❤️", x: 29, y: 56, size: 16, anim: "rise", delay: 0.692, dur: 1.31 },
      { type: "emoji", emoji: "🌟", x: 58, y: 25, size: 10, anim: "blink", delay: 0.525, dur: 1.03 },
      { type: "emoji", emoji: "🌟", x: 17, y: 79, size: 15, anim: "blink", delay: 0.67, dur: 1.35 }
    ],
  },
  crab_science_15_376: {
    v: 1,
    loop: 2.71,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ec407a", opacity: 0.43, anim: "wave", dur: 2, r: 43.02 },
      { type: "emoji", emoji: "🦀", x: 56, y: 53, size: 33, anim: "wave", dur: 1.91 },
      { type: "emoji", emoji: "🎩", x: 51, y: 11, size: 32, anim: "bounce", delay: 0.632, dur: 1.75 },
      { type: "emoji", emoji: "🎀", x: 67, y: 27, size: 16, anim: "float", delay: 0.966, dur: 1.92 },
      { type: "emoji", emoji: "🌟", x: 21, y: 80, size: 23, anim: "float", delay: 0.088, dur: 2.23 },
      { type: "emoji", emoji: "🎈", x: 11, y: 83, size: 25, anim: "float", delay: 0.873, dur: 1.33 },
      { type: "emoji", emoji: "🌿", x: 59, y: 61, size: 15, anim: "wiggle", delay: 1.159, dur: 2.16 },
      { type: "emoji", emoji: "✨", x: 80, y: 83, size: 16, anim: "blink", delay: 1.679, dur: 1.77 },
      { type: "emoji", emoji: "✨", x: 56, y: 32, size: 13, anim: "blink", delay: 0.641, dur: 1.82 }
    ],
  },
  crab_pets_15_377: {
    v: 1,
    loop: 1.79,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 35, y: 54, size: 32, anim: "bounce", dur: 1.41 },
      { type: "emoji", emoji: "🎩", x: 49, y: 13, size: 30, anim: "bounce", delay: 0.335, dur: 1.61 },
      { type: "emoji", emoji: "🍫", x: 70, y: 41, size: 24, anim: "rise", delay: 0.437, dur: 1.67 },
      { type: "emoji", emoji: "🔥", x: 41, y: 12, size: 24, anim: "wiggle", delay: 0.176, dur: 1.41 },
      { type: "emoji", emoji: "💫", x: 24, y: 68, size: 11, anim: "blink", delay: 1.594, dur: 1.56 },
      { type: "emoji", emoji: "✨", x: 27, y: 42, size: 18, anim: "blink", delay: 0.7, dur: 1.28 }
    ],
  },
  crab_magic_15_378: {
    v: 1,
    loop: 1.96,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff59d", opacity: 0.51, anim: "wiggle", dur: 1.16, w: 100.85, h: 21.51 },
      { type: "emoji", emoji: "🦀", x: 65, y: 45, size: 36, anim: "wiggle", dur: 1.3 },
      { type: "emoji", emoji: "👮", x: 50, y: 16, size: 29, anim: "bounce", delay: 0.384, dur: 1.61 },
      { type: "emoji", emoji: "🔥", x: 17, y: 43, size: 18, anim: "wiggle", delay: 0.122, dur: 1.61 },
      { type: "emoji", emoji: "🌸", x: 12, y: 22, size: 15, anim: "blink", delay: 1.093, dur: 1.59 },
      { type: "emoji", emoji: "🌊", x: 27, y: 89, size: 25, anim: "blink", delay: 0.212, dur: 2.08 },
      { type: "emoji", emoji: "🌿", x: 48, y: 20, size: 22, anim: "wiggle", delay: 1.388, dur: 2.39 },
      { type: "emoji", emoji: "🌿", x: 30, y: 70, size: 22, anim: "blink", delay: 0.658, dur: 1.45 },
      { type: "emoji", emoji: "💫", x: 80, y: 70, size: 16, anim: "blink", delay: 1.047, dur: 1.94 },
      { type: "emoji", emoji: "💖", x: 18, y: 22, size: 12, anim: "blink", delay: 1.276, dur: 1.46 }
    ],
  },
  crab_retro_15_379: {
    v: 1,
    loop: 3.8,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#7986cb", opacity: 0.62, anim: "breathe", dur: 3.38, w: 95.83, h: 26.96 },
      { type: "emoji", emoji: "🦀", x: 60, y: 51, size: 35, anim: "breathe", dur: 3.41 },
      { type: "emoji", emoji: "💝", x: 69, y: 39, size: 25, anim: "pop", delay: 0.729, dur: 1.48 },
      { type: "emoji", emoji: "💫", x: 39, y: 29, size: 12, anim: "rise", delay: 1.2, dur: 1.44 },
      { type: "emoji", emoji: "⭐", x: 25, y: 88, size: 12, anim: "blink", delay: 1.335, dur: 1.74 },
      { type: "emoji", emoji: "🌸", x: 45, y: 23, size: 19, anim: "rise", delay: 0.445, dur: 1.48 },
      { type: "emoji", emoji: "🌟", x: 88, y: 31, size: 21, anim: "wiggle", delay: 0.246, dur: 2.19 },
      { type: "emoji", emoji: "❤️", x: 86, y: 24, size: 24, anim: "pop", delay: 0.376, dur: 1.62 },
      { type: "emoji", emoji: "✨", x: 33, y: 25, size: 16, anim: "blink", delay: 1.238, dur: 1.76 },
      { type: "emoji", emoji: "💖", x: 81, y: 28, size: 14, anim: "blink", delay: 1.589, dur: 1.51 }
    ],
  },
  crab_cyber_15_380: {
    v: 1,
    loop: 2.63,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff0f6", opacity: 0.7, anim: "pulse", dur: 2.15, w: 91.25, h: 26.28 },
      { type: "emoji", emoji: "🦀", x: 54, y: 49, size: 40, anim: "pulse", dur: 2.01 },
      { type: "emoji", emoji: "🌹", x: 70, y: 43, size: 27, anim: "rise", delay: 0.775, dur: 1.56 },
      { type: "emoji", emoji: "❄️", x: 50, y: 85, size: 18, anim: "blink", delay: 1.297, dur: 2.07 },
      { type: "emoji", emoji: "❤️", x: 11, y: 23, size: 23, anim: "blink", delay: 1.339, dur: 2.34 },
      { type: "emoji", emoji: "✨", x: 24, y: 55, size: 10, anim: "blink", delay: 0.538, dur: 1.22 },
      { type: "emoji", emoji: "⭐", x: 76, y: 45, size: 12, anim: "blink", delay: 1.922, dur: 1.91 }
    ],
  },
  crab_nature_15_381: {
    v: 1,
    loop: 2.59,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#29b6f6", opacity: 0.38, anim: "pulse", dur: 2.05, w: 101.15, h: 27.5 },
      { type: "emoji", emoji: "🦀", x: 52, y: 47, size: 40, anim: "pulse", dur: 2.21 },
      { type: "emoji", emoji: "👒", x: 49, y: 14, size: 34, anim: "bounce", delay: 0.594, dur: 1.98 },
      { type: "emoji", emoji: "🍃", x: 84, y: 84, size: 13, anim: "blink", delay: 0.156, dur: 2.05 },
      { type: "emoji", emoji: "🍂", x: 76, y: 85, size: 21, anim: "rise", delay: 0.553, dur: 2.27 },
      { type: "emoji", emoji: "🌟", x: 72, y: 17, size: 23, anim: "pop", delay: 0.454, dur: 2.26 },
      { type: "emoji", emoji: "✨", x: 15, y: 42, size: 16, anim: "blink", delay: 1.74, dur: 1.46 },
      { type: "emoji", emoji: "✨", x: 70, y: 81, size: 15, anim: "blink", delay: 1.96, dur: 1.78 }
    ],
  },
  crab_underwater_15_382: {
    v: 1,
    loop: 2.95,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ff9800", opacity: 0.65, anim: "float", dur: 3, r: 49.11 },
      { type: "emoji", emoji: "🦀", x: 50, y: 50, size: 38, anim: "float", dur: 2.76 },
      { type: "emoji", emoji: "🧣", x: 49, y: 57, size: 24, anim: "bounce", delay: 0.435, dur: 1.91 },
      { type: "emoji", emoji: "🌸", x: 72, y: 43, size: 25, anim: "blink", delay: 0.702, dur: 1.85 },
      { type: "emoji", emoji: "🍃", x: 79, y: 60, size: 13, anim: "pop", delay: 0.107, dur: 1.69 },
      { type: "emoji", emoji: "❄️", x: 70, y: 16, size: 12, anim: "blink", delay: 1.086, dur: 1.33 },
      { type: "emoji", emoji: "🍃", x: 89, y: 24, size: 13, anim: "wiggle", delay: 0.455, dur: 2.09 },
      { type: "emoji", emoji: "💖", x: 29, y: 23, size: 15, anim: "blink", delay: 1.705, dur: 1.93 },
      { type: "emoji", emoji: "💫", x: 36, y: 41, size: 17, anim: "blink", delay: 1.061, dur: 1.27 }
    ],
  },
  crab_sky_15_383: {
    v: 1,
    loop: 3.4,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 60, y: 52, size: 41, anim: "settle", dur: 3.06 },
      { type: "emoji", emoji: "👷", x: 50, y: 16, size: 31, anim: "bounce", delay: 0.674, dur: 1.68 },
      { type: "emoji", emoji: "🌟", x: 74, y: 29, size: 27, anim: "float", delay: 0.767, dur: 1.93 },
      { type: "emoji", emoji: "🍃", x: 52, y: 66, size: 12, anim: "pop", delay: 0.002, dur: 2.2 },
      { type: "emoji", emoji: "🎉", x: 75, y: 32, size: 21, anim: "wiggle", delay: 0.532, dur: 2.13 },
      { type: "emoji", emoji: "⭐", x: 59, y: 80, size: 18, anim: "blink", delay: 0.723, dur: 1.96 },
      { type: "emoji", emoji: "✨", x: 16, y: 24, size: 10, anim: "blink", delay: 1.456, dur: 1.74 }
    ],
  },
  crab_party_16_384: {
    v: 1,
    loop: 2.21,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#512da8", opacity: 0.48, anim: "bounce", dur: 1.42, r: 43.16 },
      { type: "emoji", emoji: "🦀", x: 46, y: 46, size: 40, anim: "bounce", dur: 1.33 },
      { type: "emoji", emoji: "🍳", x: 49, y: 15, size: 29, anim: "bounce", delay: 0.633, dur: 1.61 },
      { type: "emoji", emoji: "💌", x: 67, y: 39, size: 27, anim: "blink", delay: 0.514, dur: 1.4 },
      { type: "emoji", emoji: "❤️", x: 13, y: 12, size: 16, anim: "wiggle", delay: 0.01, dur: 1.54 },
      { type: "emoji", emoji: "🎉", x: 36, y: 49, size: 16, anim: "float", delay: 0.922, dur: 2.14 },
      { type: "emoji", emoji: "💖", x: 49, y: 75, size: 10, anim: "blink", delay: 0.72, dur: 1.98 },
      { type: "emoji", emoji: "💫", x: 59, y: 20, size: 16, anim: "blink", delay: 0.657, dur: 1.17 }
    ],
  },
  crab_beach_16_385: {
    v: 1,
    loop: 3.06,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ff7043", opacity: 0.44, anim: "twinkle", dur: 2.54, r: 47.17 },
      { type: "emoji", emoji: "🦀", x: 60, y: 48, size: 34, anim: "twinkle", dur: 2.55 },
      { type: "emoji", emoji: "🎩", x: 52, y: 12, size: 32, anim: "bounce", delay: 0.532, dur: 1.76 },
      { type: "emoji", emoji: "🔥", x: 54, y: 49, size: 15, anim: "float", delay: 0.599, dur: 1.66 },
      { type: "emoji", emoji: "🌟", x: 19, y: 58, size: 15, anim: "float", delay: 0.04, dur: 1.34 },
      { type: "emoji", emoji: "🌸", x: 51, y: 31, size: 22, anim: "float", delay: 1.083, dur: 1.46 },
      { type: "emoji", emoji: "❤️", x: 78, y: 27, size: 12, anim: "blink", delay: 0.752, dur: 2.22 },
      { type: "emoji", emoji: "✨", x: 39, y: 38, size: 10, anim: "blink", delay: 1.178, dur: 1.29 },
      { type: "emoji", emoji: "💫", x: 53, y: 21, size: 16, anim: "blink", delay: 1.117, dur: 1.8 }
    ],
  },
  crab_winter_16_386: {
    v: 1,
    loop: 3.04,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 52, y: 53, size: 35, anim: "float", dur: 2.97 },
      { type: "emoji", emoji: "💫", x: 33, y: 81, size: 20, anim: "float", delay: 1.333, dur: 1.26 },
      { type: "emoji", emoji: "❄️", x: 74, y: 82, size: 19, anim: "rise", delay: 0.204, dur: 1.62 },
      { type: "emoji", emoji: "🍂", x: 20, y: 56, size: 24, anim: "pop", delay: 0.685, dur: 1.76 },
      { type: "emoji", emoji: "🔥", x: 34, y: 51, size: 25, anim: "blink", delay: 0.536, dur: 1.95 },
      { type: "emoji", emoji: "💖", x: 88, y: 15, size: 24, anim: "float", delay: 1.412, dur: 1.54 },
      { type: "emoji", emoji: "💖", x: 30, y: 70, size: 16, anim: "blink", delay: 1.35, dur: 1.07 },
      { type: "emoji", emoji: "💫", x: 33, y: 83, size: 17, anim: "blink", delay: 1.249, dur: 1.52 }
    ],
  },
  crab_spring_16_387: {
    v: 1,
    loop: 2.29,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 43, y: 47, size: 37, anim: "pop", dur: 1.73 },
      { type: "emoji", emoji: "👮", x: 51, y: 17, size: 28, anim: "bounce", delay: 0.302, dur: 1.59 },
      { type: "emoji", emoji: "🎊", x: 57, y: 16, size: 23, anim: "rise", delay: 0.41, dur: 1.39 },
      { type: "emoji", emoji: "🌸", x: 48, y: 36, size: 14, anim: "rise", delay: 0.439, dur: 1.63 },
      { type: "emoji", emoji: "⭐", x: 12, y: 68, size: 12, anim: "wiggle", delay: 1.25, dur: 1.72 },
      { type: "emoji", emoji: "🌟", x: 60, y: 11, size: 24, anim: "blink", delay: 0.175, dur: 1.25 },
      { type: "emoji", emoji: "✨", x: 73, y: 41, size: 13, anim: "blink", delay: 1.673, dur: 1.31 },
      { type: "emoji", emoji: "✨", x: 50, y: 40, size: 16, anim: "blink", delay: 1.17, dur: 1.31 }
    ],
  },
  crab_halloween_16_388: {
    v: 1,
    loop: 3.12,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fffde7", opacity: 0.69, anim: "heartbeat", dur: 2.27, w: 96.53, h: 24.92 },
      { type: "emoji", emoji: "🦀", x: 61, y: 53, size: 39, anim: "heartbeat", dur: 2.35 },
      { type: "emoji", emoji: "🪖", x: 50, y: 17, size: 28, anim: "bounce", delay: 0.647, dur: 1.52 },
      { type: "emoji", emoji: "🍰", x: 69, y: 42, size: 28, anim: "rise", delay: 0.481, dur: 1.53 },
      { type: "emoji", emoji: "🎉", x: 19, y: 34, size: 18, anim: "pop", delay: 0.058, dur: 2.11 },
      { type: "emoji", emoji: "🌸", x: 62, y: 17, size: 13, anim: "float", delay: 1.1, dur: 2.39 },
      { type: "emoji", emoji: "🎈", x: 41, y: 28, size: 24, anim: "wiggle", delay: 0.294, dur: 2.3 },
      { type: "emoji", emoji: "💫", x: 59, y: 59, size: 19, anim: "blink", delay: 0.659, dur: 1.59 },
      { type: "emoji", emoji: "🌟", x: 36, y: 43, size: 19, anim: "blink", delay: 0.591, dur: 1.49 }
    ],
  },
  crab_christmas_16_389: {
    v: 1,
    loop: 4.13,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#3f51b5", opacity: 0.5, anim: "float", dur: 3.39, w: 97.99, h: 20.32 },
      { type: "emoji", emoji: "🦀", x: 58, y: 55, size: 39, anim: "float", dur: 3.53 },
      { type: "emoji", emoji: "⭐", x: 37, y: 62, size: 16, anim: "float", delay: 0.933, dur: 2.31 },
      { type: "emoji", emoji: "💫", x: 47, y: 43, size: 21, anim: "rise", delay: 0.614, dur: 1.5 },
      { type: "emoji", emoji: "💖", x: 62, y: 52, size: 18, anim: "blink", delay: 0.929, dur: 1.1 },
      { type: "emoji", emoji: "✨", x: 74, y: 52, size: 15, anim: "blink", delay: 1.058, dur: 1.57 }
    ],
  },
  crab_coding_16_390: {
    v: 1,
    loop: 2.84,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e8f5e9", opacity: 0.64, anim: "float", dur: 3.24, r: 44.7 },
      { type: "emoji", emoji: "🦀", x: 30, y: 51, size: 35, anim: "float", dur: 2.92 },
      { type: "emoji", emoji: "👒", x: 51, y: 13, size: 33, anim: "bounce", delay: 0.681, dur: 1.67 },
      { type: "emoji", emoji: "🌊", x: 14, y: 52, size: 20, anim: "wiggle", delay: 0.541, dur: 1.57 },
      { type: "emoji", emoji: "🌊", x: 31, y: 20, size: 24, anim: "pop", delay: 0.682, dur: 2.25 },
      { type: "emoji", emoji: "❤️", x: 67, y: 55, size: 22, anim: "rise", delay: 1.288, dur: 1.54 },
      { type: "emoji", emoji: "💖", x: 44, y: 33, size: 12, anim: "blink", delay: 1.316, dur: 1.16 },
      { type: "emoji", emoji: "💫", x: 69, y: 31, size: 19, anim: "blink", delay: 1.459, dur: 1.51 }
    ],
  },
  crab_music_16_391: {
    v: 1,
    loop: 2.62,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#0277bd", opacity: 0.68, anim: "wave", dur: 1.94, w: 104.25, h: 26 },
      { type: "emoji", emoji: "🦀", x: 65, y: 52, size: 42, anim: "wave", dur: 1.74 },
      { type: "emoji", emoji: "🍳", x: 52, y: 14, size: 28, anim: "bounce", delay: 0.383, dur: 1.62 },
      { type: "emoji", emoji: "🍩", x: 71, y: 42, size: 27, anim: "blink", delay: 0.781, dur: 1.64 },
      { type: "emoji", emoji: "🔥", x: 31, y: 26, size: 19, anim: "pop", delay: 0.147, dur: 2.14 },
      { type: "emoji", emoji: "🎉", x: 29, y: 13, size: 25, anim: "rise", delay: 0.025, dur: 1.8 },
      { type: "emoji", emoji: "🌸", x: 35, y: 43, size: 17, anim: "wiggle", delay: 0.997, dur: 1.84 },
      { type: "emoji", emoji: "🍃", x: 70, y: 74, size: 25, anim: "pop", delay: 1.354, dur: 2.17 },
      { type: "emoji", emoji: "🌸", x: 11, y: 81, size: 23, anim: "float", delay: 1.269, dur: 1.41 },
      { type: "emoji", emoji: "💫", x: 63, y: 39, size: 14, anim: "blink", delay: 0.722, dur: 1.62 },
      { type: "emoji", emoji: "✨", x: 43, y: 68, size: 14, anim: "blink", delay: 0.847, dur: 1.58 }
    ],
  },
  crab_sports_16_392: {
    v: 1,
    loop: 2.02,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffb74d", opacity: 0.62, anim: "bounce", dur: 1.56, w: 99.91, h: 20.64 },
      { type: "emoji", emoji: "🦀", x: 33, y: 51, size: 34, anim: "bounce", dur: 1.61 },
      { type: "emoji", emoji: "🔥", x: 73, y: 78, size: 20, anim: "pop", delay: 0.574, dur: 1.35 },
      { type: "emoji", emoji: "🌸", x: 87, y: 12, size: 23, anim: "float", delay: 1.206, dur: 1.57 },
      { type: "emoji", emoji: "❤️", x: 88, y: 15, size: 15, anim: "rise", delay: 1.327, dur: 2.34 },
      { type: "emoji", emoji: "💖", x: 72, y: 24, size: 12, anim: "blink", delay: 0.905, dur: 1.29 },
      { type: "emoji", emoji: "✨", x: 46, y: 76, size: 13, anim: "blink", delay: 1.678, dur: 1.06 }
    ],
  },
  crab_food_16_393: {
    v: 1,
    loop: 2.44,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#4caf50", opacity: 0.47, anim: "wiggle", dur: 1.45, w: 107.38, h: 24.43 },
      { type: "emoji", emoji: "🦀", x: 38, y: 55, size: 41, anim: "wiggle", dur: 1.32 },
      { type: "emoji", emoji: "💫", x: 80, y: 45, size: 12, anim: "wiggle", delay: 1.16, dur: 1.96 },
      { type: "emoji", emoji: "🍃", x: 48, y: 85, size: 21, anim: "wiggle", delay: 1.027, dur: 1.73 },
      { type: "emoji", emoji: "🎉", x: 58, y: 47, size: 25, anim: "rise", delay: 0.725, dur: 2.09 },
      { type: "emoji", emoji: "🔥", x: 49, y: 41, size: 25, anim: "pop", delay: 0.304, dur: 1.56 },
      { type: "emoji", emoji: "💫", x: 51, y: 50, size: 25, anim: "float", delay: 1.364, dur: 2.34 },
      { type: "emoji", emoji: "⭐", x: 29, y: 28, size: 14, anim: "blink", delay: 1.98, dur: 1.28 },
      { type: "emoji", emoji: "⭐", x: 25, y: 63, size: 15, anim: "blink", delay: 1.077, dur: 1.15 }
    ],
  },
  crab_space_16_394: {
    v: 1,
    loop: 4.16,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#512da8", opacity: 0.41, anim: "breathe", dur: 3.34, r: 43.37 },
      { type: "emoji", emoji: "🦀", x: 39, y: 51, size: 39, anim: "breathe", dur: 3.46 },
      { type: "emoji", emoji: "💝", x: 70, y: 41, size: 27, anim: "float", delay: 0.754, dur: 1.42 },
      { type: "emoji", emoji: "💫", x: 34, y: 12, size: 25, anim: "rise", delay: 0.036, dur: 2.23 },
      { type: "emoji", emoji: "🍃", x: 77, y: 74, size: 24, anim: "wiggle", delay: 0.938, dur: 2.05 },
      { type: "emoji", emoji: "❄️", x: 17, y: 43, size: 16, anim: "pop", delay: 1.207, dur: 1.35 },
      { type: "emoji", emoji: "🔥", x: 22, y: 33, size: 20, anim: "wiggle", delay: 0.825, dur: 2.31 },
      { type: "emoji", emoji: "🌟", x: 12, y: 11, size: 13, anim: "float", delay: 0.067, dur: 1.32 },
      { type: "emoji", emoji: "💫", x: 27, y: 78, size: 15, anim: "blink", delay: 1.713, dur: 1.65 },
      { type: "emoji", emoji: "🌟", x: 49, y: 66, size: 17, anim: "blink", delay: 1.329, dur: 1.44 }
    ],
  },
  crab_fantasy_16_395: {
    v: 1,
    loop: 2.96,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 34, y: 48, size: 36, anim: "pulse", dur: 1.98 },
      { type: "emoji", emoji: "🎓", x: 49, y: 15, size: 28, anim: "bounce", delay: 0.597, dur: 1.86 },
      { type: "emoji", emoji: "💌", x: 68, y: 42, size: 26, anim: "float", delay: 0.982, dur: 1.42 },
      { type: "emoji", emoji: "🌿", x: 29, y: 28, size: 21, anim: "wiggle", delay: 0.751, dur: 2.18 },
      { type: "emoji", emoji: "💖", x: 77, y: 14, size: 15, anim: "rise", delay: 1.005, dur: 1.9 },
      { type: "emoji", emoji: "✨", x: 78, y: 87, size: 25, anim: "blink", delay: 1.294, dur: 1.97 },
      { type: "emoji", emoji: "🌟", x: 22, y: 80, size: 11, anim: "blink", delay: 1.328, dur: 1.78 },
      { type: "emoji", emoji: "🌟", x: 34, y: 18, size: 12, anim: "blink", delay: 0.72, dur: 1.33 }
    ],
  },
  crab_office_16_396: {
    v: 1,
    loop: 2.35,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 54, y: 45, size: 37, anim: "pulse", dur: 2.16 },
      { type: "emoji", emoji: "🍃", x: 51, y: 14, size: 17, anim: "blink", delay: 0.636, dur: 1.85 },
      { type: "emoji", emoji: "❤️", x: 80, y: 76, size: 23, anim: "rise", delay: 1.368, dur: 1.86 },
      { type: "emoji", emoji: "❄️", x: 72, y: 41, size: 19, anim: "rise", delay: 0.364, dur: 2.18 },
      { type: "emoji", emoji: "💖", x: 62, y: 72, size: 24, anim: "blink", delay: 1.004, dur: 1.37 },
      { type: "emoji", emoji: "💫", x: 22, y: 18, size: 18, anim: "blink", delay: 1.354, dur: 1.14 },
      { type: "emoji", emoji: "🌟", x: 21, y: 50, size: 14, anim: "blink", delay: 1.084, dur: 1.85 }
    ],
  },
  crab_fitness_16_397: {
    v: 1,
    loop: 3.22,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ba68c8", opacity: 0.67, anim: "float", dur: 2.55, r: 44.43 },
      { type: "emoji", emoji: "🦀", x: 66, y: 48, size: 44, anim: "float", dur: 2.85 },
      { type: "emoji", emoji: "🧙", x: 50, y: 14, size: 33, anim: "bounce", delay: 0.304, dur: 1.55 },
      { type: "emoji", emoji: "🍬", x: 74, y: 42, size: 21, anim: "blink", delay: 0.828, dur: 1.5 },
      { type: "emoji", emoji: "🍂", x: 59, y: 89, size: 24, anim: "wiggle", delay: 0.426, dur: 1.86 },
      { type: "emoji", emoji: "🌿", x: 24, y: 56, size: 20, anim: "wiggle", delay: 0.331, dur: 1.57 },
      { type: "emoji", emoji: "✨", x: 41, y: 71, size: 20, anim: "pop", delay: 1.281, dur: 1.24 },
      { type: "emoji", emoji: "⭐", x: 30, y: 58, size: 16, anim: "rise", delay: 0.537, dur: 1.98 },
      { type: "emoji", emoji: "⭐", x: 61, y: 47, size: 10, anim: "blink", delay: 1.736, dur: 1.42 },
      { type: "emoji", emoji: "💖", x: 56, y: 34, size: 13, anim: "blink", delay: 0.627, dur: 1.49 }
    ],
  },
  crab_travel_16_398: {
    v: 1,
    loop: 3.63,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 48, y: 48, size: 41, anim: "settle", dur: 3.11 },
      { type: "emoji", emoji: "🕶️", x: 49, y: 29, size: 31, anim: "bounce", delay: 0.392, dur: 1.98 },
      { type: "emoji", emoji: "⭐", x: 68, y: 29, size: 22, anim: "rise", delay: 0.461, dur: 1.49 },
      { type: "emoji", emoji: "🍂", x: 56, y: 15, size: 16, anim: "float", delay: 1.227, dur: 1.8 },
      { type: "emoji", emoji: "🌊", x: 78, y: 51, size: 18, anim: "blink", delay: 1.257, dur: 2.36 },
      { type: "emoji", emoji: "🌸", x: 53, y: 73, size: 24, anim: "rise", delay: 1.264, dur: 1.92 },
      { type: "emoji", emoji: "✨", x: 49, y: 50, size: 19, anim: "blink", delay: 0.97, dur: 1.04 },
      { type: "emoji", emoji: "✨", x: 27, y: 67, size: 13, anim: "blink", delay: 1.883, dur: 1.51 }
    ],
  },
  crab_art_16_399: {
    v: 1,
    loop: 1.94,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#3949ab", opacity: 0.7, anim: "bounce", dur: 1.14, w: 96.87, h: 24.79 },
      { type: "emoji", emoji: "🦀", x: 53, y: 50, size: 38, anim: "bounce", dur: 1.27 },
      { type: "emoji", emoji: "⭐", x: 69, y: 31, size: 22, anim: "blink", delay: 0.864, dur: 1.56 },
      { type: "emoji", emoji: "🎊", x: 55, y: 74, size: 16, anim: "rise", delay: 1.053, dur: 1.46 },
      { type: "emoji", emoji: "🌸", x: 82, y: 65, size: 25, anim: "wiggle", delay: 0.228, dur: 1.95 },
      { type: "emoji", emoji: "🎈", x: 74, y: 56, size: 24, anim: "blink", delay: 0.469, dur: 2.39 },
      { type: "emoji", emoji: "⭐", x: 57, y: 41, size: 12, anim: "blink", delay: 1.941, dur: 1.66 },
      { type: "emoji", emoji: "🌟", x: 33, y: 67, size: 15, anim: "blink", delay: 0.512, dur: 1.08 }
    ],
  },
  crab_science_16_400: {
    v: 1,
    loop: 2.77,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#e1f5fe", opacity: 0.7, anim: "twinkle", dur: 2.6, w: 105.61, h: 21.56 },
      { type: "emoji", emoji: "🦀", x: 59, y: 45, size: 41, anim: "twinkle", dur: 2.57 },
      { type: "emoji", emoji: "👒", x: 50, y: 15, size: 33, anim: "bounce", delay: 0.649, dur: 1.61 },
      { type: "emoji", emoji: "🍰", x: 68, y: 39, size: 27, anim: "blink", delay: 0.923, dur: 1.9 },
      { type: "emoji", emoji: "🎊", x: 37, y: 65, size: 24, anim: "rise", delay: 1.281, dur: 1.84 },
      { type: "emoji", emoji: "✨", x: 81, y: 72, size: 13, anim: "rise", delay: 0.716, dur: 1.56 },
      { type: "emoji", emoji: "✨", x: 51, y: 68, size: 12, anim: "blink", delay: 0.76, dur: 1.12 },
      { type: "emoji", emoji: "✨", x: 27, y: 28, size: 14, anim: "blink", delay: 1.913, dur: 1.78 }
    ],
  },
  crab_pets_16_401: {
    v: 1,
    loop: 3.32,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#0277bd", opacity: 0.34, anim: "float", dur: 2.98, w: 103.61, h: 22.13 },
      { type: "emoji", emoji: "🦀", x: 46, y: 45, size: 37, anim: "float", dur: 3.1 },
      { type: "emoji", emoji: "✨", x: 10, y: 22, size: 24, anim: "wiggle", delay: 1.279, dur: 1.75 },
      { type: "emoji", emoji: "💖", x: 12, y: 50, size: 25, anim: "float", delay: 1.37, dur: 2.23 },
      { type: "emoji", emoji: "🌸", x: 56, y: 85, size: 21, anim: "pop", delay: 1.221, dur: 2.05 },
      { type: "emoji", emoji: "✨", x: 31, y: 83, size: 10, anim: "blink", delay: 1.068, dur: 1.5 },
      { type: "emoji", emoji: "✨", x: 43, y: 57, size: 14, anim: "blink", delay: 1.924, dur: 1.89 }
    ],
  },
  crab_magic_16_402: {
    v: 1,
    loop: 1.99,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 39, y: 53, size: 38, anim: "pop", dur: 1.68 },
      { type: "emoji", emoji: "🧙", x: 49, y: 11, size: 35, anim: "bounce", delay: 0.504, dur: 1.78 },
      { type: "emoji", emoji: "🌟", x: 74, y: 30, size: 26, anim: "rise", delay: 0.519, dur: 1.55 },
      { type: "emoji", emoji: "❄️", x: 40, y: 73, size: 20, anim: "float", delay: 1.47, dur: 1.52 },
      { type: "emoji", emoji: "🎊", x: 58, y: 77, size: 19, anim: "wiggle", delay: 0.958, dur: 2.36 },
      { type: "emoji", emoji: "🎉", x: 15, y: 37, size: 24, anim: "float", delay: 0.013, dur: 1.74 },
      { type: "emoji", emoji: "⭐", x: 31, y: 83, size: 13, anim: "blink", delay: 1.402, dur: 1.08 },
      { type: "emoji", emoji: "💫", x: 61, y: 28, size: 11, anim: "blink", delay: 1.862, dur: 1.22 }
    ],
  },
  crab_retro_16_403: {
    v: 1,
    loop: 2.92,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#43a047", opacity: 0.38, anim: "heartbeat", dur: 2.71, r: 41.42 },
      { type: "emoji", emoji: "🦀", x: 70, y: 48, size: 41, anim: "heartbeat", dur: 2.59 },
      { type: "emoji", emoji: "🪖", x: 51, y: 16, size: 28, anim: "bounce", delay: 0.636, dur: 1.81 },
      { type: "emoji", emoji: "🎁", x: 75, y: 43, size: 27, anim: "rise", delay: 0.723, dur: 1.86 },
      { type: "emoji", emoji: "🎈", x: 76, y: 53, size: 24, anim: "blink", delay: 0.915, dur: 1.55 },
      { type: "emoji", emoji: "🍃", x: 72, y: 74, size: 13, anim: "float", delay: 1.291, dur: 1.7 },
      { type: "emoji", emoji: "🌿", x: 56, y: 45, size: 18, anim: "rise", delay: 1.173, dur: 1.75 },
      { type: "emoji", emoji: "⭐", x: 29, y: 52, size: 15, anim: "blink", delay: 0.838, dur: 1.39 },
      { type: "emoji", emoji: "🌟", x: 50, y: 50, size: 12, anim: "blink", delay: 0.618, dur: 1.83 }
    ],
  },
  crab_cyber_16_404: {
    v: 1,
    loop: 3.91,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#673ab7", opacity: 0.65, anim: "float", dur: 3.61, r: 43.79 },
      { type: "emoji", emoji: "🦀", x: 31, y: 55, size: 40, anim: "float", dur: 3.58 },
      { type: "emoji", emoji: "👷", x: 50, y: 16, size: 28, anim: "bounce", delay: 0.554, dur: 1.98 },
      { type: "emoji", emoji: "🍭", x: 67, y: 39, size: 25, anim: "rise", delay: 0.567, dur: 1.85 },
      { type: "emoji", emoji: "🌿", x: 34, y: 68, size: 12, anim: "float", delay: 0.421, dur: 1.25 },
      { type: "emoji", emoji: "💫", x: 54, y: 48, size: 23, anim: "wiggle", delay: 0.108, dur: 2.17 },
      { type: "emoji", emoji: "🌟", x: 19, y: 27, size: 22, anim: "blink", delay: 1.082, dur: 2.13 },
      { type: "emoji", emoji: "💫", x: 71, y: 27, size: 13, anim: "float", delay: 0.275, dur: 1.82 },
      { type: "emoji", emoji: "✨", x: 48, y: 62, size: 11, anim: "blink", delay: 0.616, dur: 1.39 },
      { type: "emoji", emoji: "✨", x: 76, y: 15, size: 15, anim: "blink", delay: 1.266, dur: 1.22 }
    ],
  },
  crab_nature_16_405: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e64a19", opacity: 0.63, anim: "float", dur: 3.2, r: 40.82 },
      { type: "emoji", emoji: "🦀", x: 37, y: 48, size: 36, anim: "float", dur: 2.99 },
      { type: "emoji", emoji: "🎁", x: 73, y: 41, size: 25, anim: "float", delay: 0.801, dur: 1.66 },
      { type: "emoji", emoji: "🎈", x: 22, y: 70, size: 14, anim: "float", delay: 0.929, dur: 1.46 },
      { type: "emoji", emoji: "🍂", x: 13, y: 88, size: 25, anim: "float", delay: 0.464, dur: 2.05 },
      { type: "emoji", emoji: "⭐", x: 21, y: 26, size: 10, anim: "blink", delay: 1.364, dur: 1.4 },
      { type: "emoji", emoji: "🌟", x: 18, y: 32, size: 18, anim: "blink", delay: 1.886, dur: 1.31 }
    ],
  },
  crab_underwater_16_406: {
    v: 1,
    loop: 2.38,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ec407a", opacity: 0.35, anim: "wave", dur: 1.96, r: 41.14 },
      { type: "emoji", emoji: "🦀", x: 55, y: 53, size: 42, anim: "wave", dur: 1.76 },
      { type: "emoji", emoji: "🕶️", x: 51, y: 30, size: 28, anim: "bounce", delay: 0.448, dur: 1.77 },
      { type: "emoji", emoji: "🎈", x: 69, y: 29, size: 27, anim: "rise", delay: 0.692, dur: 1.96 },
      { type: "emoji", emoji: "🌿", x: 41, y: 89, size: 18, anim: "float", delay: 0.872, dur: 2.24 },
      { type: "emoji", emoji: "🎉", x: 68, y: 71, size: 21, anim: "wiggle", delay: 0.879, dur: 1.98 },
      { type: "emoji", emoji: "🌿", x: 76, y: 15, size: 14, anim: "wiggle", delay: 0.051, dur: 1.98 },
      { type: "emoji", emoji: "✨", x: 51, y: 42, size: 18, anim: "blink", delay: 1.65, dur: 1.75 },
      { type: "emoji", emoji: "💖", x: 73, y: 81, size: 18, anim: "blink", delay: 0.507, dur: 1.58 }
    ],
  },
  crab_sky_16_407: {
    v: 1,
    loop: 2.13,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#e1bee7", opacity: 0.48, anim: "bounce", dur: 1.72, w: 95.83, h: 25.7 },
      { type: "emoji", emoji: "🦀", x: 41, y: 54, size: 44, anim: "bounce", dur: 1.58 },
      { type: "emoji", emoji: "🧢", x: 52, y: 16, size: 29, anim: "bounce", delay: 0.466, dur: 1.68 },
      { type: "emoji", emoji: "🎈", x: 74, y: 27, size: 29, anim: "pop", delay: 0.772, dur: 1.9 },
      { type: "emoji", emoji: "🌸", x: 16, y: 28, size: 23, anim: "rise", delay: 0.472, dur: 1.79 },
      { type: "emoji", emoji: "💫", x: 76, y: 67, size: 18, anim: "blink", delay: 1.855, dur: 1.02 },
      { type: "emoji", emoji: "⭐", x: 18, y: 64, size: 19, anim: "blink", delay: 1.28, dur: 1.75 }
    ],
  },
  crab_party_17_408: {
    v: 1,
    loop: 2.43,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ffeb3b", opacity: 0.31, anim: "wiggle", dur: 1.38, r: 40.65 },
      { type: "emoji", emoji: "🦀", x: 63, y: 45, size: 42, anim: "wiggle", dur: 1.44 },
      { type: "emoji", emoji: "👮", x: 51, y: 18, size: 29, anim: "bounce", delay: 0.378, dur: 1.8 },
      { type: "emoji", emoji: "🍫", x: 68, y: 42, size: 25, anim: "pop", delay: 0.448, dur: 1.98 },
      { type: "emoji", emoji: "⭐", x: 58, y: 84, size: 15, anim: "pop", delay: 0.631, dur: 1.39 },
      { type: "emoji", emoji: "⭐", x: 84, y: 43, size: 24, anim: "wiggle", delay: 1.446, dur: 1.58 },
      { type: "emoji", emoji: "🍂", x: 32, y: 69, size: 21, anim: "wiggle", delay: 0.862, dur: 1.46 },
      { type: "emoji", emoji: "💖", x: 66, y: 80, size: 15, anim: "blink", delay: 1.059, dur: 1.1 },
      { type: "emoji", emoji: "✨", x: 70, y: 55, size: 12, anim: "blink", delay: 0.642, dur: 1.79 }
    ],
  },
  crab_beach_17_409: {
    v: 1,
    loop: 3.82,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 62, y: 53, size: 41, anim: "breathe", dur: 3.48 },
      { type: "emoji", emoji: "🪖", x: 49, y: 17, size: 28, anim: "bounce", delay: 0.429, dur: 1.78 },
      { type: "emoji", emoji: "💖", x: 36, y: 59, size: 23, anim: "float", delay: 1.373, dur: 1.97 },
      { type: "emoji", emoji: "💫", x: 84, y: 61, size: 12, anim: "wiggle", delay: 1.084, dur: 1.52 },
      { type: "emoji", emoji: "✨", x: 77, y: 66, size: 11, anim: "blink", delay: 0.763, dur: 1.54 },
      { type: "emoji", emoji: "💫", x: 21, y: 76, size: 13, anim: "blink", delay: 1, dur: 1.26 }
    ],
  },
  crab_winter_17_410: {
    v: 1,
    loop: 2.61,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fff0f6", opacity: 0.46, anim: "pulse", dur: 1.96, r: 41.37 },
      { type: "emoji", emoji: "🦀", x: 59, y: 48, size: 38, anim: "pulse", dur: 1.95 },
      { type: "emoji", emoji: "👑", x: 51, y: 13, size: 28, anim: "bounce", delay: 0.562, dur: 1.72 },
      { type: "emoji", emoji: "🎈", x: 73, y: 31, size: 27, anim: "float", delay: 0.937, dur: 1.52 },
      { type: "emoji", emoji: "🌸", x: 81, y: 56, size: 20, anim: "wiggle", delay: 0.399, dur: 2.07 },
      { type: "emoji", emoji: "🌊", x: 42, y: 40, size: 17, anim: "wiggle", delay: 0.233, dur: 1.31 },
      { type: "emoji", emoji: "🌊", x: 38, y: 34, size: 13, anim: "blink", delay: 0.451, dur: 1.31 },
      { type: "emoji", emoji: "💫", x: 64, y: 39, size: 15, anim: "blink", delay: 0.848, dur: 1.77 },
      { type: "emoji", emoji: "⭐", x: 40, y: 35, size: 14, anim: "blink", delay: 1.416, dur: 1.76 }
    ],
  },
  crab_spring_17_411: {
    v: 1,
    loop: 2.72,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 40, y: 51, size: 41, anim: "pulse", dur: 2.27 },
      { type: "emoji", emoji: "🧢", x: 48, y: 15, size: 28, anim: "bounce", delay: 0.346, dur: 1.69 },
      { type: "emoji", emoji: "🔥", x: 70, y: 60, size: 22, anim: "wiggle", delay: 1.456, dur: 1.82 },
      { type: "emoji", emoji: "❄️", x: 75, y: 44, size: 18, anim: "blink", delay: 1.236, dur: 2.39 },
      { type: "emoji", emoji: "🌟", x: 78, y: 48, size: 14, anim: "blink", delay: 1.03, dur: 1.52 },
      { type: "emoji", emoji: "🌟", x: 27, y: 51, size: 19, anim: "blink", delay: 1.74, dur: 1.53 }
    ],
  },
  crab_halloween_17_412: {
    v: 1,
    loop: 2.91,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f57c00", opacity: 0.51, anim: "float", dur: 3.02, r: 41.85 },
      { type: "emoji", emoji: "🦀", x: 69, y: 44, size: 38, anim: "float", dur: 2.93 },
      { type: "emoji", emoji: "🍳", x: 51, y: 16, size: 28, anim: "bounce", delay: 0.589, dur: 1.68 },
      { type: "emoji", emoji: "🌸", x: 70, y: 61, size: 15, anim: "float", delay: 0.508, dur: 2.14 },
      { type: "emoji", emoji: "🍂", x: 46, y: 46, size: 25, anim: "pop", delay: 1.358, dur: 1.37 },
      { type: "emoji", emoji: "🌿", x: 51, y: 41, size: 21, anim: "wiggle", delay: 0.078, dur: 2.25 },
      { type: "emoji", emoji: "✨", x: 37, y: 78, size: 10, anim: "blink", delay: 0.786, dur: 1.49 },
      { type: "emoji", emoji: "💖", x: 76, y: 42, size: 19, anim: "blink", delay: 0.834, dur: 1.46 }
    ],
  },
  crab_christmas_17_413: {
    v: 1,
    loop: 3.67,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#388e3c", opacity: 0.61, anim: "settle", dur: 3.14, w: 93.82, h: 22.31 },
      { type: "emoji", emoji: "🦀", x: 41, y: 45, size: 33, anim: "settle", dur: 3.11 },
      { type: "emoji", emoji: "🎩", x: 51, y: 12, size: 30, anim: "bounce", delay: 0.542, dur: 1.6 },
      { type: "emoji", emoji: "🌸", x: 71, y: 44, size: 25, anim: "pop", delay: 0.805, dur: 1.98 },
      { type: "emoji", emoji: "❄️", x: 73, y: 22, size: 16, anim: "float", delay: 0.814, dur: 1.52 },
      { type: "emoji", emoji: "🎊", x: 33, y: 89, size: 12, anim: "rise", delay: 1.228, dur: 2.27 },
      { type: "emoji", emoji: "⭐", x: 57, y: 14, size: 17, anim: "wiggle", delay: 1.166, dur: 2.22 },
      { type: "emoji", emoji: "🎈", x: 19, y: 40, size: 19, anim: "pop", delay: 1.418, dur: 2.37 },
      { type: "emoji", emoji: "🌊", x: 79, y: 18, size: 19, anim: "float", delay: 0.608, dur: 1.98 },
      { type: "emoji", emoji: "🌟", x: 64, y: 34, size: 17, anim: "blink", delay: 1.364, dur: 1.32 },
      { type: "emoji", emoji: "✨", x: 21, y: 46, size: 18, anim: "blink", delay: 1.063, dur: 1.49 }
    ],
  },
  crab_coding_17_414: {
    v: 1,
    loop: 1.78,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ede7f6", opacity: 0.5, anim: "bounce", dur: 1.12, r: 41.14 },
      { type: "emoji", emoji: "🦀", x: 59, y: 46, size: 39, anim: "bounce", dur: 1.29 },
      { type: "emoji", emoji: "💫", x: 79, y: 73, size: 23, anim: "wiggle", delay: 1.446, dur: 2.04 },
      { type: "emoji", emoji: "🔥", x: 38, y: 66, size: 21, anim: "blink", delay: 0.264, dur: 1.99 },
      { type: "emoji", emoji: "💖", x: 62, y: 42, size: 10, anim: "blink", delay: 1.887, dur: 1.13 },
      { type: "emoji", emoji: "💫", x: 34, y: 67, size: 15, anim: "blink", delay: 0.542, dur: 1.34 }
    ],
  },
  crab_music_17_415: {
    v: 1,
    loop: 3.15,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 67, y: 45, size: 41, anim: "twinkle", dur: 2.44 },
      { type: "emoji", emoji: "👮", x: 50, y: 16, size: 29, anim: "bounce", delay: 0.342, dur: 1.69 },
      { type: "emoji", emoji: "🌻", x: 70, y: 41, size: 28, anim: "float", delay: 0.593, dur: 1.8 },
      { type: "emoji", emoji: "🌟", x: 25, y: 66, size: 17, anim: "wiggle", delay: 0.127, dur: 1.89 },
      { type: "emoji", emoji: "🔥", x: 81, y: 31, size: 21, anim: "blink", delay: 1.441, dur: 1.91 },
      { type: "emoji", emoji: "🍃", x: 33, y: 17, size: 13, anim: "rise", delay: 0.14, dur: 2.11 },
      { type: "emoji", emoji: "🎈", x: 15, y: 10, size: 20, anim: "rise", delay: 1.337, dur: 1.58 },
      { type: "emoji", emoji: "✨", x: 21, y: 81, size: 18, anim: "blink", delay: 1.466, dur: 1.86 },
      { type: "emoji", emoji: "🌟", x: 53, y: 20, size: 15, anim: "blink", delay: 1.292, dur: 1.58 }
    ],
  },
  crab_sports_17_416: {
    v: 1,
    loop: 3.11,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fce4ec", opacity: 0.6, anim: "float", dur: 2.78, w: 98.09, h: 25.48 },
      { type: "emoji", emoji: "🦀", x: 58, y: 55, size: 39, anim: "float", dur: 3.07 },
      { type: "emoji", emoji: "🕶️", x: 51, y: 28, size: 28, anim: "bounce", delay: 0.648, dur: 1.76 },
      { type: "emoji", emoji: "🍀", x: 75, y: 45, size: 22, anim: "pop", delay: 0.525, dur: 1.74 },
      { type: "emoji", emoji: "🌊", x: 49, y: 51, size: 19, anim: "pop", delay: 1.162, dur: 1.98 },
      { type: "emoji", emoji: "✨", x: 86, y: 84, size: 16, anim: "rise", delay: 0.148, dur: 2.05 },
      { type: "emoji", emoji: "🎉", x: 46, y: 78, size: 22, anim: "rise", delay: 1.497, dur: 1.46 },
      { type: "emoji", emoji: "🔥", x: 61, y: 61, size: 13, anim: "pop", delay: 0.108, dur: 1.33 },
      { type: "emoji", emoji: "⭐", x: 18, y: 48, size: 13, anim: "blink", delay: 1.435, dur: 1.32 },
      { type: "emoji", emoji: "✨", x: 26, y: 33, size: 18, anim: "blink", delay: 1.971, dur: 1.51 }
    ],
  },
  crab_food_17_417: {
    v: 1,
    loop: 2.09,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e1bee7", opacity: 0.48, anim: "pop", dur: 1.58, r: 41.13 },
      { type: "emoji", emoji: "🦀", x: 31, y: 45, size: 39, anim: "pop", dur: 1.71 },
      { type: "emoji", emoji: "👑", x: 49, y: 15, size: 28, anim: "bounce", delay: 0.517, dur: 1.74 },
      { type: "emoji", emoji: "🎁", x: 74, y: 37, size: 26, anim: "float", delay: 0.625, dur: 1.62 },
      { type: "emoji", emoji: "🌊", x: 14, y: 19, size: 13, anim: "pop", delay: 1.069, dur: 2.19 },
      { type: "emoji", emoji: "🌸", x: 32, y: 12, size: 21, anim: "rise", delay: 0.469, dur: 1.97 },
      { type: "emoji", emoji: "🌟", x: 63, y: 32, size: 15, anim: "blink", delay: 1.537, dur: 1.36 },
      { type: "emoji", emoji: "🌟", x: 83, y: 74, size: 11, anim: "blink", delay: 0.614, dur: 1.18 }
    ],
  },
  crab_space_17_418: {
    v: 1,
    loop: 2.79,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 39, y: 50, size: 36, anim: "heartbeat", dur: 2.54 },
      { type: "emoji", emoji: "🍳", x: 51, y: 17, size: 28, anim: "bounce", delay: 0.596, dur: 1.9 },
      { type: "emoji", emoji: "⭐", x: 71, y: 33, size: 25, anim: "rise", delay: 0.524, dur: 1.88 },
      { type: "emoji", emoji: "💫", x: 51, y: 14, size: 13, anim: "float", delay: 0.721, dur: 1.46 },
      { type: "emoji", emoji: "✨", x: 42, y: 73, size: 23, anim: "pop", delay: 0.456, dur: 1.71 },
      { type: "emoji", emoji: "💖", x: 24, y: 59, size: 12, anim: "blink", delay: 0.659, dur: 1.69 },
      { type: "emoji", emoji: "💫", x: 25, y: 18, size: 13, anim: "blink", delay: 0.794, dur: 1.17 }
    ],
  },
  crab_fantasy_17_419: {
    v: 1,
    loop: 3.96,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#303f9f", opacity: 0.43, anim: "float", dur: 3.35, w: 107.54, h: 27.07 },
      { type: "emoji", emoji: "🦀", x: 36, y: 52, size: 37, anim: "float", dur: 3.61 },
      { type: "emoji", emoji: "👮", x: 50, y: 17, size: 28, anim: "bounce", delay: 0.406, dur: 1.61 },
      { type: "emoji", emoji: "🍬", x: 71, y: 42, size: 23, anim: "blink", delay: 0.498, dur: 1.44 },
      { type: "emoji", emoji: "🍂", x: 36, y: 22, size: 21, anim: "float", delay: 0.175, dur: 2.07 },
      { type: "emoji", emoji: "✨", x: 64, y: 75, size: 19, anim: "blink", delay: 0.589, dur: 1.44 },
      { type: "emoji", emoji: "⭐", x: 70, y: 53, size: 19, anim: "blink", delay: 1.169, dur: 1.84 },
      { type: "emoji", emoji: "🌟", x: 43, y: 39, size: 11, anim: "blink", delay: 1.929, dur: 1.9 }
    ],
  },
  crab_office_17_420: {
    v: 1,
    loop: 2.85,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#e8f5e9", opacity: 0.61, anim: "float", dur: 3.03, w: 92.5, h: 24.26 },
      { type: "emoji", emoji: "🦀", x: 55, y: 44, size: 44, anim: "float", dur: 3.04 },
      { type: "emoji", emoji: "💌", x: 72, y: 44, size: 26, anim: "blink", delay: 0.718, dur: 1.61 },
      { type: "emoji", emoji: "🎊", x: 71, y: 24, size: 17, anim: "blink", delay: 0.784, dur: 1.56 },
      { type: "emoji", emoji: "💫", x: 30, y: 52, size: 16, anim: "float", delay: 1.359, dur: 1.41 },
      { type: "emoji", emoji: "🍂", x: 88, y: 36, size: 25, anim: "pop", delay: 0.083, dur: 1.66 },
      { type: "emoji", emoji: "🍂", x: 27, y: 14, size: 13, anim: "float", delay: 0.425, dur: 2.2 },
      { type: "emoji", emoji: "✨", x: 38, y: 42, size: 17, anim: "blink", delay: 1.557, dur: 1.17 },
      { type: "emoji", emoji: "✨", x: 63, y: 23, size: 16, anim: "blink", delay: 1.925, dur: 1.04 }
    ],
  },
  crab_fitness_17_421: {
    v: 1,
    loop: 2.42,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#4fc3f7", opacity: 0.3, anim: "wave", dur: 1.71, r: 44.41 },
      { type: "emoji", emoji: "🦀", x: 40, y: 54, size: 43, anim: "wave", dur: 1.82 },
      { type: "emoji", emoji: "🤠", x: 49, y: 14, size: 33, anim: "bounce", delay: 0.352, dur: 1.95 },
      { type: "emoji", emoji: "💖", x: 69, y: 88, size: 22, anim: "rise", delay: 0.09, dur: 2.14 },
      { type: "emoji", emoji: "🌊", x: 46, y: 24, size: 22, anim: "pop", delay: 0.366, dur: 1.37 },
      { type: "emoji", emoji: "🌊", x: 40, y: 23, size: 18, anim: "blink", delay: 1.065, dur: 1.38 },
      { type: "emoji", emoji: "✨", x: 55, y: 57, size: 19, anim: "blink", delay: 1.553, dur: 1.12 },
      { type: "emoji", emoji: "🌟", x: 33, y: 18, size: 16, anim: "blink", delay: 1.468, dur: 1 }
    ],
  },
  crab_travel_17_422: {
    v: 1,
    loop: 1.76,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 51, y: 54, size: 38, anim: "bounce", dur: 1.44 },
      { type: "emoji", emoji: "🎭", x: 51, y: 27, size: 29, anim: "bounce", delay: 0.474, dur: 1.5 },
      { type: "emoji", emoji: "💎", x: 69, y: 39, size: 25, anim: "pop", delay: 0.808, dur: 1.68 },
      { type: "emoji", emoji: "🌸", x: 45, y: 84, size: 18, anim: "float", delay: 0.98, dur: 1.51 },
      { type: "emoji", emoji: "🎈", x: 56, y: 36, size: 19, anim: "pop", delay: 0.135, dur: 1.79 },
      { type: "emoji", emoji: "🎊", x: 76, y: 17, size: 17, anim: "wiggle", delay: 0.432, dur: 2 },
      { type: "emoji", emoji: "🎊", x: 28, y: 29, size: 25, anim: "blink", delay: 0.052, dur: 1.54 },
      { type: "emoji", emoji: "⭐", x: 24, y: 78, size: 17, anim: "blink", delay: 1.312, dur: 1.68 },
      { type: "emoji", emoji: "✨", x: 74, y: 57, size: 10, anim: "blink", delay: 0.638, dur: 1.06 }
    ],
  },
  crab_art_17_423: {
    v: 1,
    loop: 2.26,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#c8e6c9", opacity: 0.61, anim: "wiggle", dur: 1.5, r: 46.12 },
      { type: "emoji", emoji: "🦀", x: 53, y: 52, size: 40, anim: "wiggle", dur: 1.49 },
      { type: "emoji", emoji: "🌟", x: 73, y: 28, size: 26, anim: "blink", delay: 0.517, dur: 1.73 },
      { type: "emoji", emoji: "💫", x: 12, y: 77, size: 18, anim: "float", delay: 0.317, dur: 1.3 },
      { type: "emoji", emoji: "🍂", x: 86, y: 26, size: 25, anim: "float", delay: 0.297, dur: 1.58 },
      { type: "emoji", emoji: "❤️", x: 78, y: 84, size: 24, anim: "pop", delay: 1.456, dur: 2.28 },
      { type: "emoji", emoji: "🌟", x: 48, y: 80, size: 20, anim: "pop", delay: 0.022, dur: 2.23 },
      { type: "emoji", emoji: "🌟", x: 80, y: 30, size: 15, anim: "blink", delay: 1.005, dur: 1.74 },
      { type: "emoji", emoji: "💖", x: 68, y: 16, size: 19, anim: "blink", delay: 0.992, dur: 1.32 }
    ],
  },
  crab_science_17_424: {
    v: 1,
    loop: 4.11,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#512da8", opacity: 0.49, anim: "breathe", dur: 3.42, r: 47.74 },
      { type: "emoji", emoji: "🦀", x: 58, y: 52, size: 42, anim: "breathe", dur: 3.52 },
      { type: "emoji", emoji: "🌟", x: 71, y: 26, size: 24, anim: "blink", delay: 0.88, dur: 1.52 },
      { type: "emoji", emoji: "🌟", x: 27, y: 49, size: 19, anim: "wiggle", delay: 0.054, dur: 1.35 },
      { type: "emoji", emoji: "❄️", x: 75, y: 73, size: 18, anim: "pop", delay: 0.783, dur: 1.68 },
      { type: "emoji", emoji: "🍃", x: 26, y: 15, size: 13, anim: "float", delay: 1.417, dur: 2.01 },
      { type: "emoji", emoji: "🍃", x: 49, y: 13, size: 15, anim: "wiggle", delay: 0.061, dur: 2.11 },
      { type: "emoji", emoji: "💫", x: 53, y: 20, size: 18, anim: "blink", delay: 1.91, dur: 1.45 },
      { type: "emoji", emoji: "✨", x: 25, y: 61, size: 11, anim: "blink", delay: 0.648, dur: 1.72 }
    ],
  },
  crab_pets_17_425: {
    v: 1,
    loop: 2.94,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ff7043", opacity: 0.45, anim: "pulse", dur: 1.77, r: 45.77 },
      { type: "emoji", emoji: "🦀", x: 60, y: 53, size: 40, anim: "pulse", dur: 2.03 },
      { type: "emoji", emoji: "🕶️", x: 49, y: 27, size: 31, anim: "bounce", delay: 0.536, dur: 1.77 },
      { type: "emoji", emoji: "💎", x: 68, y: 41, size: 23, anim: "rise", delay: 0.815, dur: 1.98 },
      { type: "emoji", emoji: "💫", x: 38, y: 11, size: 24, anim: "pop", delay: 0.584, dur: 2.12 },
      { type: "emoji", emoji: "❤️", x: 66, y: 40, size: 17, anim: "rise", delay: 1.219, dur: 2.34 },
      { type: "emoji", emoji: "💫", x: 30, y: 52, size: 19, anim: "float", delay: 0.193, dur: 1.35 },
      { type: "emoji", emoji: "✨", x: 51, y: 20, size: 18, anim: "blink", delay: 1.497, dur: 1.38 },
      { type: "emoji", emoji: "💫", x: 32, y: 78, size: 12, anim: "blink", delay: 0.841, dur: 1.6 }
    ],
  },
  crab_magic_17_426: {
    v: 1,
    loop: 2.45,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f8bbd0", opacity: 0.51, anim: "pulse", dur: 2.13, r: 47.17 },
      { type: "emoji", emoji: "🦀", x: 45, y: 53, size: 37, anim: "pulse", dur: 2.23 },
      { type: "emoji", emoji: "🤠", x: 50, y: 13, size: 32, anim: "bounce", delay: 0.454, dur: 1.94 },
      { type: "emoji", emoji: "⭐", x: 69, y: 29, size: 25, anim: "float", delay: 0.691, dur: 1.67 },
      { type: "emoji", emoji: "🎈", x: 85, y: 16, size: 12, anim: "rise", delay: 0.78, dur: 1.35 },
      { type: "emoji", emoji: "⭐", x: 63, y: 74, size: 23, anim: "blink", delay: 0.315, dur: 1.57 },
      { type: "emoji", emoji: "✨", x: 66, y: 69, size: 18, anim: "blink", delay: 1.357, dur: 1.51 },
      { type: "emoji", emoji: "✨", x: 17, y: 47, size: 16, anim: "blink", delay: 0.913, dur: 1.64 }
    ],
  },
  crab_retro_17_427: {
    v: 1,
    loop: 2.81,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f3e5f5", opacity: 0.43, anim: "float", dur: 2.99, w: 96.9, h: 19.53 },
      { type: "emoji", emoji: "🦀", x: 37, y: 45, size: 40, anim: "float", dur: 2.92 },
      { type: "emoji", emoji: "🎈", x: 71, y: 30, size: 28, anim: "float", delay: 0.547, dur: 1.72 },
      { type: "emoji", emoji: "❄️", x: 40, y: 65, size: 12, anim: "wiggle", delay: 0.926, dur: 1.62 },
      { type: "emoji", emoji: "✨", x: 48, y: 72, size: 17, anim: "blink", delay: 0.895, dur: 1.12 },
      { type: "emoji", emoji: "💖", x: 15, y: 63, size: 16, anim: "blink", delay: 1.328, dur: 1.11 }
    ],
  },
  crab_cyber_17_428: {
    v: 1,
    loop: 3.7,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fffde7", opacity: 0.66, anim: "settle", dur: 2.78, w: 98.83, h: 18.77 },
      { type: "emoji", emoji: "🦀", x: 55, y: 53, size: 40, anim: "settle", dur: 2.9 },
      { type: "emoji", emoji: "👒", x: 50, y: 15, size: 35, anim: "bounce", delay: 0.686, dur: 1.86 },
      { type: "emoji", emoji: "🌹", x: 73, y: 43, size: 29, anim: "float", delay: 0.853, dur: 1.54 },
      { type: "emoji", emoji: "🍂", x: 71, y: 65, size: 20, anim: "blink", delay: 0.476, dur: 2.36 },
      { type: "emoji", emoji: "🔥", x: 88, y: 47, size: 21, anim: "rise", delay: 1.431, dur: 1.95 },
      { type: "emoji", emoji: "💖", x: 80, y: 55, size: 10, anim: "blink", delay: 0.548, dur: 2 },
      { type: "emoji", emoji: "⭐", x: 80, y: 29, size: 10, anim: "blink", delay: 1.787, dur: 1.03 }
    ],
  },
  crab_nature_17_429: {
    v: 1,
    loop: 1.98,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#c5cae9", opacity: 0.67, anim: "bounce", dur: 1.14, w: 99.02, h: 22.38 },
      { type: "emoji", emoji: "🦀", x: 56, y: 45, size: 42, anim: "bounce", dur: 1.38 },
      { type: "emoji", emoji: "🤠", x: 51, y: 13, size: 31, anim: "bounce", delay: 0.56, dur: 1.58 },
      { type: "emoji", emoji: "🍄", x: 67, y: 43, size: 27, anim: "float", delay: 0.408, dur: 1.79 },
      { type: "emoji", emoji: "✨", x: 23, y: 19, size: 20, anim: "blink", delay: 0.459, dur: 2.35 },
      { type: "emoji", emoji: "✨", x: 49, y: 54, size: 23, anim: "pop", delay: 0.175, dur: 1.36 },
      { type: "emoji", emoji: "🎊", x: 73, y: 35, size: 21, anim: "float", delay: 0.032, dur: 2.32 },
      { type: "emoji", emoji: "🎈", x: 77, y: 44, size: 20, anim: "blink", delay: 0.768, dur: 1.57 },
      { type: "emoji", emoji: "💫", x: 47, y: 20, size: 12, anim: "blink", delay: 0.726, dur: 1.2 },
      { type: "emoji", emoji: "🌟", x: 82, y: 75, size: 10, anim: "blink", delay: 1.796, dur: 1.57 }
    ],
  },
  crab_underwater_17_430: {
    v: 1,
    loop: 2.96,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fff0f6", opacity: 0.51, anim: "twinkle", dur: 2.59, r: 44.43 },
      { type: "emoji", emoji: "🦀", x: 40, y: 45, size: 42, anim: "twinkle", dur: 2.62 },
      { type: "emoji", emoji: "🎩", x: 49, y: 11, size: 30, anim: "bounce", delay: 0.317, dur: 1.79 },
      { type: "emoji", emoji: "💌", x: 71, y: 40, size: 25, anim: "pop", delay: 0.729, dur: 1.86 },
      { type: "emoji", emoji: "✨", x: 79, y: 77, size: 17, anim: "rise", delay: 0.69, dur: 2.24 },
      { type: "emoji", emoji: "💖", x: 49, y: 53, size: 24, anim: "float", delay: 0.289, dur: 2.06 },
      { type: "emoji", emoji: "🎉", x: 29, y: 57, size: 14, anim: "float", delay: 0.109, dur: 1.6 },
      { type: "emoji", emoji: "✨", x: 78, y: 26, size: 14, anim: "blink", delay: 0.618, dur: 1.37 },
      { type: "emoji", emoji: "⭐", x: 70, y: 44, size: 10, anim: "blink", delay: 0.856, dur: 1.56 }
    ],
  },
  crab_sky_17_431: {
    v: 1,
    loop: 3.07,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#29b6f6", opacity: 0.55, anim: "float", dur: 2.77, r: 42.43 },
      { type: "emoji", emoji: "🦀", x: 64, y: 50, size: 39, anim: "float", dur: 2.88 },
      { type: "emoji", emoji: "🧣", x: 51, y: 57, size: 25, anim: "bounce", delay: 0.638, dur: 1.71 },
      { type: "emoji", emoji: "🍦", x: 67, y: 39, size: 27, anim: "blink", delay: 0.442, dur: 1.9 },
      { type: "emoji", emoji: "✨", x: 10, y: 57, size: 23, anim: "wiggle", delay: 0.187, dur: 1.73 },
      { type: "emoji", emoji: "🎈", x: 18, y: 77, size: 20, anim: "blink", delay: 1.119, dur: 1.6 },
      { type: "emoji", emoji: "🌊", x: 58, y: 74, size: 12, anim: "pop", delay: 0.489, dur: 1.66 },
      { type: "emoji", emoji: "⭐", x: 59, y: 14, size: 12, anim: "pop", delay: 0.609, dur: 2.25 },
      { type: "emoji", emoji: "🎊", x: 13, y: 30, size: 22, anim: "wiggle", delay: 1.447, dur: 1.98 },
      { type: "emoji", emoji: "✨", x: 30, y: 82, size: 11, anim: "blink", delay: 1.1, dur: 1.5 },
      { type: "emoji", emoji: "✨", x: 52, y: 83, size: 18, anim: "blink", delay: 1.256, dur: 1.92 }
    ],
  },
  crab_party_18_432: {
    v: 1,
    loop: 2.24,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 50, y: 53, size: 39, anim: "pop", dur: 1.48 },
      { type: "emoji", emoji: "👑", x: 49, y: 14, size: 32, anim: "bounce", delay: 0.462, dur: 1.82 },
      { type: "emoji", emoji: "⭐", x: 72, y: 28, size: 22, anim: "float", delay: 0.876, dur: 1.84 },
      { type: "emoji", emoji: "🍂", x: 84, y: 69, size: 21, anim: "rise", delay: 0.231, dur: 2.1 },
      { type: "emoji", emoji: "🌿", x: 61, y: 27, size: 25, anim: "pop", delay: 0.568, dur: 1.88 },
      { type: "emoji", emoji: "🌊", x: 57, y: 66, size: 19, anim: "blink", delay: 0.258, dur: 1.42 },
      { type: "emoji", emoji: "🌟", x: 28, y: 67, size: 20, anim: "pop", delay: 1.013, dur: 2.1 },
      { type: "emoji", emoji: "🌟", x: 19, y: 38, size: 12, anim: "blink", delay: 1.306, dur: 1.94 },
      { type: "emoji", emoji: "⭐", x: 75, y: 22, size: 14, anim: "blink", delay: 0.972, dur: 1.78 }
    ],
  },
  crab_beach_18_433: {
    v: 1,
    loop: 3.18,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#c8e6c9", opacity: 0.6, anim: "heartbeat", dur: 2.35, w: 98.39, h: 23.31 },
      { type: "emoji", emoji: "🦀", x: 63, y: 53, size: 34, anim: "heartbeat", dur: 2.57 },
      { type: "emoji", emoji: "👒", x: 51, y: 13, size: 32, anim: "bounce", delay: 0.335, dur: 1.69 },
      { type: "emoji", emoji: "🔥", x: 52, y: 21, size: 19, anim: "float", delay: 0.248, dur: 1.8 },
      { type: "emoji", emoji: "💖", x: 51, y: 39, size: 18, anim: "rise", delay: 0.273, dur: 1.6 },
      { type: "emoji", emoji: "🎈", x: 57, y: 67, size: 19, anim: "float", delay: 0.088, dur: 1.44 },
      { type: "emoji", emoji: "🌟", x: 68, y: 67, size: 17, anim: "blink", delay: 1.402, dur: 1.44 },
      { type: "emoji", emoji: "💫", x: 76, y: 32, size: 15, anim: "blink", delay: 1.181, dur: 1.36 }
    ],
  },
  crab_winter_18_434: {
    v: 1,
    loop: 3.79,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#673ab7", opacity: 0.36, anim: "float", dur: 3.39, w: 109.67, h: 20.09 },
      { type: "emoji", emoji: "🦀", x: 53, y: 54, size: 37, anim: "float", dur: 3.65 },
      { type: "emoji", emoji: "🕶️", x: 52, y: 28, size: 31, anim: "bounce", delay: 0.399, dur: 1.99 },
      { type: "emoji", emoji: "🌸", x: 69, y: 41, size: 24, anim: "pop", delay: 0.446, dur: 1.96 },
      { type: "emoji", emoji: "🎉", x: 26, y: 57, size: 22, anim: "rise", delay: 0.813, dur: 1.53 },
      { type: "emoji", emoji: "🎊", x: 51, y: 27, size: 19, anim: "pop", delay: 1.315, dur: 2.01 },
      { type: "emoji", emoji: "💫", x: 23, y: 12, size: 21, anim: "blink", delay: 0.837, dur: 1.63 },
      { type: "emoji", emoji: "🔥", x: 46, y: 25, size: 19, anim: "wiggle", delay: 1.116, dur: 1.92 },
      { type: "emoji", emoji: "💫", x: 15, y: 51, size: 10, anim: "blink", delay: 1.719, dur: 1.11 },
      { type: "emoji", emoji: "✨", x: 15, y: 62, size: 10, anim: "blink", delay: 0.912, dur: 1.83 }
    ],
  },
  crab_spring_18_435: {
    v: 1,
    loop: 2.92,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffccbc", opacity: 0.35, anim: "float", dur: 2.97, w: 96.29, h: 27.38 },
      { type: "emoji", emoji: "🦀", x: 57, y: 48, size: 35, anim: "float", dur: 3.08 },
      { type: "emoji", emoji: "👒", x: 51, y: 14, size: 33, anim: "bounce", delay: 0.317, dur: 1.82 },
      { type: "emoji", emoji: "🍫", x: 69, y: 42, size: 24, anim: "blink", delay: 0.854, dur: 1.75 },
      { type: "emoji", emoji: "🎊", x: 88, y: 83, size: 17, anim: "pop", delay: 0.663, dur: 2.16 },
      { type: "emoji", emoji: "🌿", x: 57, y: 28, size: 21, anim: "wiggle", delay: 0.037, dur: 1.62 },
      { type: "emoji", emoji: "🎊", x: 36, y: 24, size: 22, anim: "blink", delay: 0.587, dur: 1.72 },
      { type: "emoji", emoji: "🔥", x: 36, y: 55, size: 14, anim: "rise", delay: 0.335, dur: 2.3 },
      { type: "emoji", emoji: "❄️", x: 24, y: 77, size: 17, anim: "float", delay: 0.853, dur: 2.32 },
      { type: "emoji", emoji: "✨", x: 60, y: 24, size: 17, anim: "blink", delay: 1.402, dur: 1.2 },
      { type: "emoji", emoji: "⭐", x: 48, y: 44, size: 10, anim: "blink", delay: 1.841, dur: 1.98 }
    ],
  },
  crab_halloween_18_436: {
    v: 1,
    loop: 2.41,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 50, y: 54, size: 38, anim: "wave", dur: 1.76 },
      { type: "emoji", emoji: "🎩", x: 51, y: 12, size: 33, anim: "bounce", delay: 0.683, dur: 1.56 },
      { type: "emoji", emoji: "🍃", x: 54, y: 77, size: 14, anim: "rise", delay: 0.654, dur: 2.19 },
      { type: "emoji", emoji: "🎊", x: 52, y: 87, size: 20, anim: "pop", delay: 0.152, dur: 1.61 },
      { type: "emoji", emoji: "💖", x: 35, y: 83, size: 14, anim: "blink", delay: 0.982, dur: 1.19 },
      { type: "emoji", emoji: "💖", x: 21, y: 29, size: 13, anim: "blink", delay: 1.635, dur: 1.81 }
    ],
  },
  crab_christmas_18_437: {
    v: 1,
    loop: 1.76,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ba68c8", opacity: 0.49, anim: "bounce", dur: 1.55, r: 40.51 },
      { type: "emoji", emoji: "🦀", x: 36, y: 45, size: 34, anim: "bounce", dur: 1.55 },
      { type: "emoji", emoji: "🍪", x: 73, y: 43, size: 22, anim: "float", delay: 0.836, dur: 1.46 },
      { type: "emoji", emoji: "🍃", x: 65, y: 50, size: 14, anim: "rise", delay: 1.304, dur: 1.55 },
      { type: "emoji", emoji: "⭐", x: 59, y: 78, size: 19, anim: "blink", delay: 0.913, dur: 1.73 },
      { type: "emoji", emoji: "💫", x: 43, y: 70, size: 16, anim: "blink", delay: 1.494, dur: 1.06 }
    ],
  },
  crab_coding_18_438: {
    v: 1,
    loop: 2.36,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 58, y: 53, size: 38, anim: "wiggle", dur: 1.28 },
      { type: "emoji", emoji: "🎓", x: 51, y: 17, size: 29, anim: "bounce", delay: 0.551, dur: 1.57 },
      { type: "emoji", emoji: "🎁", x: 71, y: 38, size: 26, anim: "float", delay: 0.89, dur: 1.88 },
      { type: "emoji", emoji: "🎉", x: 28, y: 28, size: 13, anim: "wiggle", delay: 0.871, dur: 1.77 },
      { type: "emoji", emoji: "🍂", x: 44, y: 83, size: 16, anim: "wiggle", delay: 1.049, dur: 2.2 },
      { type: "emoji", emoji: "💫", x: 46, y: 27, size: 18, anim: "pop", delay: 1.423, dur: 1.62 },
      { type: "emoji", emoji: "🎉", x: 86, y: 42, size: 15, anim: "pop", delay: 0.606, dur: 1.31 },
      { type: "emoji", emoji: "⭐", x: 58, y: 31, size: 17, anim: "blink", delay: 1.456, dur: 1.46 },
      { type: "emoji", emoji: "💫", x: 39, y: 29, size: 16, anim: "blink", delay: 1.691, dur: 1.59 }
    ],
  },
  crab_music_18_439: {
    v: 1,
    loop: 4.22,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#3f51b5", opacity: 0.44, anim: "breathe", dur: 3.58, r: 43.55 },
      { type: "emoji", emoji: "🦀", x: 34, y: 48, size: 37, anim: "breathe", dur: 3.39 },
      { type: "emoji", emoji: "❄️", x: 27, y: 68, size: 24, anim: "wiggle", delay: 1.336, dur: 2.17 },
      { type: "emoji", emoji: "⭐", x: 64, y: 62, size: 17, anim: "wiggle", delay: 0.575, dur: 1.48 },
      { type: "emoji", emoji: "🎉", x: 43, y: 21, size: 18, anim: "pop", delay: 1.123, dur: 1.5 },
      { type: "emoji", emoji: "💫", x: 18, y: 34, size: 16, anim: "blink", delay: 0.602, dur: 1.22 },
      { type: "emoji", emoji: "⭐", x: 19, y: 53, size: 14, anim: "blink", delay: 1.925, dur: 1.51 }
    ],
  },
  crab_sports_18_440: {
    v: 1,
    loop: 2.95,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 60, y: 55, size: 36, anim: "pulse", dur: 2.06 },
      { type: "emoji", emoji: "🎀", x: 69, y: 28, size: 18, anim: "float", delay: 0.488, dur: 1.56 },
      { type: "emoji", emoji: "❤️", x: 55, y: 87, size: 22, anim: "rise", delay: 0.554, dur: 1.52 },
      { type: "emoji", emoji: "🎈", x: 36, y: 45, size: 19, anim: "pop", delay: 0.94, dur: 2.2 },
      { type: "emoji", emoji: "💖", x: 38, y: 62, size: 15, anim: "blink", delay: 0.523, dur: 1.52 },
      { type: "emoji", emoji: "🌟", x: 25, y: 82, size: 15, anim: "blink", delay: 1.92, dur: 1.66 }
    ],
  },
  crab_food_18_441: {
    v: 1,
    loop: 2.48,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#039be5", opacity: 0.4, anim: "pulse", dur: 2.04, w: 93.18, h: 19.83 },
      { type: "emoji", emoji: "🦀", x: 35, y: 47, size: 44, anim: "pulse", dur: 2.35 },
      { type: "emoji", emoji: "🍳", x: 50, y: 17, size: 26, anim: "bounce", delay: 0.6, dur: 1.94 },
      { type: "emoji", emoji: "💝", x: 70, y: 42, size: 27, anim: "float", delay: 0.948, dur: 1.55 },
      { type: "emoji", emoji: "🎉", x: 87, y: 36, size: 15, anim: "float", delay: 0.494, dur: 1.47 },
      { type: "emoji", emoji: "🔥", x: 57, y: 54, size: 21, anim: "blink", delay: 0.248, dur: 1.51 },
      { type: "emoji", emoji: "⭐", x: 60, y: 50, size: 12, anim: "blink", delay: 0.752, dur: 1.74 },
      { type: "emoji", emoji: "⭐", x: 74, y: 41, size: 17, anim: "blink", delay: 0.78, dur: 1.88 }
    ],
  },
  crab_space_18_442: {
    v: 1,
    loop: 3.07,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f57c00", opacity: 0.68, anim: "float", dur: 2.75, w: 92.74, h: 19.08 },
      { type: "emoji", emoji: "🦀", x: 52, y: 51, size: 34, anim: "float", dur: 2.93 },
      { type: "emoji", emoji: "🧣", x: 50, y: 57, size: 25, anim: "bounce", delay: 0.509, dur: 1.64 },
      { type: "emoji", emoji: "🍭", x: 73, y: 39, size: 25, anim: "blink", delay: 0.565, dur: 1.73 },
      { type: "emoji", emoji: "⭐", x: 74, y: 33, size: 16, anim: "rise", delay: 0.943, dur: 1.97 },
      { type: "emoji", emoji: "🌿", x: 29, y: 82, size: 15, anim: "wiggle", delay: 0.792, dur: 1.94 },
      { type: "emoji", emoji: "💫", x: 56, y: 79, size: 15, anim: "blink", delay: 1.772, dur: 1.49 },
      { type: "emoji", emoji: "⭐", x: 61, y: 60, size: 10, anim: "blink", delay: 1.035, dur: 1.65 }
    ],
  },
  crab_fantasy_18_443: {
    v: 1,
    loop: 3.65,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#66bb6a", opacity: 0.43, anim: "settle", dur: 3.19, r: 40.2 },
      { type: "emoji", emoji: "🦀", x: 33, y: 47, size: 36, anim: "settle", dur: 3.04 },
      { type: "emoji", emoji: "🍀", x: 71, y: 42, size: 23, anim: "pop", delay: 0.937, dur: 1.67 },
      { type: "emoji", emoji: "✨", x: 60, y: 31, size: 18, anim: "float", delay: 0.111, dur: 1.46 },
      { type: "emoji", emoji: "💫", x: 56, y: 48, size: 12, anim: "blink", delay: 1.61, dur: 1.83 },
      { type: "emoji", emoji: "⭐", x: 66, y: 39, size: 19, anim: "blink", delay: 1.03, dur: 1.6 }
    ],
  },
  crab_office_18_444: {
    v: 1,
    loop: 2.03,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#673ab7", opacity: 0.69, anim: "bounce", dur: 1.1, r: 44.35 },
      { type: "emoji", emoji: "🦀", x: 52, y: 56, size: 36, anim: "bounce", dur: 1.39 },
      { type: "emoji", emoji: "👑", x: 51, y: 12, size: 32, anim: "bounce", delay: 0.636, dur: 1.72 },
      { type: "emoji", emoji: "🍪", x: 71, y: 43, size: 24, anim: "pop", delay: 0.433, dur: 1.68 },
      { type: "emoji", emoji: "🎈", x: 37, y: 67, size: 12, anim: "rise", delay: 0.028, dur: 1.95 },
      { type: "emoji", emoji: "💖", x: 44, y: 86, size: 22, anim: "wiggle", delay: 0.741, dur: 2.07 },
      { type: "emoji", emoji: "⭐", x: 15, y: 85, size: 18, anim: "rise", delay: 1.484, dur: 2.14 },
      { type: "emoji", emoji: "🌿", x: 45, y: 60, size: 14, anim: "pop", delay: 0.187, dur: 2.03 },
      { type: "emoji", emoji: "🌟", x: 68, y: 25, size: 17, anim: "blink", delay: 0.716, dur: 1.36 },
      { type: "emoji", emoji: "⭐", x: 27, y: 40, size: 12, anim: "blink", delay: 1.318, dur: 1.21 }
    ],
  },
  crab_fitness_18_445: {
    v: 1,
    loop: 3.13,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ff7043", opacity: 0.55, anim: "twinkle", dur: 2.31, r: 49.18 },
      { type: "emoji", emoji: "🦀", x: 30, y: 55, size: 34, anim: "twinkle", dur: 2.45 },
      { type: "emoji", emoji: "👒", x: 50, y: 13, size: 32, anim: "bounce", delay: 0.364, dur: 1.7 },
      { type: "emoji", emoji: "🍭", x: 68, y: 41, size: 24, anim: "rise", delay: 0.921, dur: 1.96 },
      { type: "emoji", emoji: "🔥", x: 83, y: 72, size: 22, anim: "float", delay: 0.873, dur: 1.72 },
      { type: "emoji", emoji: "🌟", x: 43, y: 65, size: 14, anim: "wiggle", delay: 0.754, dur: 1.73 },
      { type: "emoji", emoji: "💫", x: 32, y: 86, size: 20, anim: "float", delay: 0.325, dur: 1.58 },
      { type: "emoji", emoji: "🔥", x: 45, y: 69, size: 13, anim: "wiggle", delay: 0.807, dur: 1.72 },
      { type: "emoji", emoji: "🌟", x: 40, y: 62, size: 10, anim: "blink", delay: 1.716, dur: 1.49 },
      { type: "emoji", emoji: "💖", x: 34, y: 74, size: 10, anim: "blink", delay: 1.598, dur: 1.38 }
    ],
  },
  crab_travel_18_446: {
    v: 1,
    loop: 3.27,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#d81b60", opacity: 0.38, anim: "float", dur: 2.83, w: 100.15, h: 26.13 },
      { type: "emoji", emoji: "🦀", x: 50, y: 46, size: 38, anim: "float", dur: 2.94 },
      { type: "emoji", emoji: "🌻", x: 72, y: 41, size: 27, anim: "rise", delay: 0.636, dur: 1.56 },
      { type: "emoji", emoji: "🌿", x: 44, y: 11, size: 22, anim: "float", delay: 1.273, dur: 1.74 },
      { type: "emoji", emoji: "💫", x: 73, y: 87, size: 20, anim: "rise", delay: 0.721, dur: 1.88 },
      { type: "emoji", emoji: "❤️", x: 63, y: 47, size: 22, anim: "rise", delay: 0.049, dur: 2.19 },
      { type: "emoji", emoji: "💖", x: 28, y: 55, size: 19, anim: "wiggle", delay: 0.342, dur: 1.82 },
      { type: "emoji", emoji: "🌟", x: 16, y: 46, size: 16, anim: "blink", delay: 1.645, dur: 1.71 },
      { type: "emoji", emoji: "💫", x: 25, y: 62, size: 19, anim: "blink", delay: 1.651, dur: 1.56 }
    ],
  },
  crab_art_18_447: {
    v: 1,
    loop: 2.24,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#8e24aa", opacity: 0.7, anim: "pop", dur: 1.68, r: 44.07 },
      { type: "emoji", emoji: "🦀", x: 63, y: 52, size: 33, anim: "pop", dur: 1.68 },
      { type: "emoji", emoji: "👑", x: 51, y: 12, size: 31, anim: "bounce", delay: 0.334, dur: 1.87 },
      { type: "emoji", emoji: "🍬", x: 74, y: 43, size: 23, anim: "rise", delay: 0.965, dur: 1.56 },
      { type: "emoji", emoji: "⭐", x: 13, y: 34, size: 20, anim: "pop", delay: 1.247, dur: 1.91 },
      { type: "emoji", emoji: "🍂", x: 61, y: 65, size: 19, anim: "blink", delay: 0.55, dur: 1.92 },
      { type: "emoji", emoji: "🔥", x: 74, y: 45, size: 12, anim: "blink", delay: 0.487, dur: 1.62 },
      { type: "emoji", emoji: "💫", x: 47, y: 54, size: 11, anim: "blink", delay: 1.752, dur: 1.65 },
      { type: "emoji", emoji: "✨", x: 34, y: 84, size: 18, anim: "blink", delay: 1.933, dur: 1.63 }
    ],
  },
  crab_science_18_448: {
    v: 1,
    loop: 3.03,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 50, y: 45, size: 35, anim: "heartbeat", dur: 2.38 },
      { type: "emoji", emoji: "🍳", x: 50, y: 17, size: 29, anim: "bounce", delay: 0.357, dur: 1.53 },
      { type: "emoji", emoji: "🍰", x: 68, y: 39, size: 28, anim: "blink", delay: 0.795, dur: 1.75 },
      { type: "emoji", emoji: "💫", x: 34, y: 62, size: 12, anim: "wiggle", delay: 0.548, dur: 1.26 },
      { type: "emoji", emoji: "💖", x: 56, y: 19, size: 25, anim: "float", delay: 0.734, dur: 1.94 },
      { type: "emoji", emoji: "🌊", x: 24, y: 70, size: 21, anim: "wiggle", delay: 0.793, dur: 2.27 },
      { type: "emoji", emoji: "🌿", x: 49, y: 25, size: 25, anim: "float", delay: 0.166, dur: 2.07 },
      { type: "emoji", emoji: "✨", x: 25, y: 32, size: 13, anim: "blink", delay: 0.982, dur: 1.24 },
      { type: "emoji", emoji: "💖", x: 77, y: 75, size: 13, anim: "blink", delay: 0.526, dur: 1.2 }
    ],
  },
  crab_pets_18_449: {
    v: 1,
    loop: 3.99,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#303f9f", opacity: 0.44, anim: "float", dur: 3.27, w: 99.63, h: 18.6 },
      { type: "emoji", emoji: "🦀", x: 48, y: 52, size: 32, anim: "float", dur: 3.56 },
      { type: "emoji", emoji: "💎", x: 72, y: 40, size: 22, anim: "float", delay: 0.821, dur: 1.81 },
      { type: "emoji", emoji: "💖", x: 85, y: 43, size: 22, anim: "float", delay: 0.888, dur: 1.42 },
      { type: "emoji", emoji: "🔥", x: 72, y: 62, size: 16, anim: "float", delay: 1.041, dur: 2.01 },
      { type: "emoji", emoji: "🍃", x: 60, y: 75, size: 12, anim: "pop", delay: 0.623, dur: 2.3 },
      { type: "emoji", emoji: "🍃", x: 40, y: 75, size: 22, anim: "float", delay: 0.763, dur: 2.37 },
      { type: "emoji", emoji: "✨", x: 72, y: 59, size: 25, anim: "float", delay: 1.419, dur: 1.21 },
      { type: "emoji", emoji: "✨", x: 33, y: 22, size: 14, anim: "blink", delay: 0.984, dur: 1.91 },
      { type: "emoji", emoji: "⭐", x: 31, y: 34, size: 10, anim: "blink", delay: 1.82, dur: 2 }
    ],
  },
  crab_magic_18_450: {
    v: 1,
    loop: 2.86,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff9c4", opacity: 0.56, anim: "float", dur: 3.15, w: 96.53, h: 22.52 },
      { type: "emoji", emoji: "🦀", x: 65, y: 52, size: 42, anim: "float", dur: 3.02 },
      { type: "emoji", emoji: "💎", x: 72, y: 37, size: 24, anim: "float", delay: 0.765, dur: 1.43 },
      { type: "emoji", emoji: "💖", x: 63, y: 89, size: 22, anim: "float", delay: 0.992, dur: 2.03 },
      { type: "emoji", emoji: "🌸", x: 75, y: 62, size: 24, anim: "float", delay: 0.722, dur: 1.71 },
      { type: "emoji", emoji: "🍃", x: 60, y: 21, size: 19, anim: "blink", delay: 0.018, dur: 1.38 },
      { type: "emoji", emoji: "💖", x: 84, y: 28, size: 12, anim: "blink", delay: 1.436, dur: 1.36 },
      { type: "emoji", emoji: "⭐", x: 78, y: 64, size: 13, anim: "blink", delay: 0.547, dur: 1.55 }
    ],
  },
  crab_retro_18_451: {
    v: 1,
    loop: 2.61,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#039be5", opacity: 0.65, anim: "wave", dur: 1.64, w: 106.26, h: 18.79 },
      { type: "emoji", emoji: "🦀", x: 32, y: 51, size: 40, anim: "wave", dur: 1.95 },
      { type: "emoji", emoji: "🎩", x: 51, y: 13, size: 32, anim: "bounce", delay: 0.51, dur: 1.56 },
      { type: "emoji", emoji: "❤️", x: 58, y: 79, size: 25, anim: "pop", delay: 0.628, dur: 1.49 },
      { type: "emoji", emoji: "🎊", x: 17, y: 20, size: 16, anim: "blink", delay: 0.804, dur: 2.07 },
      { type: "emoji", emoji: "💖", x: 44, y: 70, size: 11, anim: "blink", delay: 1.973, dur: 1.99 },
      { type: "emoji", emoji: "🌟", x: 50, y: 53, size: 13, anim: "blink", delay: 1.368, dur: 1.18 }
    ],
  },
  crab_cyber_18_452: {
    v: 1,
    loop: 1.99,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ff9800", opacity: 0.5, anim: "bounce", dur: 1.64, w: 105.16, h: 21.75 },
      { type: "emoji", emoji: "🦀", x: 68, y: 46, size: 40, anim: "bounce", dur: 1.62 },
      { type: "emoji", emoji: "⭐", x: 71, y: 28, size: 22, anim: "float", delay: 0.883, dur: 1.48 },
      { type: "emoji", emoji: "❄️", x: 54, y: 40, size: 14, anim: "wiggle", delay: 0.623, dur: 1.67 },
      { type: "emoji", emoji: "❤️", x: 67, y: 37, size: 13, anim: "rise", delay: 0.896, dur: 1.53 },
      { type: "emoji", emoji: "🎊", x: 70, y: 65, size: 21, anim: "rise", delay: 0.369, dur: 2.33 },
      { type: "emoji", emoji: "🌿", x: 63, y: 22, size: 15, anim: "pop", delay: 0.123, dur: 1.98 },
      { type: "emoji", emoji: "🌟", x: 60, y: 60, size: 24, anim: "blink", delay: 1.241, dur: 1.94 },
      { type: "emoji", emoji: "🌟", x: 64, y: 43, size: 12, anim: "blink", delay: 1.163, dur: 1.7 },
      { type: "emoji", emoji: "✨", x: 67, y: 25, size: 17, anim: "blink", delay: 1.523, dur: 1.47 }
    ],
  },
  crab_nature_18_453: {
    v: 1,
    loop: 2.17,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e8f5e9", opacity: 0.66, anim: "wiggle", dur: 1.37, r: 45.9 },
      { type: "emoji", emoji: "🦀", x: 43, y: 47, size: 35, anim: "wiggle", dur: 1.53 },
      { type: "emoji", emoji: "🕶️", x: 50, y: 30, size: 29, anim: "bounce", delay: 0.589, dur: 1.66 },
      { type: "emoji", emoji: "🌟", x: 69, y: 26, size: 24, anim: "float", delay: 0.881, dur: 1.98 },
      { type: "emoji", emoji: "❤️", x: 59, y: 10, size: 17, anim: "float", delay: 0.842, dur: 1.76 },
      { type: "emoji", emoji: "🍃", x: 21, y: 60, size: 16, anim: "pop", delay: 0.07, dur: 2.37 },
      { type: "emoji", emoji: "🎊", x: 39, y: 67, size: 25, anim: "pop", delay: 1.436, dur: 2.15 },
      { type: "emoji", emoji: "🎊", x: 50, y: 80, size: 16, anim: "blink", delay: 1.376, dur: 2.36 },
      { type: "emoji", emoji: "✨", x: 37, y: 31, size: 17, anim: "float", delay: 0.808, dur: 2.16 },
      { type: "emoji", emoji: "🌟", x: 57, y: 25, size: 10, anim: "blink", delay: 0.587, dur: 1.09 },
      { type: "emoji", emoji: "⭐", x: 37, y: 58, size: 11, anim: "blink", delay: 1.519, dur: 1.41 }
    ],
  },
  crab_underwater_18_454: {
    v: 1,
    loop: 4.15,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#b39ddb", opacity: 0.39, anim: "breathe", dur: 3.5, w: 107.91, h: 24.14 },
      { type: "emoji", emoji: "🦀", x: 65, y: 54, size: 33, anim: "breathe", dur: 3.49 },
      { type: "emoji", emoji: "💖", x: 56, y: 25, size: 18, anim: "float", delay: 0.004, dur: 2.12 },
      { type: "emoji", emoji: "💫", x: 22, y: 63, size: 21, anim: "wiggle", delay: 0.549, dur: 2.36 },
      { type: "emoji", emoji: "⭐", x: 12, y: 19, size: 14, anim: "wiggle", delay: 1.349, dur: 1.72 },
      { type: "emoji", emoji: "✨", x: 14, y: 27, size: 16, anim: "rise", delay: 0.648, dur: 2.16 },
      { type: "emoji", emoji: "🍃", x: 56, y: 81, size: 23, anim: "rise", delay: 0.356, dur: 2.3 },
      { type: "emoji", emoji: "⭐", x: 66, y: 25, size: 12, anim: "blink", delay: 0.801, dur: 1.27 },
      { type: "emoji", emoji: "💫", x: 38, y: 47, size: 14, anim: "blink", delay: 0.644, dur: 1.34 }
    ],
  },
  crab_sky_18_455: {
    v: 1,
    loop: 2.77,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ff5722", opacity: 0.52, anim: "pulse", dur: 2.01, r: 47.05 },
      { type: "emoji", emoji: "🦀", x: 45, y: 46, size: 43, anim: "pulse", dur: 2.07 },
      { type: "emoji", emoji: "🧢", x: 49, y: 15, size: 28, anim: "bounce", delay: 0.364, dur: 1.53 },
      { type: "emoji", emoji: "🎈", x: 74, y: 29, size: 28, anim: "pop", delay: 0.407, dur: 1.97 },
      { type: "emoji", emoji: "🔥", x: 59, y: 58, size: 21, anim: "pop", delay: 0.16, dur: 1.32 },
      { type: "emoji", emoji: "🍃", x: 60, y: 27, size: 18, anim: "float", delay: 1.145, dur: 1.34 },
      { type: "emoji", emoji: "🔥", x: 65, y: 83, size: 17, anim: "float", delay: 0.917, dur: 1.5 },
      { type: "emoji", emoji: "🌸", x: 79, y: 59, size: 24, anim: "wiggle", delay: 0.543, dur: 1.47 },
      { type: "emoji", emoji: "💫", x: 29, y: 33, size: 19, anim: "blink", delay: 1.472, dur: 1.63 },
      { type: "emoji", emoji: "⭐", x: 49, y: 59, size: 10, anim: "blink", delay: 1.956, dur: 1.33 }
    ],
  },
  crab_party_19_456: {
    v: 1,
    loop: 2.52,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#e91e63", opacity: 0.36, anim: "pulse", dur: 2.07, w: 109.57, h: 26.03 },
      { type: "emoji", emoji: "🦀", x: 64, y: 54, size: 43, anim: "pulse", dur: 2.33 },
      { type: "emoji", emoji: "🍄", x: 69, y: 42, size: 25, anim: "rise", delay: 0.8, dur: 1.44 },
      { type: "emoji", emoji: "💖", x: 28, y: 49, size: 25, anim: "float", delay: 0.557, dur: 1.98 },
      { type: "emoji", emoji: "💫", x: 20, y: 63, size: 25, anim: "wiggle", delay: 0.743, dur: 2.12 },
      { type: "emoji", emoji: "🎈", x: 35, y: 73, size: 23, anim: "pop", delay: 0.124, dur: 1.52 },
      { type: "emoji", emoji: "🎈", x: 47, y: 14, size: 12, anim: "blink", delay: 0.828, dur: 2.11 },
      { type: "emoji", emoji: "💫", x: 76, y: 76, size: 18, anim: "blink", delay: 1.925, dur: 1.76 },
      { type: "emoji", emoji: "💫", x: 27, y: 53, size: 13, anim: "blink", delay: 0.582, dur: 1.53 }
    ],
  },
  crab_beach_19_457: {
    v: 1,
    loop: 2.87,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#7b1fa2", opacity: 0.46, anim: "float", dur: 2.63, r: 46.86 },
      { type: "emoji", emoji: "🦀", x: 66, y: 50, size: 43, anim: "float", dur: 2.91 },
      { type: "emoji", emoji: "🌟", x: 70, y: 29, size: 24, anim: "float", delay: 0.503, dur: 1.84 },
      { type: "emoji", emoji: "🍂", x: 62, y: 70, size: 24, anim: "float", delay: 0.95, dur: 1.37 },
      { type: "emoji", emoji: "💖", x: 70, y: 23, size: 11, anim: "blink", delay: 0.932, dur: 1.43 },
      { type: "emoji", emoji: "⭐", x: 61, y: 28, size: 10, anim: "blink", delay: 0.764, dur: 1.8 }
    ],
  },
  crab_winter_19_458: {
    v: 1,
    loop: 3.27,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff9c4", opacity: 0.49, anim: "settle", dur: 3.18, w: 106.21, h: 18.02 },
      { type: "emoji", emoji: "🦀", x: 31, y: 50, size: 34, anim: "settle", dur: 2.93 },
      { type: "emoji", emoji: "🌻", x: 67, y: 41, size: 28, anim: "blink", delay: 0.843, dur: 1.75 },
      { type: "emoji", emoji: "🎊", x: 45, y: 66, size: 23, anim: "rise", delay: 0.048, dur: 2.3 },
      { type: "emoji", emoji: "⭐", x: 70, y: 39, size: 24, anim: "blink", delay: 0.558, dur: 1.74 },
      { type: "emoji", emoji: "🎉", x: 19, y: 77, size: 19, anim: "wiggle", delay: 0.486, dur: 1.39 },
      { type: "emoji", emoji: "🌟", x: 80, y: 74, size: 14, anim: "blink", delay: 1.686, dur: 1.01 },
      { type: "emoji", emoji: "💖", x: 67, y: 73, size: 14, anim: "blink", delay: 1.316, dur: 1.4 }
    ],
  },
  crab_spring_19_459: {
    v: 1,
    loop: 2.09,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#9fa8da", opacity: 0.6, anim: "bounce", dur: 1.53, r: 45.95 },
      { type: "emoji", emoji: "🦀", x: 59, y: 45, size: 38, anim: "bounce", dur: 1.15 },
      { type: "emoji", emoji: "🍰", x: 67, y: 40, size: 29, anim: "pop", delay: 0.711, dur: 1.5 },
      { type: "emoji", emoji: "💫", x: 85, y: 12, size: 18, anim: "pop", delay: 1.409, dur: 2.03 },
      { type: "emoji", emoji: "🌟", x: 30, y: 84, size: 19, anim: "blink", delay: 0.766, dur: 1.58 },
      { type: "emoji", emoji: "💖", x: 51, y: 37, size: 10, anim: "blink", delay: 1.332, dur: 1.8 }
    ],
  },
  crab_halloween_19_460: {
    v: 1,
    loop: 3.2,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff9c4", opacity: 0.53, anim: "twinkle", dur: 2.61, w: 106.75, h: 26.76 },
      { type: "emoji", emoji: "🦀", x: 56, y: 55, size: 40, anim: "twinkle", dur: 2.6 },
      { type: "emoji", emoji: "👒", x: 49, y: 14, size: 35, anim: "bounce", delay: 0.449, dur: 1.81 },
      { type: "emoji", emoji: "🍬", x: 74, y: 44, size: 21, anim: "pop", delay: 0.856, dur: 1.55 },
      { type: "emoji", emoji: "✨", x: 66, y: 46, size: 17, anim: "float", delay: 0.447, dur: 1.89 },
      { type: "emoji", emoji: "🌸", x: 26, y: 32, size: 25, anim: "blink", delay: 0.229, dur: 1.76 },
      { type: "emoji", emoji: "🎊", x: 39, y: 77, size: 19, anim: "pop", delay: 1.498, dur: 1.93 },
      { type: "emoji", emoji: "🌸", x: 40, y: 25, size: 21, anim: "wiggle", delay: 0.861, dur: 2 },
      { type: "emoji", emoji: "💖", x: 15, y: 77, size: 18, anim: "blink", delay: 1.327, dur: 1.77 },
      { type: "emoji", emoji: "⭐", x: 78, y: 19, size: 17, anim: "blink", delay: 1.731, dur: 1.13 }
    ],
  },
  crab_christmas_19_461: {
    v: 1,
    loop: 2.96,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 31, y: 44, size: 35, anim: "float", dur: 2.91 },
      { type: "emoji", emoji: "👒", x: 52, y: 15, size: 32, anim: "bounce", delay: 0.543, dur: 1.77 },
      { type: "emoji", emoji: "🎁", x: 73, y: 37, size: 26, anim: "float", delay: 0.886, dur: 1.78 },
      { type: "emoji", emoji: "✨", x: 13, y: 57, size: 14, anim: "float", delay: 0.109, dur: 2.09 },
      { type: "emoji", emoji: "⭐", x: 82, y: 66, size: 15, anim: "float", delay: 0.684, dur: 1.49 },
      { type: "emoji", emoji: "💖", x: 36, y: 77, size: 12, anim: "blink", delay: 0.521, dur: 1.35 },
      { type: "emoji", emoji: "💫", x: 18, y: 53, size: 11, anim: "blink", delay: 1.989, dur: 1.21 }
    ],
  },
  crab_coding_19_462: {
    v: 1,
    loop: 2.23,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 68, y: 53, size: 43, anim: "pop", dur: 1.5 },
      { type: "emoji", emoji: "💎", x: 69, y: 37, size: 24, anim: "pop", delay: 0.935, dur: 1.89 },
      { type: "emoji", emoji: "❤️", x: 11, y: 47, size: 19, anim: "rise", delay: 0.127, dur: 1.61 },
      { type: "emoji", emoji: "🌸", x: 75, y: 14, size: 20, anim: "rise", delay: 0.255, dur: 1.47 },
      { type: "emoji", emoji: "🌟", x: 14, y: 87, size: 20, anim: "blink", delay: 0.096, dur: 2.15 },
      { type: "emoji", emoji: "💖", x: 73, y: 15, size: 16, anim: "blink", delay: 1.708, dur: 1.04 },
      { type: "emoji", emoji: "⭐", x: 39, y: 19, size: 19, anim: "blink", delay: 0.612, dur: 1.7 }
    ],
  },
  crab_music_19_463: {
    v: 1,
    loop: 3.14,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#43a047", opacity: 0.69, anim: "heartbeat", dur: 2.25, w: 98.32, h: 25.78 },
      { type: "emoji", emoji: "🦀", x: 61, y: 48, size: 38, anim: "heartbeat", dur: 2.47 },
      { type: "emoji", emoji: "🪖", x: 50, y: 15, size: 28, anim: "bounce", delay: 0.452, dur: 1.93 },
      { type: "emoji", emoji: "🍫", x: 72, y: 45, size: 27, anim: "float", delay: 0.671, dur: 1.97 },
      { type: "emoji", emoji: "🌸", x: 42, y: 76, size: 15, anim: "rise", delay: 0.09, dur: 2.12 },
      { type: "emoji", emoji: "✨", x: 81, y: 19, size: 13, anim: "rise", delay: 0.63, dur: 2.22 },
      { type: "emoji", emoji: "✨", x: 45, y: 62, size: 23, anim: "rise", delay: 1.391, dur: 1.54 },
      { type: "emoji", emoji: "🌿", x: 71, y: 78, size: 16, anim: "rise", delay: 0.002, dur: 2 },
      { type: "emoji", emoji: "✨", x: 53, y: 69, size: 19, anim: "blink", delay: 0.941, dur: 1.75 },
      { type: "emoji", emoji: "💫", x: 42, y: 76, size: 12, anim: "blink", delay: 0.518, dur: 1.69 }
    ],
  },
  crab_sports_19_464: {
    v: 1,
    loop: 3.97,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#9575cd", opacity: 0.51, anim: "float", dur: 3.47, r: 49.7 },
      { type: "emoji", emoji: "🦀", x: 70, y: 51, size: 41, anim: "float", dur: 3.42 },
      { type: "emoji", emoji: "🍂", x: 26, y: 87, size: 13, anim: "rise", delay: 0.78, dur: 1.37 },
      { type: "emoji", emoji: "🌿", x: 59, y: 29, size: 13, anim: "pop", delay: 0.574, dur: 1.46 },
      { type: "emoji", emoji: "✨", x: 17, y: 73, size: 24, anim: "pop", delay: 0.803, dur: 1.76 },
      { type: "emoji", emoji: "💖", x: 48, y: 76, size: 16, anim: "blink", delay: 0.781, dur: 1.17 },
      { type: "emoji", emoji: "✨", x: 38, y: 43, size: 17, anim: "blink", delay: 0.555, dur: 1.1 }
    ],
  },
  crab_food_19_465: {
    v: 1,
    loop: 2.88,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ff5722", opacity: 0.67, anim: "float", dur: 2.98, w: 102.81, h: 18.13 },
      { type: "emoji", emoji: "🦀", x: 62, y: 54, size: 44, anim: "float", dur: 2.87 },
      { type: "emoji", emoji: "🎉", x: 89, y: 67, size: 13, anim: "blink", delay: 0.425, dur: 2.23 },
      { type: "emoji", emoji: "✨", x: 78, y: 65, size: 24, anim: "blink", delay: 1.101, dur: 1.75 },
      { type: "emoji", emoji: "💫", x: 23, y: 31, size: 11, anim: "blink", delay: 0.87, dur: 1.82 },
      { type: "emoji", emoji: "🌟", x: 15, y: 20, size: 10, anim: "blink", delay: 1.515, dur: 1.08 }
    ],
  },
  crab_space_19_466: {
    v: 1,
    loop: 2.74,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 65, y: 48, size: 38, anim: "wave", dur: 1.68 },
      { type: "emoji", emoji: "👑", x: 51, y: 13, size: 31, anim: "bounce", delay: 0.304, dur: 1.98 },
      { type: "emoji", emoji: "💎", x: 71, y: 38, size: 24, anim: "float", delay: 0.448, dur: 1.63 },
      { type: "emoji", emoji: "🎉", x: 19, y: 52, size: 18, anim: "wiggle", delay: 0.237, dur: 1.77 },
      { type: "emoji", emoji: "🔥", x: 43, y: 16, size: 14, anim: "float", delay: 1.081, dur: 1.49 },
      { type: "emoji", emoji: "🌊", x: 28, y: 53, size: 20, anim: "pop", delay: 1.337, dur: 1.32 },
      { type: "emoji", emoji: "✨", x: 35, y: 23, size: 16, anim: "blink", delay: 1.03, dur: 1.88 },
      { type: "emoji", emoji: "🌟", x: 53, y: 79, size: 17, anim: "blink", delay: 0.948, dur: 1.01 }
    ],
  },
  crab_fantasy_19_467: {
    v: 1,
    loop: 1.76,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ab47bc", opacity: 0.54, anim: "bounce", dur: 1.51, w: 93.37, h: 21.51 },
      { type: "emoji", emoji: "🦀", x: 55, y: 45, size: 38, anim: "bounce", dur: 1.55 },
      { type: "emoji", emoji: "👑", x: 51, y: 14, size: 33, anim: "bounce", delay: 0.541, dur: 1.78 },
      { type: "emoji", emoji: "🍪", x: 73, y: 44, size: 24, anim: "blink", delay: 0.698, dur: 1.56 },
      { type: "emoji", emoji: "🌟", x: 15, y: 74, size: 12, anim: "wiggle", delay: 1.133, dur: 1.56 },
      { type: "emoji", emoji: "💫", x: 27, y: 17, size: 12, anim: "blink", delay: 1.325, dur: 1.97 },
      { type: "emoji", emoji: "⭐", x: 61, y: 30, size: 17, anim: "blink", delay: 1.887, dur: 1.15 }
    ],
  },
  crab_office_19_468: {
    v: 1,
    loop: 1.98,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fdd835", opacity: 0.48, anim: "wiggle", dur: 1.52, r: 42.15 },
      { type: "emoji", emoji: "🦀", x: 41, y: 53, size: 44, anim: "wiggle", dur: 1.51 },
      { type: "emoji", emoji: "🧢", x: 49, y: 14, size: 30, anim: "bounce", delay: 0.546, dur: 1.9 },
      { type: "emoji", emoji: "💌", x: 70, y: 41, size: 25, anim: "rise", delay: 0.515, dur: 1.63 },
      { type: "emoji", emoji: "🍂", x: 53, y: 87, size: 24, anim: "wiggle", delay: 0.596, dur: 1.86 },
      { type: "emoji", emoji: "🌸", x: 29, y: 38, size: 14, anim: "float", delay: 1.367, dur: 1.57 },
      { type: "emoji", emoji: "🌟", x: 64, y: 30, size: 18, anim: "pop", delay: 0.848, dur: 1.26 },
      { type: "emoji", emoji: "🌊", x: 23, y: 17, size: 24, anim: "wiggle", delay: 0.255, dur: 1.52 },
      { type: "emoji", emoji: "🎊", x: 31, y: 12, size: 25, anim: "pop", delay: 0.064, dur: 1.91 },
      { type: "emoji", emoji: "🌟", x: 15, y: 31, size: 16, anim: "blink", delay: 1.557, dur: 1.2 },
      { type: "emoji", emoji: "🌟", x: 81, y: 71, size: 19, anim: "blink", delay: 1.248, dur: 1.92 }
    ],
  },
  crab_fitness_19_469: {
    v: 1,
    loop: 4.21,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#3949ab", opacity: 0.66, anim: "breathe", dur: 3.38, r: 40.42 },
      { type: "emoji", emoji: "🦀", x: 32, y: 45, size: 35, anim: "breathe", dur: 3.46 },
      { type: "emoji", emoji: "🎉", x: 16, y: 63, size: 21, anim: "float", delay: 1.093, dur: 2.32 },
      { type: "emoji", emoji: "🎊", x: 53, y: 65, size: 25, anim: "pop", delay: 0.847, dur: 1.75 },
      { type: "emoji", emoji: "🌊", x: 60, y: 26, size: 18, anim: "pop", delay: 1.286, dur: 1.7 },
      { type: "emoji", emoji: "🌊", x: 53, y: 15, size: 18, anim: "pop", delay: 0.719, dur: 1.71 },
      { type: "emoji", emoji: "⭐", x: 61, y: 88, size: 22, anim: "float", delay: 0.586, dur: 2.35 },
      { type: "emoji", emoji: "🌟", x: 82, y: 30, size: 13, anim: "blink", delay: 1.763, dur: 1.24 },
      { type: "emoji", emoji: "🌟", x: 54, y: 19, size: 10, anim: "blink", delay: 1.748, dur: 1.33 }
    ],
  },
  crab_travel_19_470: {
    v: 1,
    loop: 2.77,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff9c4", opacity: 0.43, anim: "pulse", dur: 1.91, w: 97.05, h: 21.68 },
      { type: "emoji", emoji: "🦀", x: 30, y: 44, size: 38, anim: "pulse", dur: 2.01 },
      { type: "emoji", emoji: "🤠", x: 52, y: 14, size: 33, anim: "bounce", delay: 0.667, dur: 1.98 },
      { type: "emoji", emoji: "💎", x: 68, y: 40, size: 22, anim: "blink", delay: 0.951, dur: 1.96 },
      { type: "emoji", emoji: "🌟", x: 32, y: 78, size: 25, anim: "float", delay: 0.499, dur: 2.22 },
      { type: "emoji", emoji: "❤️", x: 17, y: 23, size: 22, anim: "wiggle", delay: 0.841, dur: 1.66 },
      { type: "emoji", emoji: "💫", x: 42, y: 43, size: 13, anim: "blink", delay: 1.374, dur: 1.93 },
      { type: "emoji", emoji: "💖", x: 84, y: 76, size: 15, anim: "blink", delay: 1.588, dur: 1.05 }
    ],
  },
  crab_art_19_471: {
    v: 1,
    loop: 2.51,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 48, y: 49, size: 35, anim: "pulse", dur: 2.32 },
      { type: "emoji", emoji: "🎓", x: 49, y: 16, size: 29, anim: "bounce", delay: 0.577, dur: 1.81 },
      { type: "emoji", emoji: "⭐", x: 66, y: 50, size: 14, anim: "wiggle", delay: 1.294, dur: 1.34 },
      { type: "emoji", emoji: "🎈", x: 73, y: 32, size: 22, anim: "blink", delay: 0.124, dur: 1.65 },
      { type: "emoji", emoji: "💖", x: 81, y: 62, size: 14, anim: "blink", delay: 0.583, dur: 1.94 },
      { type: "emoji", emoji: "⭐", x: 21, y: 51, size: 18, anim: "blink", delay: 0.95, dur: 1.24 }
    ],
  },
  crab_science_19_472: {
    v: 1,
    loop: 3.07,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ffa726", opacity: 0.56, anim: "float", dur: 2.62, r: 40.97 },
      { type: "emoji", emoji: "🦀", x: 36, y: 47, size: 38, anim: "float", dur: 2.79 },
      { type: "emoji", emoji: "🧣", x: 50, y: 56, size: 25, anim: "bounce", delay: 0.611, dur: 1.62 },
      { type: "emoji", emoji: "🎁", x: 73, y: 38, size: 24, anim: "pop", delay: 0.761, dur: 1.87 },
      { type: "emoji", emoji: "🌟", x: 21, y: 73, size: 23, anim: "pop", delay: 1.442, dur: 2.4 },
      { type: "emoji", emoji: "🍃", x: 19, y: 29, size: 17, anim: "float", delay: 0.249, dur: 1.62 },
      { type: "emoji", emoji: "⭐", x: 84, y: 69, size: 12, anim: "blink", delay: 0.856, dur: 1.72 },
      { type: "emoji", emoji: "⭐", x: 48, y: 17, size: 12, anim: "blink", delay: 1.271, dur: 1.88 }
    ],
  },
  crab_pets_19_473: {
    v: 1,
    loop: 3.66,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#4caf50", opacity: 0.55, anim: "settle", dur: 2.76, w: 109.98, h: 18.07 },
      { type: "emoji", emoji: "🦀", x: 31, y: 55, size: 44, anim: "settle", dur: 3.08 },
      { type: "emoji", emoji: "🎉", x: 15, y: 45, size: 13, anim: "float", delay: 0.754, dur: 1.84 },
      { type: "emoji", emoji: "🎉", x: 62, y: 87, size: 20, anim: "rise", delay: 0.676, dur: 1.6 },
      { type: "emoji", emoji: "💖", x: 52, y: 23, size: 17, anim: "blink", delay: 0.508, dur: 1.73 },
      { type: "emoji", emoji: "⭐", x: 62, y: 61, size: 18, anim: "blink", delay: 1.699, dur: 1.62 }
    ],
  },
  crab_magic_19_474: {
    v: 1,
    loop: 2.23,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#5e35b1", opacity: 0.4, anim: "bounce", dur: 1.5, w: 99.19, h: 24.98 },
      { type: "emoji", emoji: "🦀", x: 38, y: 48, size: 38, anim: "bounce", dur: 1.31 },
      { type: "emoji", emoji: "⭐", x: 19, y: 47, size: 17, anim: "rise", delay: 1.341, dur: 1.3 },
      { type: "emoji", emoji: "🌸", x: 88, y: 28, size: 17, anim: "blink", delay: 0.727, dur: 1.76 },
      { type: "emoji", emoji: "🎈", x: 10, y: 82, size: 19, anim: "blink", delay: 0.149, dur: 2.03 },
      { type: "emoji", emoji: "🍂", x: 72, y: 33, size: 15, anim: "float", delay: 0.063, dur: 2.02 },
      { type: "emoji", emoji: "🌿", x: 39, y: 55, size: 19, anim: "blink", delay: 1.369, dur: 1.9 },
      { type: "emoji", emoji: "✨", x: 35, y: 63, size: 19, anim: "blink", delay: 1.96, dur: 1.63 },
      { type: "emoji", emoji: "⭐", x: 66, y: 47, size: 10, anim: "blink", delay: 0.923, dur: 1.66 }
    ],
  },
  crab_retro_19_475: {
    v: 1,
    loop: 3.07,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 56, y: 51, size: 35, anim: "twinkle", dur: 2.51 },
      { type: "emoji", emoji: "🌟", x: 72, y: 29, size: 25, anim: "pop", delay: 0.528, dur: 1.43 },
      { type: "emoji", emoji: "🌟", x: 56, y: 53, size: 25, anim: "rise", delay: 0.786, dur: 1.71 },
      { type: "emoji", emoji: "🌿", x: 48, y: 70, size: 18, anim: "pop", delay: 0.269, dur: 1.45 },
      { type: "emoji", emoji: "🔥", x: 48, y: 20, size: 14, anim: "pop", delay: 0.861, dur: 2 },
      { type: "emoji", emoji: "🔥", x: 17, y: 67, size: 18, anim: "float", delay: 0.069, dur: 2.15 },
      { type: "emoji", emoji: "⭐", x: 20, y: 50, size: 15, anim: "blink", delay: 0.945, dur: 1.82 },
      { type: "emoji", emoji: "⭐", x: 78, y: 22, size: 17, anim: "blink", delay: 1.314, dur: 1.15 }
    ],
  },
  crab_cyber_19_476: {
    v: 1,
    loop: 2.97,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 54, y: 47, size: 37, anim: "float", dur: 2.97 },
      { type: "emoji", emoji: "⭐", x: 69, y: 29, size: 22, anim: "blink", delay: 0.793, dur: 1.83 },
      { type: "emoji", emoji: "🎊", x: 45, y: 62, size: 16, anim: "pop", delay: 0.732, dur: 2.36 },
      { type: "emoji", emoji: "🎉", x: 25, y: 41, size: 21, anim: "rise", delay: 0.299, dur: 1.22 },
      { type: "emoji", emoji: "🎈", x: 31, y: 73, size: 16, anim: "wiggle", delay: 0.339, dur: 2.36 },
      { type: "emoji", emoji: "❤️", x: 83, y: 89, size: 19, anim: "wiggle", delay: 0.355, dur: 1.3 },
      { type: "emoji", emoji: "🌟", x: 39, y: 18, size: 16, anim: "blink", delay: 1.599, dur: 2 },
      { type: "emoji", emoji: "⭐", x: 20, y: 52, size: 13, anim: "blink", delay: 0.528, dur: 1.85 }
    ],
  },
  crab_nature_19_477: {
    v: 1,
    loop: 2.14,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ab47bc", opacity: 0.33, anim: "pop", dur: 1.59, w: 97.61, h: 21.49 },
      { type: "emoji", emoji: "🦀", x: 46, y: 53, size: 36, anim: "pop", dur: 1.65 },
      { type: "emoji", emoji: "🤠", x: 48, y: 13, size: 31, anim: "bounce", delay: 0.538, dur: 1.67 },
      { type: "emoji", emoji: "🌊", x: 27, y: 55, size: 25, anim: "rise", delay: 0.695, dur: 2.34 },
      { type: "emoji", emoji: "🍃", x: 16, y: 53, size: 20, anim: "wiggle", delay: 1.232, dur: 2.23 },
      { type: "emoji", emoji: "💖", x: 52, y: 67, size: 11, anim: "blink", delay: 1.227, dur: 1.98 },
      { type: "emoji", emoji: "💖", x: 74, y: 41, size: 11, anim: "blink", delay: 0.575, dur: 1.14 }
    ],
  },
  crab_underwater_19_478: {
    v: 1,
    loop: 2.9,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ffee58", opacity: 0.45, anim: "heartbeat", dur: 2.39, r: 43.97 },
      { type: "emoji", emoji: "🦀", x: 65, y: 52, size: 35, anim: "heartbeat", dur: 2.56 },
      { type: "emoji", emoji: "🌟", x: 26, y: 43, size: 16, anim: "blink", delay: 0.322, dur: 1.43 },
      { type: "emoji", emoji: "🌊", x: 69, y: 80, size: 24, anim: "pop", delay: 0.388, dur: 1.58 },
      { type: "emoji", emoji: "❤️", x: 29, y: 56, size: 22, anim: "float", delay: 1.146, dur: 1.97 },
      { type: "emoji", emoji: "⭐", x: 48, y: 81, size: 23, anim: "blink", delay: 1.077, dur: 1.84 },
      { type: "emoji", emoji: "💫", x: 67, y: 17, size: 16, anim: "blink", delay: 1.989, dur: 1.22 },
      { type: "emoji", emoji: "⭐", x: 48, y: 45, size: 12, anim: "blink", delay: 0.519, dur: 1.04 }
    ],
  },
  crab_sky_19_479: {
    v: 1,
    loop: 4.12,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e8eaf6", opacity: 0.52, anim: "float", dur: 3.45, r: 40.48 },
      { type: "emoji", emoji: "🦀", x: 68, y: 49, size: 35, anim: "float", dur: 3.46 },
      { type: "emoji", emoji: "👒", x: 51, y: 15, size: 35, anim: "bounce", delay: 0.417, dur: 1.92 },
      { type: "emoji", emoji: "🌟", x: 73, y: 25, size: 27, anim: "blink", delay: 0.584, dur: 1.91 },
      { type: "emoji", emoji: "💫", x: 84, y: 81, size: 16, anim: "pop", delay: 0.441, dur: 1.77 },
      { type: "emoji", emoji: "❤️", x: 20, y: 32, size: 23, anim: "blink", delay: 0.488, dur: 2.26 },
      { type: "emoji", emoji: "🍂", x: 85, y: 62, size: 16, anim: "float", delay: 0.572, dur: 1.43 },
      { type: "emoji", emoji: "✨", x: 66, y: 14, size: 23, anim: "float", delay: 0.052, dur: 1.27 },
      { type: "emoji", emoji: "🔥", x: 22, y: 77, size: 25, anim: "wiggle", delay: 1.25, dur: 1.24 },
      { type: "emoji", emoji: "🌟", x: 78, y: 21, size: 14, anim: "blink", delay: 0.534, dur: 1.7 },
      { type: "emoji", emoji: "✨", x: 55, y: 68, size: 10, anim: "blink", delay: 0.839, dur: 1.01 }
    ],
  },
  crab_party_20_480: {
    v: 1,
    loop: 3.08,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fff0f6", opacity: 0.47, anim: "float", dur: 2.96, r: 41.64 },
      { type: "emoji", emoji: "🦀", x: 39, y: 52, size: 34, anim: "float", dur: 2.85 },
      { type: "emoji", emoji: "👷", x: 49, y: 14, size: 30, anim: "bounce", delay: 0.451, dur: 1.91 },
      { type: "emoji", emoji: "🌟", x: 13, y: 58, size: 13, anim: "blink", delay: 1.185, dur: 1.8 },
      { type: "emoji", emoji: "🌿", x: 18, y: 63, size: 23, anim: "pop", delay: 0.344, dur: 1.79 },
      { type: "emoji", emoji: "✨", x: 36, y: 44, size: 14, anim: "blink", delay: 1.082, dur: 1.23 },
      { type: "emoji", emoji: "💫", x: 44, y: 14, size: 25, anim: "blink", delay: 0.688, dur: 1.89 },
      { type: "emoji", emoji: "🌿", x: 26, y: 66, size: 24, anim: "pop", delay: 1.001, dur: 2.28 },
      { type: "emoji", emoji: "🌟", x: 30, y: 21, size: 13, anim: "blink", delay: 0.633, dur: 1.55 },
      { type: "emoji", emoji: "🌟", x: 79, y: 76, size: 17, anim: "blink", delay: 0.909, dur: 1.92 }
    ],
  },
  crab_beach_20_481: {
    v: 1,
    loop: 2.73,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#039be5", opacity: 0.32, anim: "wave", dur: 1.71, r: 46.18 },
      { type: "emoji", emoji: "🦀", x: 40, y: 55, size: 35, anim: "wave", dur: 1.72 },
      { type: "emoji", emoji: "🎈", x: 69, y: 25, size: 27, anim: "pop", delay: 0.919, dur: 1.93 },
      { type: "emoji", emoji: "💫", x: 22, y: 28, size: 15, anim: "pop", delay: 0.23, dur: 1.84 },
      { type: "emoji", emoji: "🍂", x: 46, y: 48, size: 22, anim: "wiggle", delay: 0.331, dur: 1.99 },
      { type: "emoji", emoji: "💫", x: 80, y: 51, size: 14, anim: "wiggle", delay: 0.059, dur: 1.28 },
      { type: "emoji", emoji: "🎊", x: 17, y: 50, size: 16, anim: "rise", delay: 1.353, dur: 2.06 },
      { type: "emoji", emoji: "🌟", x: 80, y: 83, size: 19, anim: "blink", delay: 1.597, dur: 1.23 },
      { type: "emoji", emoji: "⭐", x: 69, y: 65, size: 17, anim: "blink", delay: 0.7, dur: 1.14 }
    ],
  },
  crab_winter_20_482: {
    v: 1,
    loop: 1.99,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 65, y: 48, size: 33, anim: "bounce", dur: 1.45 },
      { type: "emoji", emoji: "🧣", x: 50, y: 58, size: 24, anim: "bounce", delay: 0.366, dur: 1.55 },
      { type: "emoji", emoji: "🍰", x: 67, y: 43, size: 29, anim: "pop", delay: 0.817, dur: 1.54 },
      { type: "emoji", emoji: "🎊", x: 38, y: 79, size: 14, anim: "float", delay: 0.093, dur: 2.03 },
      { type: "emoji", emoji: "✨", x: 60, y: 35, size: 17, anim: "rise", delay: 0.74, dur: 1.66 },
      { type: "emoji", emoji: "⭐", x: 45, y: 33, size: 14, anim: "blink", delay: 1.68, dur: 1.98 },
      { type: "emoji", emoji: "🌟", x: 38, y: 66, size: 18, anim: "blink", delay: 1.711, dur: 1.39 }
    ],
  },
  crab_spring_20_483: {
    v: 1,
    loop: 2.36,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 61, y: 48, size: 35, anim: "wiggle", dur: 1.52 },
      { type: "emoji", emoji: "🍰", x: 67, y: 42, size: 29, anim: "float", delay: 0.477, dur: 1.78 },
      { type: "emoji", emoji: "💫", x: 62, y: 47, size: 21, anim: "rise", delay: 0.062, dur: 1.28 },
      { type: "emoji", emoji: "❤️", x: 55, y: 22, size: 15, anim: "rise", delay: 0.787, dur: 1.23 },
      { type: "emoji", emoji: "✨", x: 33, y: 76, size: 23, anim: "rise", delay: 1.281, dur: 1.63 },
      { type: "emoji", emoji: "✨", x: 79, y: 36, size: 10, anim: "blink", delay: 1.924, dur: 1.19 },
      { type: "emoji", emoji: "💫", x: 20, y: 79, size: 19, anim: "blink", delay: 1.757, dur: 1.16 }
    ],
  },
  crab_halloween_20_484: {
    v: 1,
    loop: 4.19,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#5e35b1", opacity: 0.6, anim: "breathe", dur: 3.73, r: 49.6 },
      { type: "emoji", emoji: "🦀", x: 62, y: 48, size: 33, anim: "breathe", dur: 3.56 },
      { type: "emoji", emoji: "🕶️", x: 50, y: 27, size: 28, anim: "bounce", delay: 0.657, dur: 1.97 },
      { type: "emoji", emoji: "🌿", x: 66, y: 87, size: 19, anim: "wiggle", delay: 1.473, dur: 1.2 },
      { type: "emoji", emoji: "🎉", x: 74, y: 28, size: 24, anim: "blink", delay: 0.526, dur: 2.35 },
      { type: "emoji", emoji: "🌸", x: 46, y: 78, size: 16, anim: "pop", delay: 0.927, dur: 1.31 },
      { type: "emoji", emoji: "🍃", x: 18, y: 33, size: 24, anim: "wiggle", delay: 0.532, dur: 2.11 },
      { type: "emoji", emoji: "❤️", x: 68, y: 42, size: 25, anim: "blink", delay: 0.134, dur: 1.79 },
      { type: "emoji", emoji: "⭐", x: 67, y: 54, size: 18, anim: "blink", delay: 1.447, dur: 1.97 },
      { type: "emoji", emoji: "💫", x: 47, y: 22, size: 10, anim: "blink", delay: 1.853, dur: 1.95 }
    ],
  },
  crab_christmas_20_485: {
    v: 1,
    loop: 3.01,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ffccbc", opacity: 0.66, anim: "pulse", dur: 2.15, w: 107.05, h: 25.56 },
      { type: "emoji", emoji: "🦀", x: 30, y: 46, size: 35, anim: "pulse", dur: 2.07 },
      { type: "emoji", emoji: "🌹", x: 68, y: 42, size: 27, anim: "float", delay: 0.879, dur: 1.76 },
      { type: "emoji", emoji: "⭐", x: 54, y: 36, size: 25, anim: "blink", delay: 0.612, dur: 2.17 },
      { type: "emoji", emoji: "🌿", x: 73, y: 59, size: 17, anim: "pop", delay: 1.463, dur: 1.88 },
      { type: "emoji", emoji: "✨", x: 28, y: 59, size: 23, anim: "wiggle", delay: 0.952, dur: 1.34 },
      { type: "emoji", emoji: "🌟", x: 18, y: 78, size: 17, anim: "blink", delay: 1.843, dur: 1.44 },
      { type: "emoji", emoji: "🌟", x: 43, y: 74, size: 14, anim: "blink", delay: 0.626, dur: 1.53 }
    ],
  },
  crab_coding_20_486: {
    v: 1,
    loop: 2.42,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f06292", opacity: 0.7, anim: "pulse", dur: 2.26, r: 48.3 },
      { type: "emoji", emoji: "🦀", x: 50, y: 49, size: 37, anim: "pulse", dur: 2.11 },
      { type: "emoji", emoji: "👷", x: 49, y: 17, size: 29, anim: "bounce", delay: 0.617, dur: 1.62 },
      { type: "emoji", emoji: "🌟", x: 75, y: 29, size: 26, anim: "pop", delay: 0.813, dur: 1.82 },
      { type: "emoji", emoji: "🌿", x: 71, y: 47, size: 12, anim: "rise", delay: 0.733, dur: 1.41 },
      { type: "emoji", emoji: "❄️", x: 25, y: 52, size: 13, anim: "rise", delay: 0.12, dur: 2.15 },
      { type: "emoji", emoji: "💫", x: 61, y: 25, size: 14, anim: "blink", delay: 1.298, dur: 1.8 },
      { type: "emoji", emoji: "💖", x: 49, y: 64, size: 17, anim: "blink", delay: 1.143, dur: 1.36 }
    ],
  },
  crab_music_20_487: {
    v: 1,
    loop: 2.77,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 46, y: 50, size: 36, anim: "float", dur: 2.91 },
      { type: "emoji", emoji: "👑", x: 52, y: 12, size: 30, anim: "bounce", delay: 0.556, dur: 1.91 },
      { type: "emoji", emoji: "🌟", x: 75, y: 26, size: 24, anim: "pop", delay: 0.576, dur: 2 },
      { type: "emoji", emoji: "✨", x: 65, y: 52, size: 15, anim: "float", delay: 0.023, dur: 1.4 },
      { type: "emoji", emoji: "🍂", x: 60, y: 22, size: 22, anim: "pop", delay: 1.405, dur: 1.79 },
      { type: "emoji", emoji: "✨", x: 64, y: 76, size: 19, anim: "blink", delay: 1.825, dur: 1.74 },
      { type: "emoji", emoji: "✨", x: 18, y: 79, size: 10, anim: "blink", delay: 0.735, dur: 1.04 }
    ],
  },
  crab_sports_20_488: {
    v: 1,
    loop: 3.74,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 63, y: 45, size: 40, anim: "settle", dur: 2.9 },
      { type: "emoji", emoji: "👷", x: 50, y: 17, size: 29, anim: "bounce", delay: 0.321, dur: 1.52 },
      { type: "emoji", emoji: "🍭", x: 71, y: 38, size: 24, anim: "rise", delay: 0.86, dur: 1.71 },
      { type: "emoji", emoji: "❄️", x: 48, y: 52, size: 17, anim: "pop", delay: 0.815, dur: 1.45 },
      { type: "emoji", emoji: "🌟", x: 46, y: 85, size: 13, anim: "rise", delay: 1.364, dur: 1.95 },
      { type: "emoji", emoji: "🌟", x: 53, y: 23, size: 14, anim: "blink", delay: 0.514, dur: 1.48 },
      { type: "emoji", emoji: "💫", x: 71, y: 17, size: 13, anim: "blink", delay: 1.757, dur: 1.04 }
    ],
  },
  crab_food_20_489: {
    v: 1,
    loop: 2.1,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#3949ab", opacity: 0.45, anim: "bounce", dur: 1.08, w: 107.17, h: 20.2 },
      { type: "emoji", emoji: "🦀", x: 43, y: 48, size: 35, anim: "bounce", dur: 1.15 },
      { type: "emoji", emoji: "🎈", x: 70, y: 30, size: 27, anim: "pop", delay: 0.505, dur: 1.92 },
      { type: "emoji", emoji: "🍃", x: 23, y: 57, size: 24, anim: "blink", delay: 0.468, dur: 1.39 },
      { type: "emoji", emoji: "🌸", x: 86, y: 56, size: 20, anim: "wiggle", delay: 1.093, dur: 2.16 },
      { type: "emoji", emoji: "🌸", x: 72, y: 24, size: 24, anim: "blink", delay: 0.883, dur: 2.14 },
      { type: "emoji", emoji: "🌿", x: 37, y: 34, size: 15, anim: "rise", delay: 0.481, dur: 1.54 },
      { type: "emoji", emoji: "✨", x: 77, y: 19, size: 16, anim: "blink", delay: 0.922, dur: 1.08 },
      { type: "emoji", emoji: "🌟", x: 66, y: 22, size: 13, anim: "blink", delay: 0.903, dur: 1.35 }
    ],
  },
  crab_space_20_490: {
    v: 1,
    loop: 2.83,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 48, y: 46, size: 38, anim: "twinkle", dur: 2.47 },
      { type: "emoji", emoji: "🌻", x: 70, y: 43, size: 26, anim: "rise", delay: 0.702, dur: 1.41 },
      { type: "emoji", emoji: "🌿", x: 65, y: 39, size: 22, anim: "blink", delay: 0.42, dur: 1.25 },
      { type: "emoji", emoji: "❤️", x: 64, y: 42, size: 25, anim: "rise", delay: 0.95, dur: 2.04 },
      { type: "emoji", emoji: "🔥", x: 89, y: 54, size: 19, anim: "rise", delay: 0.669, dur: 1.96 },
      { type: "emoji", emoji: "⭐", x: 22, y: 26, size: 10, anim: "blink", delay: 1.635, dur: 1.94 },
      { type: "emoji", emoji: "🌟", x: 58, y: 53, size: 19, anim: "blink", delay: 1.224, dur: 1.8 }
    ],
  },
  crab_fantasy_20_491: {
    v: 1,
    loop: 3.15,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 44, y: 49, size: 39, anim: "float", dur: 2.86 },
      { type: "emoji", emoji: "🧢", x: 51, y: 17, size: 29, anim: "bounce", delay: 0.472, dur: 1.79 },
      { type: "emoji", emoji: "🍫", x: 68, y: 46, size: 26, anim: "float", delay: 0.924, dur: 1.48 },
      { type: "emoji", emoji: "❄️", x: 51, y: 88, size: 24, anim: "wiggle", delay: 1.2, dur: 2.21 },
      { type: "emoji", emoji: "🌿", x: 48, y: 87, size: 14, anim: "rise", delay: 1.217, dur: 2.08 },
      { type: "emoji", emoji: "🎉", x: 45, y: 30, size: 20, anim: "pop", delay: 0.643, dur: 2.33 },
      { type: "emoji", emoji: "🌿", x: 14, y: 56, size: 14, anim: "rise", delay: 0.033, dur: 1.98 },
      { type: "emoji", emoji: "🍃", x: 51, y: 84, size: 12, anim: "float", delay: 0.082, dur: 2.25 },
      { type: "emoji", emoji: "✨", x: 31, y: 80, size: 12, anim: "blink", delay: 0.922, dur: 1.46 },
      { type: "emoji", emoji: "⭐", x: 39, y: 71, size: 17, anim: "blink", delay: 1.827, dur: 1.02 }
    ],
  },
  crab_office_20_492: {
    v: 1,
    loop: 2.04,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ffa726", opacity: 0.51, anim: "pop", dur: 1.5, r: 49.44 },
      { type: "emoji", emoji: "🦀", x: 65, y: 55, size: 34, anim: "pop", dur: 1.49 },
      { type: "emoji", emoji: "🌻", x: 69, y: 40, size: 28, anim: "float", delay: 0.836, dur: 1.54 },
      { type: "emoji", emoji: "💖", x: 74, y: 65, size: 13, anim: "rise", delay: 1.363, dur: 1.66 },
      { type: "emoji", emoji: "🎈", x: 32, y: 87, size: 17, anim: "float", delay: 1.349, dur: 1.47 },
      { type: "emoji", emoji: "💖", x: 62, y: 63, size: 12, anim: "blink", delay: 0.562, dur: 1.86 },
      { type: "emoji", emoji: "⭐", x: 50, y: 47, size: 16, anim: "blink", delay: 1.523, dur: 1.3 }
    ],
  },
  crab_fitness_20_493: {
    v: 1,
    loop: 3.02,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 37, y: 48, size: 36, anim: "heartbeat", dur: 2.56 },
      { type: "emoji", emoji: "🎩", x: 49, y: 12, size: 33, anim: "bounce", delay: 0.339, dur: 1.5 },
      { type: "emoji", emoji: "🍩", x: 70, y: 39, size: 24, anim: "pop", delay: 0.524, dur: 1.87 },
      { type: "emoji", emoji: "🌊", x: 84, y: 48, size: 19, anim: "float", delay: 1.22, dur: 1.6 },
      { type: "emoji", emoji: "✨", x: 64, y: 17, size: 12, anim: "float", delay: 0.772, dur: 1.28 },
      { type: "emoji", emoji: "💫", x: 22, y: 53, size: 19, anim: "blink", delay: 1.084, dur: 1.56 },
      { type: "emoji", emoji: "💖", x: 59, y: 27, size: 14, anim: "blink", delay: 1.991, dur: 1.34 }
    ],
  },
  crab_travel_20_494: {
    v: 1,
    loop: 4.2,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 56, y: 53, size: 41, anim: "float", dur: 3.35 },
      { type: "emoji", emoji: "🧙", x: 51, y: 13, size: 33, anim: "bounce", delay: 0.588, dur: 1.93 },
      { type: "emoji", emoji: "💌", x: 67, y: 39, size: 24, anim: "pop", delay: 0.58, dur: 1.74 },
      { type: "emoji", emoji: "🍃", x: 74, y: 55, size: 14, anim: "pop", delay: 1.199, dur: 1.79 },
      { type: "emoji", emoji: "💖", x: 27, y: 40, size: 22, anim: "pop", delay: 1.062, dur: 2.14 },
      { type: "emoji", emoji: "💫", x: 70, y: 27, size: 19, anim: "blink", delay: 1.667, dur: 1.32 },
      { type: "emoji", emoji: "✨", x: 67, y: 19, size: 16, anim: "blink", delay: 1.976, dur: 1.34 }
    ],
  },
  crab_art_20_495: {
    v: 1,
    loop: 3.05,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ff8a65", opacity: 0.36, anim: "float", dur: 2.86, w: 101.81, h: 21.68 },
      { type: "emoji", emoji: "🦀", x: 37, y: 54, size: 32, anim: "float", dur: 2.98 },
      { type: "emoji", emoji: "👒", x: 49, y: 15, size: 32, anim: "bounce", delay: 0.415, dur: 1.55 },
      { type: "emoji", emoji: "🎈", x: 69, y: 31, size: 29, anim: "rise", delay: 0.712, dur: 1.69 },
      { type: "emoji", emoji: "🌸", x: 61, y: 15, size: 23, anim: "float", delay: 0.914, dur: 1.73 },
      { type: "emoji", emoji: "🌿", x: 83, y: 70, size: 14, anim: "wiggle", delay: 1.342, dur: 1.46 },
      { type: "emoji", emoji: "❤️", x: 39, y: 24, size: 21, anim: "pop", delay: 0.095, dur: 2.27 },
      { type: "emoji", emoji: "⭐", x: 59, y: 46, size: 17, anim: "blink", delay: 1.754, dur: 1.39 },
      { type: "emoji", emoji: "⭐", x: 74, y: 24, size: 12, anim: "blink", delay: 1.567, dur: 1.53 }
    ],
  },
  crab_science_20_496: {
    v: 1,
    loop: 2.26,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#d81b60", opacity: 0.65, anim: "wave", dur: 1.85, w: 97.91, h: 19.27 },
      { type: "emoji", emoji: "🦀", x: 54, y: 48, size: 41, anim: "wave", dur: 1.94 },
      { type: "emoji", emoji: "🍰", x: 70, y: 40, size: 28, anim: "float", delay: 0.841, dur: 1.45 },
      { type: "emoji", emoji: "🌿", x: 87, y: 51, size: 23, anim: "pop", delay: 0.756, dur: 2.21 },
      { type: "emoji", emoji: "🍂", x: 55, y: 86, size: 14, anim: "rise", delay: 1.085, dur: 1.82 },
      { type: "emoji", emoji: "💖", x: 75, y: 37, size: 17, anim: "blink", delay: 1.31, dur: 1.51 },
      { type: "emoji", emoji: "💖", x: 68, y: 44, size: 16, anim: "blink", delay: 1.341, dur: 1.06 }
    ],
  },
  crab_pets_20_497: {
    v: 1,
    loop: 2.14,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 53, y: 46, size: 39, anim: "bounce", dur: 1.36 },
      { type: "emoji", emoji: "🧙", x: 52, y: 11, size: 34, anim: "bounce", delay: 0.414, dur: 1.69 },
      { type: "emoji", emoji: "🌸", x: 68, y: 44, size: 27, anim: "rise", delay: 0.57, dur: 1.56 },
      { type: "emoji", emoji: "✨", x: 44, y: 70, size: 15, anim: "wiggle", delay: 1.426, dur: 2.12 },
      { type: "emoji", emoji: "💖", x: 78, y: 67, size: 17, anim: "float", delay: 0.202, dur: 1.93 },
      { type: "emoji", emoji: "✨", x: 57, y: 38, size: 12, anim: "blink", delay: 1.627, dur: 1.09 },
      { type: "emoji", emoji: "💖", x: 52, y: 83, size: 14, anim: "blink", delay: 0.757, dur: 1.52 }
    ],
  },
  crab_magic_20_498: {
    v: 1,
    loop: 2.24,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fdd835", opacity: 0.37, anim: "wiggle", dur: 1.18, r: 43.61 },
      { type: "emoji", emoji: "🦀", x: 49, y: 48, size: 34, anim: "wiggle", dur: 1.45 },
      { type: "emoji", emoji: "🤠", x: 50, y: 13, size: 32, anim: "bounce", delay: 0.657, dur: 1.98 },
      { type: "emoji", emoji: "🍦", x: 68, y: 44, size: 27, anim: "rise", delay: 0.799, dur: 1.45 },
      { type: "emoji", emoji: "🌊", x: 20, y: 50, size: 17, anim: "pop", delay: 1.286, dur: 2.31 },
      { type: "emoji", emoji: "🎊", x: 20, y: 40, size: 12, anim: "float", delay: 0.454, dur: 2.18 },
      { type: "emoji", emoji: "❤️", x: 41, y: 17, size: 22, anim: "blink", delay: 0.964, dur: 2.32 },
      { type: "emoji", emoji: "❄️", x: 52, y: 28, size: 21, anim: "float", delay: 0.674, dur: 1.49 },
      { type: "emoji", emoji: "🌊", x: 84, y: 63, size: 18, anim: "rise", delay: 1.238, dur: 1.22 },
      { type: "emoji", emoji: "💫", x: 57, y: 23, size: 12, anim: "blink", delay: 0.605, dur: 1.77 },
      { type: "emoji", emoji: "✨", x: 76, y: 75, size: 11, anim: "blink", delay: 0.65, dur: 1.77 }
    ],
  },
  crab_retro_20_499: {
    v: 1,
    loop: 3.83,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#e8eaf6", opacity: 0.68, anim: "breathe", dur: 3.48, w: 106.52, h: 25.14 },
      { type: "emoji", emoji: "🦀", x: 59, y: 51, size: 33, anim: "breathe", dur: 3.63 },
      { type: "emoji", emoji: "🌟", x: 75, y: 25, size: 27, anim: "pop", delay: 0.683, dur: 1.98 },
      { type: "emoji", emoji: "✨", x: 28, y: 68, size: 12, anim: "wiggle", delay: 0.423, dur: 2.14 },
      { type: "emoji", emoji: "❤️", x: 25, y: 67, size: 21, anim: "pop", delay: 0.238, dur: 1.86 },
      { type: "emoji", emoji: "🌊", x: 28, y: 51, size: 13, anim: "pop", delay: 0.5, dur: 2.07 },
      { type: "emoji", emoji: "🎉", x: 29, y: 46, size: 13, anim: "float", delay: 1.225, dur: 2.29 },
      { type: "emoji", emoji: "⭐", x: 20, y: 41, size: 15, anim: "blink", delay: 1.158, dur: 1.4 },
      { type: "emoji", emoji: "⭐", x: 17, y: 38, size: 17, anim: "blink", delay: 1.988, dur: 1.43 }
    ],
  },
  crab_cyber_20_500: {
    v: 1,
    loop: 3.05,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff0f6", opacity: 0.37, anim: "pulse", dur: 2.13, w: 108.24, h: 24.16 },
      { type: "emoji", emoji: "🦀", x: 56, y: 49, size: 43, anim: "pulse", dur: 1.93 },
      { type: "emoji", emoji: "🍳", x: 49, y: 18, size: 28, anim: "bounce", delay: 0.362, dur: 1.57 },
      { type: "emoji", emoji: "🍃", x: 82, y: 75, size: 23, anim: "wiggle", delay: 0.437, dur: 1.83 },
      { type: "emoji", emoji: "💖", x: 21, y: 85, size: 21, anim: "pop", delay: 0.086, dur: 1.67 },
      { type: "emoji", emoji: "🎉", x: 40, y: 40, size: 19, anim: "blink", delay: 0.04, dur: 1.84 },
      { type: "emoji", emoji: "✨", x: 17, y: 36, size: 14, anim: "pop", delay: 0.22, dur: 1.21 },
      { type: "emoji", emoji: "💫", x: 17, y: 79, size: 11, anim: "blink", delay: 1.829, dur: 1.13 },
      { type: "emoji", emoji: "✨", x: 68, y: 67, size: 13, anim: "blink", delay: 1.304, dur: 1.46 }
    ],
  },
  crab_nature_20_501: {
    v: 1,
    loop: 2.52,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 62, y: 52, size: 33, anim: "pulse", dur: 2.33 },
      { type: "emoji", emoji: "🧙", x: 50, y: 12, size: 35, anim: "bounce", delay: 0.56, dur: 1.67 },
      { type: "emoji", emoji: "❤️", x: 74, y: 30, size: 13, anim: "pop", delay: 0.986, dur: 1.69 },
      { type: "emoji", emoji: "💖", x: 82, y: 36, size: 16, anim: "rise", delay: 0.488, dur: 1.74 },
      { type: "emoji", emoji: "🍂", x: 35, y: 85, size: 17, anim: "rise", delay: 0.406, dur: 1.36 },
      { type: "emoji", emoji: "🍃", x: 44, y: 69, size: 25, anim: "float", delay: 1.299, dur: 2.15 },
      { type: "emoji", emoji: "🌿", x: 55, y: 18, size: 21, anim: "pop", delay: 0.147, dur: 1.73 },
      { type: "emoji", emoji: "⭐", x: 69, y: 73, size: 11, anim: "blink", delay: 0.827, dur: 1.76 },
      { type: "emoji", emoji: "🌟", x: 29, y: 31, size: 18, anim: "blink", delay: 1.96, dur: 1.86 }
    ],
  },
  crab_underwater_20_502: {
    v: 1,
    loop: 2.89,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffa726", opacity: 0.55, anim: "float", dur: 2.95, r: 41.38 },
      { type: "emoji", emoji: "🦀", x: 49, y: 45, size: 39, anim: "float", dur: 2.66 },
      { type: "emoji", emoji: "🍭", x: 70, y: 37, size: 24, anim: "rise", delay: 0.964, dur: 1.74 },
      { type: "emoji", emoji: "🎈", x: 10, y: 10, size: 24, anim: "blink", delay: 0.414, dur: 1.87 },
      { type: "emoji", emoji: "🌊", x: 59, y: 67, size: 14, anim: "float", delay: 0.2, dur: 1.4 },
      { type: "emoji", emoji: "💫", x: 70, y: 60, size: 16, anim: "blink", delay: 1.893, dur: 1.41 },
      { type: "emoji", emoji: "💫", x: 83, y: 74, size: 17, anim: "blink", delay: 1.341, dur: 1.67 }
    ],
  },
  crab_sky_20_503: {
    v: 1,
    loop: 3.6,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 41, y: 53, size: 38, anim: "settle", dur: 3.12 },
      { type: "emoji", emoji: "👑", x: 52, y: 16, size: 33, anim: "bounce", delay: 0.549, dur: 1.88 },
      { type: "emoji", emoji: "💝", x: 68, y: 40, size: 27, anim: "pop", delay: 0.864, dur: 1.41 },
      { type: "emoji", emoji: "🌟", x: 55, y: 55, size: 12, anim: "pop", delay: 1.485, dur: 2.24 },
      { type: "emoji", emoji: "💖", x: 83, y: 44, size: 20, anim: "wiggle", delay: 1.035, dur: 1.48 },
      { type: "emoji", emoji: "🌸", x: 18, y: 10, size: 14, anim: "float", delay: 0.698, dur: 1.81 },
      { type: "emoji", emoji: "⭐", x: 47, y: 57, size: 25, anim: "pop", delay: 0.186, dur: 2.15 },
      { type: "emoji", emoji: "🍂", x: 21, y: 35, size: 23, anim: "pop", delay: 0.56, dur: 2.02 },
      { type: "emoji", emoji: "💫", x: 59, y: 25, size: 13, anim: "blink", delay: 0.71, dur: 1.77 },
      { type: "emoji", emoji: "💖", x: 28, y: 83, size: 11, anim: "blink", delay: 0.748, dur: 1.64 }
    ],
  },
  crab_party_21_504: {
    v: 1,
    loop: 1.86,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#9575cd", opacity: 0.67, anim: "bounce", dur: 1.49, w: 102.69, h: 20.16 },
      { type: "emoji", emoji: "🦀", x: 52, y: 50, size: 37, anim: "bounce", dur: 1.17 },
      { type: "emoji", emoji: "🤠", x: 49, y: 13, size: 31, anim: "bounce", delay: 0.495, dur: 1.73 },
      { type: "emoji", emoji: "🍭", x: 72, y: 38, size: 25, anim: "float", delay: 0.4, dur: 1.97 },
      { type: "emoji", emoji: "💫", x: 33, y: 87, size: 22, anim: "wiggle", delay: 0.139, dur: 1.36 },
      { type: "emoji", emoji: "❤️", x: 79, y: 43, size: 19, anim: "blink", delay: 1.357, dur: 1.84 },
      { type: "emoji", emoji: "💖", x: 18, y: 61, size: 19, anim: "pop", delay: 0.589, dur: 1.73 },
      { type: "emoji", emoji: "🎊", x: 82, y: 36, size: 16, anim: "wiggle", delay: 0.043, dur: 1.74 },
      { type: "emoji", emoji: "🍂", x: 21, y: 75, size: 12, anim: "blink", delay: 1.345, dur: 1.47 },
      { type: "emoji", emoji: "🌟", x: 56, y: 68, size: 16, anim: "blink", delay: 1.688, dur: 1.66 },
      { type: "emoji", emoji: "✨", x: 65, y: 65, size: 16, anim: "blink", delay: 0.89, dur: 1.67 }
    ],
  },
  crab_beach_21_505: {
    v: 1,
    loop: 3.14,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffccbc", opacity: 0.31, anim: "twinkle", dur: 2.64, r: 49.42 },
      { type: "emoji", emoji: "🦀", x: 31, y: 54, size: 38, anim: "twinkle", dur: 2.64 },
      { type: "emoji", emoji: "❄️", x: 78, y: 61, size: 15, anim: "rise", delay: 0.449, dur: 1.87 },
      { type: "emoji", emoji: "✨", x: 57, y: 25, size: 13, anim: "wiggle", delay: 1.053, dur: 1.22 },
      { type: "emoji", emoji: "🎊", x: 23, y: 11, size: 25, anim: "pop", delay: 0.213, dur: 1.36 },
      { type: "emoji", emoji: "🌊", x: 77, y: 59, size: 13, anim: "rise", delay: 0.909, dur: 2.21 },
      { type: "emoji", emoji: "✨", x: 67, y: 74, size: 14, anim: "blink", delay: 1.675, dur: 1.38 },
      { type: "emoji", emoji: "💫", x: 42, y: 53, size: 10, anim: "blink", delay: 1.333, dur: 1.65 }
    ],
  },
  crab_winter_21_506: {
    v: 1,
    loop: 3.28,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 31, y: 47, size: 35, anim: "float", dur: 2.98 },
      { type: "emoji", emoji: "🎁", x: 74, y: 39, size: 26, anim: "pop", delay: 0.597, dur: 1.96 },
      { type: "emoji", emoji: "💖", x: 26, y: 41, size: 13, anim: "rise", delay: 0.451, dur: 2.31 },
      { type: "emoji", emoji: "🎉", x: 22, y: 38, size: 20, anim: "pop", delay: 0.241, dur: 2.39 },
      { type: "emoji", emoji: "💫", x: 29, y: 46, size: 20, anim: "float", delay: 1.141, dur: 1.54 },
      { type: "emoji", emoji: "🎊", x: 50, y: 18, size: 16, anim: "rise", delay: 0.358, dur: 1.59 },
      { type: "emoji", emoji: "🌟", x: 74, y: 52, size: 14, anim: "blink", delay: 0.618, dur: 1.67 },
      { type: "emoji", emoji: "💫", x: 19, y: 47, size: 18, anim: "blink", delay: 1.536, dur: 1.31 }
    ],
  },
  crab_spring_21_507: {
    v: 1,
    loop: 2.11,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 46, y: 48, size: 39, anim: "pop", dur: 1.73 },
      { type: "emoji", emoji: "👷", x: 50, y: 15, size: 31, anim: "bounce", delay: 0.607, dur: 1.96 },
      { type: "emoji", emoji: "🎉", x: 22, y: 73, size: 21, anim: "pop", delay: 1.458, dur: 1.86 },
      { type: "emoji", emoji: "💫", x: 23, y: 50, size: 18, anim: "pop", delay: 1.315, dur: 2.14 },
      { type: "emoji", emoji: "🌟", x: 70, y: 79, size: 23, anim: "wiggle", delay: 0.738, dur: 2.34 },
      { type: "emoji", emoji: "🎉", x: 79, y: 62, size: 22, anim: "wiggle", delay: 1.37, dur: 1.62 },
      { type: "emoji", emoji: "🎈", x: 18, y: 48, size: 20, anim: "wiggle", delay: 1.247, dur: 1.29 },
      { type: "emoji", emoji: "💖", x: 34, y: 48, size: 18, anim: "blink", delay: 0.549, dur: 1.96 },
      { type: "emoji", emoji: "💫", x: 43, y: 68, size: 18, anim: "blink", delay: 1.025, dur: 1.18 }
    ],
  },
  crab_halloween_21_508: {
    v: 1,
    loop: 2.85,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff9c4", opacity: 0.34, anim: "heartbeat", dur: 2.31, w: 100.26, h: 19.94 },
      { type: "emoji", emoji: "🦀", x: 37, y: 44, size: 40, anim: "heartbeat", dur: 2.4 },
      { type: "emoji", emoji: "👑", x: 51, y: 13, size: 31, anim: "bounce", delay: 0.687, dur: 1.98 },
      { type: "emoji", emoji: "🌿", x: 79, y: 15, size: 18, anim: "pop", delay: 0.385, dur: 2.36 },
      { type: "emoji", emoji: "❤️", x: 39, y: 73, size: 15, anim: "pop", delay: 1.084, dur: 1.41 },
      { type: "emoji", emoji: "🍃", x: 44, y: 69, size: 14, anim: "blink", delay: 0.84, dur: 1.8 },
      { type: "emoji", emoji: "💫", x: 38, y: 68, size: 17, anim: "blink", delay: 0.965, dur: 1.73 },
      { type: "emoji", emoji: "✨", x: 23, y: 20, size: 14, anim: "blink", delay: 1.381, dur: 1.67 }
    ],
  },
  crab_christmas_21_509: {
    v: 1,
    loop: 3.8,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#9fa8da", opacity: 0.54, anim: "float", dur: 3.65, r: 47.48 },
      { type: "emoji", emoji: "🦀", x: 56, y: 55, size: 43, anim: "float", dur: 3.6 },
      { type: "emoji", emoji: "🧣", x: 51, y: 59, size: 27, anim: "bounce", delay: 0.56, dur: 1.68 },
      { type: "emoji", emoji: "🌸", x: 70, y: 41, size: 24, anim: "pop", delay: 0.764, dur: 1.74 },
      { type: "emoji", emoji: "🌊", x: 37, y: 75, size: 19, anim: "blink", delay: 0.865, dur: 1.48 },
      { type: "emoji", emoji: "🌿", x: 14, y: 38, size: 20, anim: "rise", delay: 0.482, dur: 1.46 },
      { type: "emoji", emoji: "🌟", x: 51, y: 51, size: 12, anim: "blink", delay: 0.985, dur: 1.23 },
      { type: "emoji", emoji: "⭐", x: 22, y: 53, size: 12, anim: "blink", delay: 1.525, dur: 1.53 }
    ],
  },
  crab_coding_21_510: {
    v: 1,
    loop: 2.95,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 32, y: 53, size: 40, anim: "float", dur: 3.09 },
      { type: "emoji", emoji: "🧢", x: 50, y: 18, size: 31, anim: "bounce", delay: 0.443, dur: 1.8 },
      { type: "emoji", emoji: "🍄", x: 70, y: 44, size: 25, anim: "pop", delay: 0.583, dur: 1.82 },
      { type: "emoji", emoji: "⭐", x: 89, y: 67, size: 13, anim: "blink", delay: 0.783, dur: 1.24 },
      { type: "emoji", emoji: "🍃", x: 75, y: 38, size: 22, anim: "wiggle", delay: 0.291, dur: 2.39 },
      { type: "emoji", emoji: "⭐", x: 53, y: 24, size: 15, anim: "wiggle", delay: 0.62, dur: 1.94 },
      { type: "emoji", emoji: "🍂", x: 63, y: 37, size: 19, anim: "blink", delay: 0.884, dur: 1.9 },
      { type: "emoji", emoji: "🌟", x: 64, y: 36, size: 17, anim: "blink", delay: 0.676, dur: 1.34 },
      { type: "emoji", emoji: "🌟", x: 60, y: 75, size: 15, anim: "blink", delay: 1.594, dur: 1.83 }
    ],
  },
  crab_music_21_511: {
    v: 1,
    loop: 2.68,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 57, y: 52, size: 37, anim: "wave", dur: 1.83 },
      { type: "emoji", emoji: "🍰", x: 70, y: 40, size: 29, anim: "rise", delay: 0.646, dur: 1.69 },
      { type: "emoji", emoji: "🎈", x: 20, y: 78, size: 18, anim: "wiggle", delay: 1.102, dur: 1.66 },
      { type: "emoji", emoji: "🍂", x: 48, y: 76, size: 25, anim: "rise", delay: 0.868, dur: 2.05 },
      { type: "emoji", emoji: "🌸", x: 70, y: 26, size: 19, anim: "wiggle", delay: 1.004, dur: 1.97 },
      { type: "emoji", emoji: "🌟", x: 82, y: 20, size: 15, anim: "blink", delay: 1.232, dur: 1.1 },
      { type: "emoji", emoji: "🌟", x: 76, y: 71, size: 12, anim: "blink", delay: 0.695, dur: 1.28 }
    ],
  },
  crab_sports_21_512: {
    v: 1,
    loop: 1.76,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 38, y: 56, size: 38, anim: "bounce", dur: 1.52 },
      { type: "emoji", emoji: "🕶️", x: 50, y: 27, size: 28, anim: "bounce", delay: 0.671, dur: 1.78 },
      { type: "emoji", emoji: "💌", x: 68, y: 41, size: 24, anim: "rise", delay: 0.953, dur: 1.51 },
      { type: "emoji", emoji: "🌊", x: 55, y: 67, size: 24, anim: "float", delay: 0.851, dur: 1.89 },
      { type: "emoji", emoji: "⭐", x: 65, y: 36, size: 23, anim: "blink", delay: 1.098, dur: 1.94 },
      { type: "emoji", emoji: "🌊", x: 56, y: 19, size: 23, anim: "pop", delay: 0.836, dur: 2.4 },
      { type: "emoji", emoji: "🍃", x: 60, y: 18, size: 13, anim: "float", delay: 1.065, dur: 1.9 },
      { type: "emoji", emoji: "💫", x: 23, y: 59, size: 15, anim: "blink", delay: 1.604, dur: 1.84 },
      { type: "emoji", emoji: "🌟", x: 57, y: 50, size: 17, anim: "blink", delay: 1.466, dur: 1.17 }
    ],
  },
  crab_food_21_513: {
    v: 1,
    loop: 2.38,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#66bb6a", opacity: 0.54, anim: "wiggle", dur: 1.3, w: 101.56, h: 20.45 },
      { type: "emoji", emoji: "🦀", x: 56, y: 55, size: 38, anim: "wiggle", dur: 1.26 },
      { type: "emoji", emoji: "🍬", x: 70, y: 42, size: 21, anim: "rise", delay: 0.7, dur: 1.75 },
      { type: "emoji", emoji: "🍂", x: 44, y: 41, size: 21, anim: "pop", delay: 0.112, dur: 1.91 },
      { type: "emoji", emoji: "✨", x: 15, y: 29, size: 24, anim: "float", delay: 0.721, dur: 2.07 },
      { type: "emoji", emoji: "🌟", x: 51, y: 49, size: 11, anim: "blink", delay: 1.636, dur: 1.94 },
      { type: "emoji", emoji: "✨", x: 16, y: 31, size: 19, anim: "blink", delay: 1.935, dur: 1.13 }
    ],
  },
  crab_space_21_514: {
    v: 1,
    loop: 4.1,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 30, y: 52, size: 41, anim: "breathe", dur: 3.59 },
      { type: "emoji", emoji: "👑", x: 51, y: 14, size: 31, anim: "bounce", delay: 0.575, dur: 1.61 },
      { type: "emoji", emoji: "🎉", x: 33, y: 81, size: 13, anim: "pop", delay: 0.061, dur: 1.44 },
      { type: "emoji", emoji: "🍂", x: 21, y: 72, size: 24, anim: "blink", delay: 0.583, dur: 1.83 },
      { type: "emoji", emoji: "🌸", x: 74, y: 46, size: 20, anim: "float", delay: 0.376, dur: 1.69 },
      { type: "emoji", emoji: "🌟", x: 35, y: 71, size: 17, anim: "blink", delay: 0.92, dur: 1.13 },
      { type: "emoji", emoji: "⭐", x: 60, y: 73, size: 18, anim: "blink", delay: 1.999, dur: 1.99 }
    ],
  },
  crab_fantasy_21_515: {
    v: 1,
    loop: 2.91,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 34, y: 45, size: 41, anim: "pulse", dur: 2.09 },
      { type: "emoji", emoji: "👮", x: 49, y: 14, size: 29, anim: "bounce", delay: 0.308, dur: 1.78 },
      { type: "emoji", emoji: "🍬", x: 69, y: 45, size: 23, anim: "float", delay: 0.595, dur: 1.67 },
      { type: "emoji", emoji: "🍃", x: 74, y: 12, size: 24, anim: "wiggle", delay: 0.731, dur: 2.03 },
      { type: "emoji", emoji: "🍂", x: 34, y: 47, size: 16, anim: "blink", delay: 0.236, dur: 2.21 },
      { type: "emoji", emoji: "❄️", x: 58, y: 61, size: 18, anim: "wiggle", delay: 0.569, dur: 1.72 },
      { type: "emoji", emoji: "✨", x: 15, y: 49, size: 14, anim: "blink", delay: 1.732, dur: 1.87 },
      { type: "emoji", emoji: "⭐", x: 72, y: 56, size: 11, anim: "blink", delay: 0.692, dur: 1.02 }
    ],
  },
  crab_office_21_516: {
    v: 1,
    loop: 2.54,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#c2185b", opacity: 0.56, anim: "pulse", dur: 2.34, r: 45.93 },
      { type: "emoji", emoji: "🦀", x: 62, y: 47, size: 39, anim: "pulse", dur: 2.18 },
      { type: "emoji", emoji: "🧣", x: 52, y: 59, size: 27, anim: "bounce", delay: 0.594, dur: 1.53 },
      { type: "emoji", emoji: "🍀", x: 73, y: 43, size: 22, anim: "rise", delay: 0.47, dur: 1.78 },
      { type: "emoji", emoji: "🍃", x: 30, y: 40, size: 12, anim: "pop", delay: 0.364, dur: 1.52 },
      { type: "emoji", emoji: "🎉", x: 29, y: 83, size: 23, anim: "wiggle", delay: 0.095, dur: 1.59 },
      { type: "emoji", emoji: "💫", x: 42, y: 76, size: 17, anim: "rise", delay: 1.29, dur: 1.35 },
      { type: "emoji", emoji: "💫", x: 64, y: 33, size: 18, anim: "blink", delay: 1.611, dur: 1.44 },
      { type: "emoji", emoji: "✨", x: 68, y: 23, size: 12, anim: "blink", delay: 0.999, dur: 1.27 }
    ],
  },
  crab_fitness_21_517: {
    v: 1,
    loop: 3.15,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 34, y: 52, size: 41, anim: "float", dur: 2.78 },
      { type: "emoji", emoji: "💝", x: 68, y: 40, size: 25, anim: "pop", delay: 0.544, dur: 1.54 },
      { type: "emoji", emoji: "✨", x: 38, y: 36, size: 23, anim: "float", delay: 1.101, dur: 2.33 },
      { type: "emoji", emoji: "✨", x: 69, y: 51, size: 18, anim: "blink", delay: 0.937, dur: 2.3 },
      { type: "emoji", emoji: "🌟", x: 53, y: 53, size: 16, anim: "blink", delay: 0.735, dur: 1.39 },
      { type: "emoji", emoji: "🎈", x: 54, y: 50, size: 23, anim: "blink", delay: 0.171, dur: 2.14 },
      { type: "emoji", emoji: "🌟", x: 43, y: 22, size: 13, anim: "blink", delay: 0.582, dur: 1.25 },
      { type: "emoji", emoji: "⭐", x: 20, y: 40, size: 15, anim: "blink", delay: 0.78, dur: 1.16 }
    ],
  },
  crab_travel_21_518: {
    v: 1,
    loop: 3.56,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 44, y: 44, size: 41, anim: "settle", dur: 2.98 },
      { type: "emoji", emoji: "🎀", x: 65, y: 28, size: 19, anim: "float", delay: 0.731, dur: 1.75 },
      { type: "emoji", emoji: "🔥", x: 48, y: 71, size: 15, anim: "blink", delay: 0.697, dur: 1.23 },
      { type: "emoji", emoji: "⭐", x: 26, y: 38, size: 15, anim: "blink", delay: 0.874, dur: 1.95 },
      { type: "emoji", emoji: "✨", x: 37, y: 74, size: 18, anim: "float", delay: 0.878, dur: 2.34 },
      { type: "emoji", emoji: "🌟", x: 16, y: 12, size: 20, anim: "pop", delay: 0.403, dur: 1.47 },
      { type: "emoji", emoji: "⭐", x: 41, y: 44, size: 13, anim: "rise", delay: 0.871, dur: 2.04 },
      { type: "emoji", emoji: "💫", x: 48, y: 22, size: 16, anim: "blink", delay: 1.097, dur: 1.69 },
      { type: "emoji", emoji: "🌟", x: 44, y: 15, size: 11, anim: "blink", delay: 1.359, dur: 1.48 }
    ],
  },
  crab_art_21_519: {
    v: 1,
    loop: 2.14,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#3f51b5", opacity: 0.39, anim: "bounce", dur: 1.41, w: 100.16, h: 27.49 },
      { type: "emoji", emoji: "🦀", x: 37, y: 45, size: 42, anim: "bounce", dur: 1.42 },
      { type: "emoji", emoji: "💝", x: 69, y: 41, size: 24, anim: "rise", delay: 0.828, dur: 1.88 },
      { type: "emoji", emoji: "⭐", x: 80, y: 47, size: 18, anim: "float", delay: 0.144, dur: 1.71 },
      { type: "emoji", emoji: "🎊", x: 60, y: 55, size: 21, anim: "rise", delay: 0.195, dur: 1.37 },
      { type: "emoji", emoji: "💫", x: 63, y: 32, size: 22, anim: "wiggle", delay: 0.505, dur: 2.29 },
      { type: "emoji", emoji: "🌸", x: 42, y: 56, size: 17, anim: "pop", delay: 1.173, dur: 1.9 },
      { type: "emoji", emoji: "🌟", x: 85, y: 87, size: 19, anim: "float", delay: 1.003, dur: 1.82 },
      { type: "emoji", emoji: "💫", x: 80, y: 32, size: 11, anim: "blink", delay: 1.872, dur: 1.72 },
      { type: "emoji", emoji: "🌟", x: 47, y: 51, size: 10, anim: "blink", delay: 1.079, dur: 1.56 }
    ],
  },
  crab_science_21_520: {
    v: 1,
    loop: 3.1,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f3e5f5", opacity: 0.7, anim: "twinkle", dur: 2.38, r: 40.46 },
      { type: "emoji", emoji: "🦀", x: 58, y: 47, size: 35, anim: "twinkle", dur: 2.6 },
      { type: "emoji", emoji: "🪖", x: 50, y: 15, size: 30, anim: "bounce", delay: 0.549, dur: 1.9 },
      { type: "emoji", emoji: "🌊", x: 64, y: 50, size: 24, anim: "float", delay: 1.18, dur: 1.95 },
      { type: "emoji", emoji: "🍃", x: 27, y: 21, size: 12, anim: "rise", delay: 0.455, dur: 2.07 },
      { type: "emoji", emoji: "✨", x: 62, y: 27, size: 11, anim: "blink", delay: 1.807, dur: 1.72 },
      { type: "emoji", emoji: "💫", x: 23, y: 33, size: 14, anim: "blink", delay: 0.796, dur: 1.41 }
    ],
  },
  crab_pets_21_521: {
    v: 1,
    loop: 3.37,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 35, y: 54, size: 40, anim: "float", dur: 3.06 },
      { type: "emoji", emoji: "🍂", x: 12, y: 16, size: 23, anim: "pop", delay: 0.425, dur: 1.82 },
      { type: "emoji", emoji: "🎉", x: 42, y: 62, size: 15, anim: "float", delay: 0.769, dur: 2.38 },
      { type: "emoji", emoji: "🌊", x: 64, y: 28, size: 16, anim: "rise", delay: 1.189, dur: 1.38 },
      { type: "emoji", emoji: "✨", x: 68, y: 74, size: 13, anim: "blink", delay: 1.151, dur: 1.02 },
      { type: "emoji", emoji: "💖", x: 23, y: 33, size: 16, anim: "blink", delay: 1.038, dur: 1.54 }
    ],
  },
  crab_magic_21_522: {
    v: 1,
    loop: 2.26,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 36, y: 49, size: 42, anim: "pop", dur: 1.57 },
      { type: "emoji", emoji: "👮", x: 50, y: 17, size: 29, anim: "bounce", delay: 0.665, dur: 1.79 },
      { type: "emoji", emoji: "💎", x: 71, y: 36, size: 22, anim: "rise", delay: 0.497, dur: 1.59 },
      { type: "emoji", emoji: "🔥", x: 36, y: 29, size: 15, anim: "blink", delay: 0.327, dur: 2.34 },
      { type: "emoji", emoji: "🌊", x: 62, y: 63, size: 19, anim: "float", delay: 0.991, dur: 1.74 },
      { type: "emoji", emoji: "💫", x: 56, y: 60, size: 19, anim: "wiggle", delay: 1.121, dur: 1.81 },
      { type: "emoji", emoji: "🍃", x: 54, y: 70, size: 25, anim: "wiggle", delay: 1.061, dur: 1.35 },
      { type: "emoji", emoji: "🌟", x: 48, y: 77, size: 21, anim: "blink", delay: 1.12, dur: 2 },
      { type: "emoji", emoji: "💫", x: 53, y: 29, size: 19, anim: "blink", delay: 0.938, dur: 1.28 },
      { type: "emoji", emoji: "⭐", x: 21, y: 83, size: 15, anim: "blink", delay: 1.488, dur: 1.94 }
    ],
  },
  crab_retro_21_523: {
    v: 1,
    loop: 2.8,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#66bb6a", opacity: 0.41, anim: "heartbeat", dur: 2.42, r: 48.03 },
      { type: "emoji", emoji: "🦀", x: 30, y: 53, size: 33, anim: "heartbeat", dur: 2.41 },
      { type: "emoji", emoji: "🌻", x: 67, y: 43, size: 27, anim: "float", delay: 0.405, dur: 1.5 },
      { type: "emoji", emoji: "🔥", x: 43, y: 82, size: 18, anim: "rise", delay: 0.921, dur: 1.82 },
      { type: "emoji", emoji: "✨", x: 82, y: 86, size: 19, anim: "wiggle", delay: 1.482, dur: 1.75 },
      { type: "emoji", emoji: "💫", x: 81, y: 78, size: 20, anim: "rise", delay: 0.582, dur: 1.38 },
      { type: "emoji", emoji: "⭐", x: 40, y: 56, size: 18, anim: "blink", delay: 1.958, dur: 1.6 },
      { type: "emoji", emoji: "✨", x: 72, y: 15, size: 16, anim: "blink", delay: 0.816, dur: 1.05 }
    ],
  },
  crab_cyber_21_524: {
    v: 1,
    loop: 3.88,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#5e35b1", opacity: 0.4, anim: "float", dur: 3.47, w: 99.14, h: 20.23 },
      { type: "emoji", emoji: "🦀", x: 31, y: 49, size: 40, anim: "float", dur: 3.63 },
      { type: "emoji", emoji: "🧣", x: 49, y: 58, size: 27, anim: "bounce", delay: 0.352, dur: 1.94 },
      { type: "emoji", emoji: "🌸", x: 62, y: 16, size: 15, anim: "blink", delay: 1.227, dur: 1.66 },
      { type: "emoji", emoji: "❄️", x: 48, y: 82, size: 20, anim: "pop", delay: 1.092, dur: 1.61 },
      { type: "emoji", emoji: "⭐", x: 53, y: 47, size: 18, anim: "blink", delay: 1.829, dur: 1.65 },
      { type: "emoji", emoji: "⭐", x: 81, y: 69, size: 15, anim: "blink", delay: 0.788, dur: 1.97 }
    ],
  },
  crab_nature_21_525: {
    v: 1,
    loop: 3.2,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#e64a19", opacity: 0.58, anim: "float", dur: 3.23, w: 99.35, h: 24.18 },
      { type: "emoji", emoji: "🦀", x: 49, y: 51, size: 43, anim: "float", dur: 2.98 },
      { type: "emoji", emoji: "👷", x: 48, y: 18, size: 29, anim: "bounce", delay: 0.366, dur: 1.9 },
      { type: "emoji", emoji: "🌹", x: 72, y: 40, size: 27, anim: "rise", delay: 0.605, dur: 1.48 },
      { type: "emoji", emoji: "💫", x: 56, y: 32, size: 16, anim: "rise", delay: 0.079, dur: 1.68 },
      { type: "emoji", emoji: "❄️", x: 11, y: 63, size: 20, anim: "wiggle", delay: 0.006, dur: 1.9 },
      { type: "emoji", emoji: "🌟", x: 13, y: 37, size: 23, anim: "wiggle", delay: 0.735, dur: 2.08 },
      { type: "emoji", emoji: "⭐", x: 67, y: 65, size: 16, anim: "blink", delay: 0.871, dur: 1.61 },
      { type: "emoji", emoji: "🌟", x: 51, y: 66, size: 10, anim: "blink", delay: 1.778, dur: 1.42 }
    ],
  },
  crab_underwater_21_526: {
    v: 1,
    loop: 2.75,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 45, y: 47, size: 43, anim: "wave", dur: 1.9 },
      { type: "emoji", emoji: "💖", x: 55, y: 72, size: 14, anim: "rise", delay: 0.708, dur: 2.26 },
      { type: "emoji", emoji: "🍂", x: 43, y: 87, size: 12, anim: "pop", delay: 0.006, dur: 1.97 },
      { type: "emoji", emoji: "🌊", x: 81, y: 81, size: 23, anim: "pop", delay: 1.444, dur: 2.22 },
      { type: "emoji", emoji: "🌟", x: 62, y: 31, size: 13, anim: "blink", delay: 1.955, dur: 1.26 },
      { type: "emoji", emoji: "💖", x: 58, y: 81, size: 13, anim: "blink", delay: 0.969, dur: 1.92 }
    ],
  },
  crab_sky_21_527: {
    v: 1,
    loop: 1.84,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#7b1fa2", opacity: 0.32, anim: "bounce", dur: 1.46, w: 90.59, h: 24.68 },
      { type: "emoji", emoji: "🦀", x: 66, y: 54, size: 43, anim: "bounce", dur: 1.48 },
      { type: "emoji", emoji: "👑", x: 49, y: 15, size: 28, anim: "bounce", delay: 0.338, dur: 1.99 },
      { type: "emoji", emoji: "🎊", x: 67, y: 42, size: 21, anim: "blink", delay: 1.07, dur: 2.15 },
      { type: "emoji", emoji: "🌿", x: 36, y: 14, size: 15, anim: "float", delay: 0.009, dur: 2.03 },
      { type: "emoji", emoji: "🌟", x: 19, y: 53, size: 15, anim: "blink", delay: 1.156, dur: 1.08 },
      { type: "emoji", emoji: "💖", x: 20, y: 58, size: 15, anim: "blink", delay: 0.599, dur: 1.75 }
    ],
  },
  crab_party_22_528: {
    v: 1,
    loop: 2.08,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fdd835", opacity: 0.53, anim: "wiggle", dur: 1.19, r: 45.78 },
      { type: "emoji", emoji: "🦀", x: 63, y: 54, size: 44, anim: "wiggle", dur: 1.38 },
      { type: "emoji", emoji: "🧙", x: 49, y: 12, size: 33, anim: "bounce", delay: 0.648, dur: 1.99 },
      { type: "emoji", emoji: "🌹", x: 72, y: 39, size: 27, anim: "rise", delay: 0.893, dur: 1.7 },
      { type: "emoji", emoji: "🔥", x: 82, y: 36, size: 12, anim: "pop", delay: 1.222, dur: 2.32 },
      { type: "emoji", emoji: "🌿", x: 61, y: 11, size: 17, anim: "pop", delay: 0.285, dur: 2.18 },
      { type: "emoji", emoji: "💖", x: 32, y: 79, size: 14, anim: "blink", delay: 0.641, dur: 1.75 },
      { type: "emoji", emoji: "🌟", x: 17, y: 60, size: 15, anim: "blink", delay: 1.012, dur: 1.69 }
    ],
  },
  crab_beach_22_529: {
    v: 1,
    loop: 4.08,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#3f51b5", opacity: 0.68, anim: "breathe", dur: 3.46, r: 42.4 },
      { type: "emoji", emoji: "🦀", x: 36, y: 45, size: 41, anim: "breathe", dur: 3.55 },
      { type: "emoji", emoji: "🕶️", x: 52, y: 29, size: 31, anim: "bounce", delay: 0.485, dur: 1.91 },
      { type: "emoji", emoji: "🎁", x: 71, y: 39, size: 24, anim: "blink", delay: 0.483, dur: 1.79 },
      { type: "emoji", emoji: "⭐", x: 57, y: 56, size: 12, anim: "float", delay: 0.446, dur: 1.59 },
      { type: "emoji", emoji: "🌟", x: 44, y: 66, size: 14, anim: "rise", delay: 1.317, dur: 1.68 },
      { type: "emoji", emoji: "✨", x: 52, y: 52, size: 16, anim: "float", delay: 0.919, dur: 1.6 },
      { type: "emoji", emoji: "⭐", x: 27, y: 78, size: 19, anim: "wiggle", delay: 1.321, dur: 1.26 },
      { type: "emoji", emoji: "💖", x: 62, y: 22, size: 10, anim: "blink", delay: 1.082, dur: 1.54 },
      { type: "emoji", emoji: "⭐", x: 76, y: 25, size: 14, anim: "blink", delay: 1.303, dur: 1.95 }
    ],
  },
  crab_winter_22_530: {
    v: 1,
    loop: 3.01,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#f3e5f5", opacity: 0.43, anim: "pulse", dur: 2.16, r: 40.24 },
      { type: "emoji", emoji: "🦀", x: 53, y: 47, size: 38, anim: "pulse", dur: 1.86 },
      { type: "emoji", emoji: "🧣", x: 50, y: 58, size: 24, anim: "bounce", delay: 0.464, dur: 1.69 },
      { type: "emoji", emoji: "💝", x: 73, y: 39, size: 24, anim: "rise", delay: 0.503, dur: 1.49 },
      { type: "emoji", emoji: "❤️", x: 66, y: 21, size: 12, anim: "rise", delay: 0.451, dur: 2.22 },
      { type: "emoji", emoji: "💫", x: 22, y: 14, size: 20, anim: "rise", delay: 0.65, dur: 1.4 },
      { type: "emoji", emoji: "🌸", x: 61, y: 15, size: 25, anim: "float", delay: 1.332, dur: 1.22 },
      { type: "emoji", emoji: "💖", x: 81, y: 27, size: 14, anim: "blink", delay: 0.77, dur: 1.18 },
      { type: "emoji", emoji: "🌟", x: 44, y: 25, size: 12, anim: "blink", delay: 1.368, dur: 1.41 }
    ],
  },
  crab_spring_22_531: {
    v: 1,
    loop: 2.63,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 58, y: 54, size: 44, anim: "pulse", dur: 2.33 },
      { type: "emoji", emoji: "👮", x: 51, y: 14, size: 31, anim: "bounce", delay: 0.505, dur: 1.55 },
      { type: "emoji", emoji: "🍩", x: 70, y: 42, size: 27, anim: "float", delay: 0.837, dur: 1.51 },
      { type: "emoji", emoji: "🎈", x: 28, y: 20, size: 15, anim: "pop", delay: 0.389, dur: 1.8 },
      { type: "emoji", emoji: "🌟", x: 67, y: 69, size: 25, anim: "blink", delay: 1.094, dur: 1.39 },
      { type: "emoji", emoji: "🍂", x: 64, y: 57, size: 24, anim: "pop", delay: 0.527, dur: 1.78 },
      { type: "emoji", emoji: "🌊", x: 37, y: 61, size: 19, anim: "float", delay: 1.449, dur: 1.75 },
      { type: "emoji", emoji: "💫", x: 33, y: 50, size: 24, anim: "blink", delay: 0.704, dur: 1.26 },
      { type: "emoji", emoji: "💫", x: 37, y: 15, size: 18, anim: "blink", delay: 1.408, dur: 1.52 },
      { type: "emoji", emoji: "🌟", x: 33, y: 32, size: 17, anim: "blink", delay: 1.079, dur: 1.98 }
    ],
  },
  crab_halloween_22_532: {
    v: 1,
    loop: 2.82,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffcc80", opacity: 0.45, anim: "float", dur: 2.98, w: 98.51, h: 25.41 },
      { type: "emoji", emoji: "🦀", x: 37, y: 50, size: 32, anim: "float", dur: 2.78 },
      { type: "emoji", emoji: "👒", x: 50, y: 15, size: 33, anim: "bounce", delay: 0.434, dur: 1.84 },
      { type: "emoji", emoji: "⭐", x: 65, y: 84, size: 18, anim: "rise", delay: 0.224, dur: 1.52 },
      { type: "emoji", emoji: "🍃", x: 21, y: 34, size: 12, anim: "float", delay: 1.129, dur: 1.86 },
      { type: "emoji", emoji: "💖", x: 45, y: 44, size: 19, anim: "blink", delay: 1.547, dur: 1.74 },
      { type: "emoji", emoji: "💖", x: 52, y: 29, size: 17, anim: "blink", delay: 1.826, dur: 1.3 }
    ],
  },
  crab_christmas_22_533: {
    v: 1,
    loop: 3.61,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 50, y: 48, size: 41, anim: "settle", dur: 3 },
      { type: "emoji", emoji: "🎩", x: 50, y: 14, size: 33, anim: "bounce", delay: 0.645, dur: 1.57 },
      { type: "emoji", emoji: "🌸", x: 68, y: 41, size: 26, anim: "pop", delay: 0.744, dur: 2 },
      { type: "emoji", emoji: "💫", x: 89, y: 79, size: 13, anim: "float", delay: 1.301, dur: 2.02 },
      { type: "emoji", emoji: "💖", x: 29, y: 41, size: 15, anim: "blink", delay: 1.273, dur: 1.49 },
      { type: "emoji", emoji: "🌟", x: 56, y: 79, size: 11, anim: "blink", delay: 0.592, dur: 1.63 }
    ],
  },
  crab_coding_22_534: {
    v: 1,
    loop: 2.07,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#512da8", opacity: 0.68, anim: "bounce", dur: 1.37, w: 97.77, h: 24.82 },
      { type: "emoji", emoji: "🦀", x: 48, y: 47, size: 43, anim: "bounce", dur: 1.27 },
      { type: "emoji", emoji: "🌸", x: 52, y: 28, size: 15, anim: "float", delay: 0.165, dur: 2.05 },
      { type: "emoji", emoji: "🍂", x: 32, y: 32, size: 19, anim: "float", delay: 0.281, dur: 1.62 },
      { type: "emoji", emoji: "✨", x: 77, y: 38, size: 17, anim: "blink", delay: 0.728, dur: 1.28 },
      { type: "emoji", emoji: "⭐", x: 52, y: 27, size: 17, anim: "blink", delay: 1.081, dur: 1.27 }
    ],
  },
  crab_music_22_535: {
    v: 1,
    loop: 3.21,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 47, y: 53, size: 40, anim: "twinkle", dur: 2.48 },
      { type: "emoji", emoji: "🧣", x: 49, y: 56, size: 24, anim: "bounce", delay: 0.672, dur: 1.67 },
      { type: "emoji", emoji: "🍬", x: 74, y: 43, size: 23, anim: "pop", delay: 0.523, dur: 1.56 },
      { type: "emoji", emoji: "🌊", x: 73, y: 39, size: 19, anim: "pop", delay: 1.333, dur: 1.71 },
      { type: "emoji", emoji: "🎈", x: 81, y: 63, size: 14, anim: "rise", delay: 0.064, dur: 1.58 },
      { type: "emoji", emoji: "💫", x: 56, y: 36, size: 13, anim: "blink", delay: 0.872, dur: 1.75 },
      { type: "emoji", emoji: "🌟", x: 81, y: 75, size: 13, anim: "blink", delay: 0.865, dur: 1.68 }
    ],
  },
  crab_sports_22_536: {
    v: 1,
    loop: 3.12,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f48fb1", opacity: 0.48, anim: "float", dur: 2.95, r: 48.99 },
      { type: "emoji", emoji: "🦀", x: 69, y: 45, size: 34, anim: "float", dur: 2.9 },
      { type: "emoji", emoji: "🍰", x: 70, y: 42, size: 27, anim: "pop", delay: 0.675, dur: 1.6 },
      { type: "emoji", emoji: "💖", x: 14, y: 50, size: 24, anim: "pop", delay: 0.32, dur: 1.5 },
      { type: "emoji", emoji: "❤️", x: 16, y: 27, size: 15, anim: "rise", delay: 0.421, dur: 1.62 },
      { type: "emoji", emoji: "🍃", x: 86, y: 49, size: 22, anim: "blink", delay: 1.026, dur: 1.63 },
      { type: "emoji", emoji: "⭐", x: 69, y: 34, size: 16, anim: "blink", delay: 0.698, dur: 1.31 },
      { type: "emoji", emoji: "💫", x: 48, y: 54, size: 17, anim: "blink", delay: 1.983, dur: 1.74 }
    ],
  },
  crab_food_22_537: {
    v: 1,
    loop: 1.97,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 69, y: 46, size: 42, anim: "pop", dur: 1.66 },
      { type: "emoji", emoji: "👷", x: 51, y: 16, size: 30, anim: "bounce", delay: 0.53, dur: 1.65 },
      { type: "emoji", emoji: "🌹", x: 67, y: 45, size: 26, anim: "float", delay: 0.646, dur: 1.79 },
      { type: "emoji", emoji: "🍃", x: 12, y: 89, size: 25, anim: "float", delay: 0.243, dur: 2.04 },
      { type: "emoji", emoji: "🌟", x: 15, y: 13, size: 18, anim: "wiggle", delay: 0.729, dur: 1.45 },
      { type: "emoji", emoji: "🌿", x: 52, y: 31, size: 13, anim: "blink", delay: 0.222, dur: 2.33 },
      { type: "emoji", emoji: "✨", x: 54, y: 52, size: 14, anim: "blink", delay: 0.576, dur: 1.05 },
      { type: "emoji", emoji: "✨", x: 16, y: 68, size: 15, anim: "blink", delay: 0.902, dur: 1.17 }
    ],
  },
  crab_space_22_538: {
    v: 1,
    loop: 3.19,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 50, y: 51, size: 37, anim: "heartbeat", dur: 2.44 },
      { type: "emoji", emoji: "✨", x: 51, y: 11, size: 18, anim: "wiggle", delay: 0.578, dur: 1.6 },
      { type: "emoji", emoji: "🍂", x: 63, y: 71, size: 13, anim: "pop", delay: 0.338, dur: 1.91 },
      { type: "emoji", emoji: "⭐", x: 48, y: 61, size: 18, anim: "blink", delay: 1.279, dur: 1.95 },
      { type: "emoji", emoji: "💖", x: 77, y: 76, size: 14, anim: "blink", delay: 1.188, dur: 1.53 }
    ],
  },
  crab_fantasy_22_539: {
    v: 1,
    loop: 4.12,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 43, y: 45, size: 34, anim: "float", dur: 3.43 },
      { type: "emoji", emoji: "🍃", x: 48, y: 43, size: 18, anim: "float", delay: 0.246, dur: 2.33 },
      { type: "emoji", emoji: "🎈", x: 43, y: 36, size: 15, anim: "wiggle", delay: 0.508, dur: 1.7 },
      { type: "emoji", emoji: "❤️", x: 48, y: 78, size: 12, anim: "wiggle", delay: 1.344, dur: 1.97 },
      { type: "emoji", emoji: "✨", x: 75, y: 81, size: 18, anim: "blink", delay: 1.953, dur: 1.58 },
      { type: "emoji", emoji: "💫", x: 51, y: 42, size: 16, anim: "blink", delay: 1.098, dur: 1.18 }
    ],
  },
  crab_office_22_540: {
    v: 1,
    loop: 3.23,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e1f5fe", opacity: 0.4, anim: "float", dur: 3.22, r: 45.45 },
      { type: "emoji", emoji: "🦀", x: 38, y: 45, size: 37, anim: "float", dur: 3.07 },
      { type: "emoji", emoji: "🧣", x: 49, y: 56, size: 26, anim: "bounce", delay: 0.535, dur: 1.64 },
      { type: "emoji", emoji: "🍫", x: 67, y: 42, size: 24, anim: "pop", delay: 0.681, dur: 1.74 },
      { type: "emoji", emoji: "🎈", x: 11, y: 27, size: 21, anim: "rise", delay: 1.002, dur: 1.99 },
      { type: "emoji", emoji: "⭐", x: 89, y: 66, size: 20, anim: "float", delay: 1.309, dur: 2.1 },
      { type: "emoji", emoji: "💫", x: 59, y: 82, size: 17, anim: "blink", delay: 1.697, dur: 1.88 },
      { type: "emoji", emoji: "🌟", x: 19, y: 66, size: 15, anim: "blink", delay: 1.66, dur: 1.96 }
    ],
  },
  crab_fitness_22_541: {
    v: 1,
    loop: 2.58,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#29b6f6", opacity: 0.34, anim: "wave", dur: 1.86, r: 44.59 },
      { type: "emoji", emoji: "🦀", x: 53, y: 53, size: 36, anim: "wave", dur: 1.73 },
      { type: "emoji", emoji: "🌹", x: 68, y: 43, size: 28, anim: "float", delay: 0.545, dur: 1.49 },
      { type: "emoji", emoji: "💖", x: 59, y: 67, size: 19, anim: "blink", delay: 0.656, dur: 1.56 },
      { type: "emoji", emoji: "🍃", x: 64, y: 26, size: 16, anim: "pop", delay: 0.469, dur: 2.04 },
      { type: "emoji", emoji: "✨", x: 18, y: 59, size: 18, anim: "blink", delay: 1.196, dur: 1.14 },
      { type: "emoji", emoji: "⭐", x: 33, y: 50, size: 18, anim: "blink", delay: 1.541, dur: 1.64 }
    ],
  },
  crab_travel_22_542: {
    v: 1,
    loop: 2.11,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffa726", opacity: 0.66, anim: "bounce", dur: 1.44, r: 42.61 },
      { type: "emoji", emoji: "🦀", x: 54, y: 51, size: 35, anim: "bounce", dur: 1.49 },
      { type: "emoji", emoji: "💫", x: 18, y: 85, size: 21, anim: "pop", delay: 0.402, dur: 1.5 },
      { type: "emoji", emoji: "🎉", x: 66, y: 48, size: 14, anim: "blink", delay: 0.97, dur: 1.56 },
      { type: "emoji", emoji: "🌟", x: 75, y: 74, size: 25, anim: "pop", delay: 0.256, dur: 2.11 },
      { type: "emoji", emoji: "💫", x: 40, y: 48, size: 16, anim: "wiggle", delay: 1.444, dur: 1.62 },
      { type: "emoji", emoji: "⭐", x: 67, y: 80, size: 11, anim: "blink", delay: 1.855, dur: 1.63 },
      { type: "emoji", emoji: "⭐", x: 48, y: 61, size: 14, anim: "blink", delay: 1.563, dur: 1.83 }
    ],
  },
  crab_art_22_543: {
    v: 1,
    loop: 2.21,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#388e3c", opacity: 0.37, anim: "wiggle", dur: 1.22, r: 47.11 },
      { type: "emoji", emoji: "🦀", x: 39, y: 54, size: 43, anim: "wiggle", dur: 1.44 },
      { type: "emoji", emoji: "👑", x: 49, y: 14, size: 32, anim: "bounce", delay: 0.495, dur: 1.93 },
      { type: "emoji", emoji: "💖", x: 21, y: 49, size: 17, anim: "rise", delay: 0.09, dur: 1.69 },
      { type: "emoji", emoji: "🍂", x: 69, y: 28, size: 21, anim: "rise", delay: 1.241, dur: 1.29 },
      { type: "emoji", emoji: "🍃", x: 69, y: 73, size: 12, anim: "wiggle", delay: 0.358, dur: 2.39 },
      { type: "emoji", emoji: "🍃", x: 79, y: 19, size: 22, anim: "float", delay: 0.367, dur: 2.15 },
      { type: "emoji", emoji: "💫", x: 83, y: 20, size: 16, anim: "blink", delay: 1.69, dur: 1.43 },
      { type: "emoji", emoji: "⭐", x: 41, y: 17, size: 16, anim: "blink", delay: 0.74, dur: 1.55 }
    ],
  },
  crab_science_22_544: {
    v: 1,
    loop: 3.86,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#d1c4e9", opacity: 0.35, anim: "breathe", dur: 3.33, w: 103.94, h: 21.58 },
      { type: "emoji", emoji: "🦀", x: 65, y: 46, size: 40, anim: "breathe", dur: 3.38 },
      { type: "emoji", emoji: "🍰", x: 69, y: 39, size: 28, anim: "float", delay: 0.676, dur: 1.48 },
      { type: "emoji", emoji: "🍂", x: 76, y: 18, size: 13, anim: "rise", delay: 1.349, dur: 1.45 },
      { type: "emoji", emoji: "🎈", x: 26, y: 12, size: 22, anim: "wiggle", delay: 0.204, dur: 1.74 },
      { type: "emoji", emoji: "🌟", x: 35, y: 42, size: 14, anim: "blink", delay: 1.182, dur: 1.16 },
      { type: "emoji", emoji: "⭐", x: 29, y: 65, size: 14, anim: "blink", delay: 1.515, dur: 1.44 }
    ],
  },
  crab_pets_22_545: {
    v: 1,
    loop: 2.82,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffab91", opacity: 0.35, anim: "pulse", dur: 1.79, r: 40.1 },
      { type: "emoji", emoji: "🦀", x: 59, y: 45, size: 39, anim: "pulse", dur: 1.97 },
      { type: "emoji", emoji: "🧢", x: 50, y: 17, size: 28, anim: "bounce", delay: 0.698, dur: 1.79 },
      { type: "emoji", emoji: "💫", x: 20, y: 87, size: 15, anim: "blink", delay: 0.713, dur: 2.33 },
      { type: "emoji", emoji: "🍂", x: 11, y: 21, size: 18, anim: "pop", delay: 0.793, dur: 2.35 },
      { type: "emoji", emoji: "✨", x: 67, y: 71, size: 11, anim: "blink", delay: 0.61, dur: 1.06 },
      { type: "emoji", emoji: "💫", x: 31, y: 22, size: 15, anim: "blink", delay: 1.926, dur: 1.78 }
    ],
  },
  crab_magic_22_546: {
    v: 1,
    loop: 2.27,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 33, y: 44, size: 43, anim: "pulse", dur: 2.22 },
      { type: "emoji", emoji: "👒", x: 51, y: 16, size: 35, anim: "bounce", delay: 0.582, dur: 1.61 },
      { type: "emoji", emoji: "🌟", x: 71, y: 27, size: 26, anim: "pop", delay: 0.426, dur: 1.98 },
      { type: "emoji", emoji: "🔥", x: 46, y: 80, size: 21, anim: "float", delay: 1.119, dur: 2.02 },
      { type: "emoji", emoji: "🌟", x: 33, y: 64, size: 25, anim: "wiggle", delay: 1.07, dur: 2.17 },
      { type: "emoji", emoji: "⭐", x: 55, y: 15, size: 19, anim: "blink", delay: 0.685, dur: 1.42 },
      { type: "emoji", emoji: "💖", x: 44, y: 38, size: 10, anim: "blink", delay: 1.112, dur: 1.84 }
    ],
  },
  crab_retro_22_547: {
    v: 1,
    loop: 2.75,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f3e5f5", opacity: 0.5, anim: "float", dur: 2.97, w: 102.23, h: 19.29 },
      { type: "emoji", emoji: "🦀", x: 37, y: 52, size: 37, anim: "float", dur: 2.93 },
      { type: "emoji", emoji: "🍫", x: 73, y: 43, size: 27, anim: "blink", delay: 0.687, dur: 1.51 },
      { type: "emoji", emoji: "🌿", x: 26, y: 25, size: 20, anim: "blink", delay: 1.328, dur: 1.54 },
      { type: "emoji", emoji: "❤️", x: 62, y: 12, size: 25, anim: "wiggle", delay: 1.345, dur: 1.47 },
      { type: "emoji", emoji: "✨", x: 33, y: 65, size: 15, anim: "blink", delay: 1.216, dur: 1.47 },
      { type: "emoji", emoji: "💖", x: 80, y: 47, size: 16, anim: "blink", delay: 1.951, dur: 1.69 }
    ],
  },
  crab_cyber_22_548: {
    v: 1,
    loop: 3.65,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff9c4", opacity: 0.61, anim: "settle", dur: 3.16, w: 93.15, h: 27.47 },
      { type: "emoji", emoji: "🦀", x: 36, y: 55, size: 41, anim: "settle", dur: 2.92 },
      { type: "emoji", emoji: "👮", x: 49, y: 17, size: 31, anim: "bounce", delay: 0.4, dur: 1.88 },
      { type: "emoji", emoji: "🍬", x: 75, y: 46, size: 22, anim: "blink", delay: 0.6, dur: 1.85 },
      { type: "emoji", emoji: "🎈", x: 44, y: 78, size: 23, anim: "blink", delay: 0.539, dur: 2.21 },
      { type: "emoji", emoji: "🔥", x: 54, y: 56, size: 12, anim: "float", delay: 0.709, dur: 1.27 },
      { type: "emoji", emoji: "🌸", x: 31, y: 20, size: 15, anim: "blink", delay: 1.476, dur: 1.57 },
      { type: "emoji", emoji: "💖", x: 41, y: 51, size: 11, anim: "blink", delay: 1.822, dur: 1.89 },
      { type: "emoji", emoji: "⭐", x: 38, y: 58, size: 13, anim: "blink", delay: 1.392, dur: 1.15 }
    ],
  },
  crab_nature_22_549: {
    v: 1,
    loop: 1.96,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#5c6bc0", opacity: 0.36, anim: "bounce", dur: 1.25, r: 47.89 },
      { type: "emoji", emoji: "🦀", x: 55, y: 45, size: 38, anim: "bounce", dur: 1.29 },
      { type: "emoji", emoji: "🎭", x: 49, y: 28, size: 26, anim: "bounce", delay: 0.553, dur: 1.53 },
      { type: "emoji", emoji: "🌻", x: 73, y: 43, size: 26, anim: "blink", delay: 0.998, dur: 1.79 },
      { type: "emoji", emoji: "⭐", x: 70, y: 57, size: 12, anim: "float", delay: 0.462, dur: 1.91 },
      { type: "emoji", emoji: "✨", x: 66, y: 89, size: 23, anim: "rise", delay: 0.128, dur: 2.19 },
      { type: "emoji", emoji: "💖", x: 84, y: 70, size: 13, anim: "blink", delay: 1.771, dur: 1.7 },
      { type: "emoji", emoji: "💫", x: 34, y: 69, size: 15, anim: "blink", delay: 0.923, dur: 1.23 }
    ],
  },
  crab_underwater_22_550: {
    v: 1,
    loop: 3.25,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 31, y: 48, size: 33, anim: "twinkle", dur: 2.38 },
      { type: "emoji", emoji: "🎀", x: 67, y: 33, size: 16, anim: "pop", delay: 0.849, dur: 1.54 },
      { type: "emoji", emoji: "🔥", x: 14, y: 44, size: 24, anim: "blink", delay: 0.044, dur: 1.48 },
      { type: "emoji", emoji: "🎊", x: 56, y: 52, size: 13, anim: "float", delay: 0.735, dur: 1.26 },
      { type: "emoji", emoji: "✨", x: 17, y: 25, size: 25, anim: "blink", delay: 1.42, dur: 1.8 },
      { type: "emoji", emoji: "🌸", x: 56, y: 64, size: 24, anim: "float", delay: 0.392, dur: 1.88 },
      { type: "emoji", emoji: "🎉", x: 78, y: 15, size: 24, anim: "float", delay: 1.401, dur: 1.79 },
      { type: "emoji", emoji: "🌟", x: 54, y: 78, size: 10, anim: "blink", delay: 1.493, dur: 1.51 },
      { type: "emoji", emoji: "💖", x: 83, y: 83, size: 19, anim: "blink", delay: 1.473, dur: 1.39 }
    ],
  },
  crab_sky_22_551: {
    v: 1,
    loop: 3.4,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#e1f5fe", opacity: 0.44, anim: "float", dur: 3.11, w: 94.29, h: 27.63 },
      { type: "emoji", emoji: "🦀", x: 39, y: 53, size: 44, anim: "float", dur: 3.03 },
      { type: "emoji", emoji: "🎭", x: 48, y: 26, size: 29, anim: "bounce", delay: 0.41, dur: 1.9 },
      { type: "emoji", emoji: "🍰", x: 65, y: 43, size: 28, anim: "rise", delay: 0.444, dur: 1.89 },
      { type: "emoji", emoji: "💖", x: 32, y: 15, size: 13, anim: "wiggle", delay: 0.115, dur: 2.1 },
      { type: "emoji", emoji: "💫", x: 25, y: 30, size: 25, anim: "rise", delay: 1.176, dur: 2.09 },
      { type: "emoji", emoji: "🎊", x: 69, y: 40, size: 24, anim: "wiggle", delay: 1.013, dur: 2.36 },
      { type: "emoji", emoji: "⭐", x: 41, y: 82, size: 15, anim: "wiggle", delay: 1.124, dur: 2.17 },
      { type: "emoji", emoji: "🎈", x: 34, y: 28, size: 13, anim: "wiggle", delay: 1.116, dur: 1.36 },
      { type: "emoji", emoji: "✨", x: 36, y: 25, size: 13, anim: "blink", delay: 0.813, dur: 1.54 },
      { type: "emoji", emoji: "💫", x: 52, y: 57, size: 12, anim: "blink", delay: 0.799, dur: 1.67 }
    ],
  },
  crab_party_23_552: {
    v: 1,
    loop: 2.05,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ffb74d", opacity: 0.59, anim: "pop", dur: 1.41, r: 40.45 },
      { type: "emoji", emoji: "🦀", x: 50, y: 50, size: 40, anim: "pop", dur: 1.54 },
      { type: "emoji", emoji: "🎩", x: 49, y: 11, size: 31, anim: "bounce", delay: 0.607, dur: 1.98 },
      { type: "emoji", emoji: "💝", x: 72, y: 41, size: 25, anim: "blink", delay: 0.761, dur: 1.68 },
      { type: "emoji", emoji: "🌟", x: 36, y: 89, size: 22, anim: "rise", delay: 0.356, dur: 1.23 },
      { type: "emoji", emoji: "❤️", x: 82, y: 63, size: 19, anim: "rise", delay: 1.364, dur: 2.01 },
      { type: "emoji", emoji: "🍂", x: 24, y: 85, size: 14, anim: "blink", delay: 0.022, dur: 1.76 },
      { type: "emoji", emoji: "🎊", x: 12, y: 26, size: 15, anim: "float", delay: 0.079, dur: 2.05 },
      { type: "emoji", emoji: "🌸", x: 74, y: 36, size: 17, anim: "blink", delay: 0.725, dur: 1.91 },
      { type: "emoji", emoji: "⭐", x: 64, y: 48, size: 19, anim: "blink", delay: 1.509, dur: 1.44 },
      { type: "emoji", emoji: "💖", x: 62, y: 71, size: 15, anim: "blink", delay: 1.617, dur: 1.54 }
    ],
  },
  crab_beach_23_553: {
    v: 1,
    loop: 2.95,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#66bb6a", opacity: 0.62, anim: "heartbeat", dur: 2.54, r: 40.97 },
      { type: "emoji", emoji: "🦀", x: 58, y: 46, size: 41, anim: "heartbeat", dur: 2.48 },
      { type: "emoji", emoji: "👷", x: 50, y: 14, size: 31, anim: "bounce", delay: 0.518, dur: 1.75 },
      { type: "emoji", emoji: "🍪", x: 72, y: 42, size: 22, anim: "rise", delay: 0.453, dur: 1.41 },
      { type: "emoji", emoji: "🔥", x: 33, y: 37, size: 23, anim: "wiggle", delay: 1.448, dur: 1.3 },
      { type: "emoji", emoji: "🌸", x: 34, y: 33, size: 15, anim: "wiggle", delay: 0.299, dur: 1.96 },
      { type: "emoji", emoji: "🌟", x: 22, y: 80, size: 11, anim: "blink", delay: 1.853, dur: 1.07 },
      { type: "emoji", emoji: "⭐", x: 66, y: 51, size: 12, anim: "blink", delay: 1.344, dur: 1.05 }
    ],
  },
  crab_winter_23_554: {
    v: 1,
    loop: 4.11,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#673ab7", opacity: 0.63, anim: "float", dur: 3.71, w: 100.97, h: 26.53 },
      { type: "emoji", emoji: "🦀", x: 49, y: 49, size: 36, anim: "float", dur: 3.51 },
      { type: "emoji", emoji: "🧣", x: 51, y: 56, size: 24, anim: "bounce", delay: 0.376, dur: 1.62 },
      { type: "emoji", emoji: "🎉", x: 42, y: 59, size: 12, anim: "wiggle", delay: 0.496, dur: 1.39 },
      { type: "emoji", emoji: "🎉", x: 75, y: 83, size: 14, anim: "rise", delay: 0.266, dur: 1.33 },
      { type: "emoji", emoji: "💫", x: 24, y: 74, size: 16, anim: "pop", delay: 1.161, dur: 1.94 },
      { type: "emoji", emoji: "🎉", x: 17, y: 28, size: 12, anim: "blink", delay: 0.054, dur: 1.71 },
      { type: "emoji", emoji: "✨", x: 70, y: 21, size: 19, anim: "blink", delay: 1.855, dur: 1.32 },
      { type: "emoji", emoji: "✨", x: 31, y: 37, size: 13, anim: "blink", delay: 0.581, dur: 1.64 }
    ],
  },
  crab_spring_23_555: {
    v: 1,
    loop: 3.16,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ff8a65", opacity: 0.69, anim: "float", dur: 2.95, w: 93.11, h: 18.59 },
      { type: "emoji", emoji: "🦀", x: 67, y: 45, size: 34, anim: "float", dur: 2.98 },
      { type: "emoji", emoji: "🎀", x: 66, y: 32, size: 19, anim: "blink", delay: 0.955, dur: 1.57 },
      { type: "emoji", emoji: "🎊", x: 57, y: 78, size: 25, anim: "pop", delay: 0.914, dur: 1.73 },
      { type: "emoji", emoji: "🎊", x: 53, y: 62, size: 22, anim: "blink", delay: 0.484, dur: 1.93 },
      { type: "emoji", emoji: "🎊", x: 53, y: 19, size: 17, anim: "pop", delay: 0.023, dur: 1.93 },
      { type: "emoji", emoji: "🌟", x: 64, y: 54, size: 14, anim: "blink", delay: 1.959, dur: 1.85 },
      { type: "emoji", emoji: "💫", x: 62, y: 62, size: 17, anim: "blink", delay: 0.543, dur: 1.39 }
    ],
  },
  crab_halloween_23_556: {
    v: 1,
    loop: 2.44,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#f48fb1", opacity: 0.4, anim: "wave", dur: 1.59, w: 101.86, h: 20.98 },
      { type: "emoji", emoji: "🦀", x: 56, y: 54, size: 37, anim: "wave", dur: 1.78 },
      { type: "emoji", emoji: "💫", x: 68, y: 49, size: 19, anim: "blink", delay: 1.12, dur: 1.23 },
      { type: "emoji", emoji: "🎊", x: 57, y: 58, size: 13, anim: "rise", delay: 0.766, dur: 1.33 },
      { type: "emoji", emoji: "🌿", x: 68, y: 51, size: 20, anim: "blink", delay: 0.714, dur: 1.37 },
      { type: "emoji", emoji: "🎊", x: 31, y: 85, size: 14, anim: "wiggle", delay: 1.089, dur: 2.36 },
      { type: "emoji", emoji: "🌟", x: 22, y: 15, size: 19, anim: "blink", delay: 0.999, dur: 1.41 },
      { type: "emoji", emoji: "✨", x: 61, y: 80, size: 16, anim: "blink", delay: 0.985, dur: 1.21 }
    ],
  },
  crab_christmas_23_557: {
    v: 1,
    loop: 2.02,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ba68c8", opacity: 0.58, anim: "bounce", dur: 1.25, w: 96.69, h: 23.99 },
      { type: "emoji", emoji: "🦀", x: 46, y: 47, size: 40, anim: "bounce", dur: 1.58 },
      { type: "emoji", emoji: "🎉", x: 79, y: 18, size: 12, anim: "pop", delay: 0.067, dur: 2.19 },
      { type: "emoji", emoji: "🌸", x: 75, y: 50, size: 18, anim: "rise", delay: 1.16, dur: 2.04 },
      { type: "emoji", emoji: "✨", x: 15, y: 15, size: 18, anim: "pop", delay: 0.767, dur: 2.1 },
      { type: "emoji", emoji: "⭐", x: 17, y: 46, size: 17, anim: "blink", delay: 1.034, dur: 1.28 },
      { type: "emoji", emoji: "⭐", x: 81, y: 37, size: 19, anim: "blink", delay: 1.718, dur: 1.67 }
    ],
  },
  crab_coding_23_558: {
    v: 1,
    loop: 2.02,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fffde7", opacity: 0.69, anim: "wiggle", dur: 1.31, r: 41.69 },
      { type: "emoji", emoji: "🦀", x: 50, y: 48, size: 39, anim: "wiggle", dur: 1.36 },
      { type: "emoji", emoji: "🎭", x: 48, y: 27, size: 26, anim: "bounce", delay: 0.347, dur: 1.82 },
      { type: "emoji", emoji: "🎁", x: 70, y: 39, size: 27, anim: "blink", delay: 0.596, dur: 1.85 },
      { type: "emoji", emoji: "💖", x: 50, y: 42, size: 18, anim: "wiggle", delay: 0.737, dur: 2.22 },
      { type: "emoji", emoji: "🎊", x: 36, y: 58, size: 13, anim: "wiggle", delay: 0.738, dur: 1.92 },
      { type: "emoji", emoji: "💫", x: 68, y: 40, size: 11, anim: "blink", delay: 1.578, dur: 1.15 },
      { type: "emoji", emoji: "💫", x: 18, y: 59, size: 11, anim: "blink", delay: 1.042, dur: 1.13 }
    ],
  },
  crab_music_23_559: {
    v: 1,
    loop: 4.15,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 60, y: 45, size: 40, anim: "breathe", dur: 3.62 },
      { type: "emoji", emoji: "👒", x: 51, y: 13, size: 32, anim: "bounce", delay: 0.317, dur: 1.82 },
      { type: "emoji", emoji: "🎀", x: 69, y: 32, size: 17, anim: "blink", delay: 0.667, dur: 1.76 },
      { type: "emoji", emoji: "🌿", x: 15, y: 55, size: 18, anim: "pop", delay: 0.11, dur: 1.25 },
      { type: "emoji", emoji: "🎊", x: 48, y: 87, size: 14, anim: "pop", delay: 1.217, dur: 1.82 },
      { type: "emoji", emoji: "❤️", x: 53, y: 27, size: 15, anim: "pop", delay: 0.391, dur: 1.28 },
      { type: "emoji", emoji: "✨", x: 35, y: 45, size: 24, anim: "blink", delay: 0.844, dur: 1.49 },
      { type: "emoji", emoji: "❄️", x: 27, y: 59, size: 15, anim: "float", delay: 0.209, dur: 1.8 },
      { type: "emoji", emoji: "✨", x: 37, y: 40, size: 11, anim: "blink", delay: 1.706, dur: 1.27 },
      { type: "emoji", emoji: "🌟", x: 15, y: 46, size: 19, anim: "blink", delay: 1.523, dur: 1.5 }
    ],
  },
  crab_sports_23_560: {
    v: 1,
    loop: 2.62,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fff9c4", opacity: 0.55, anim: "pulse", dur: 2.21, r: 43.86 },
      { type: "emoji", emoji: "🦀", x: 31, y: 51, size: 33, anim: "pulse", dur: 1.86 },
      { type: "emoji", emoji: "🎈", x: 73, y: 25, size: 28, anim: "float", delay: 0.569, dur: 1.46 },
      { type: "emoji", emoji: "🌿", x: 27, y: 29, size: 17, anim: "pop", delay: 0.743, dur: 1.84 },
      { type: "emoji", emoji: "❄️", x: 87, y: 16, size: 23, anim: "pop", delay: 0.045, dur: 1.56 },
      { type: "emoji", emoji: "✨", x: 72, y: 68, size: 10, anim: "blink", delay: 0.541, dur: 1.37 },
      { type: "emoji", emoji: "💫", x: 58, y: 57, size: 16, anim: "blink", delay: 1.362, dur: 1.91 }
    ],
  },
  crab_food_23_561: {
    v: 1,
    loop: 2.5,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 54, y: 47, size: 37, anim: "pulse", dur: 2.08 },
      { type: "emoji", emoji: "🧙", x: 52, y: 14, size: 33, anim: "bounce", delay: 0.465, dur: 1.85 },
      { type: "emoji", emoji: "❤️", x: 70, y: 59, size: 13, anim: "blink", delay: 0.637, dur: 1.44 },
      { type: "emoji", emoji: "💖", x: 85, y: 54, size: 21, anim: "pop", delay: 1.154, dur: 1.98 },
      { type: "emoji", emoji: "💫", x: 33, y: 37, size: 21, anim: "pop", delay: 1.197, dur: 1.81 },
      { type: "emoji", emoji: "✨", x: 55, y: 33, size: 18, anim: "blink", delay: 1.017, dur: 1.78 },
      { type: "emoji", emoji: "💫", x: 30, y: 45, size: 13, anim: "blink", delay: 1.114, dur: 1.51 }
    ],
  },
  crab_space_23_562: {
    v: 1,
    loop: 3.17,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffcc80", opacity: 0.59, anim: "float", dur: 2.67, r: 42.88 },
      { type: "emoji", emoji: "🦀", x: 33, y: 55, size: 34, anim: "float", dur: 2.85 },
      { type: "emoji", emoji: "🪖", x: 52, y: 17, size: 28, anim: "bounce", delay: 0.499, dur: 1.72 },
      { type: "emoji", emoji: "🎈", x: 84, y: 34, size: 21, anim: "float", delay: 1.165, dur: 1.65 },
      { type: "emoji", emoji: "🌊", x: 83, y: 17, size: 17, anim: "blink", delay: 0, dur: 1.69 },
      { type: "emoji", emoji: "💫", x: 68, y: 17, size: 17, anim: "blink", delay: 1.106, dur: 1.94 },
      { type: "emoji", emoji: "✨", x: 26, y: 68, size: 13, anim: "blink", delay: 1.161, dur: 1.26 }
    ],
  },
  crab_fantasy_23_563: {
    v: 1,
    loop: 3.6,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#81c784", opacity: 0.41, anim: "settle", dur: 3.18, r: 48.29 },
      { type: "emoji", emoji: "🦀", x: 39, y: 54, size: 34, anim: "settle", dur: 3.08 },
      { type: "emoji", emoji: "🌹", x: 69, y: 39, size: 29, anim: "pop", delay: 0.426, dur: 1.93 },
      { type: "emoji", emoji: "🍃", x: 64, y: 52, size: 20, anim: "pop", delay: 1.099, dur: 1.23 },
      { type: "emoji", emoji: "🍂", x: 76, y: 45, size: 20, anim: "wiggle", delay: 0.803, dur: 2.03 },
      { type: "emoji", emoji: "⭐", x: 53, y: 77, size: 15, anim: "blink", delay: 0.937, dur: 1.46 },
      { type: "emoji", emoji: "🌟", x: 81, y: 21, size: 12, anim: "blink", delay: 1.142, dur: 1.69 }
    ],
  },
  crab_office_23_564: {
    v: 1,
    loop: 2.1,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 69, y: 53, size: 39, anim: "bounce", dur: 1.25 },
      { type: "emoji", emoji: "🌟", x: 69, y: 67, size: 14, anim: "wiggle", delay: 0.71, dur: 1.8 },
      { type: "emoji", emoji: "🔥", x: 72, y: 26, size: 24, anim: "blink", delay: 1.178, dur: 2.19 },
      { type: "emoji", emoji: "✨", x: 67, y: 15, size: 23, anim: "wiggle", delay: 1.243, dur: 2.34 },
      { type: "emoji", emoji: "🍃", x: 18, y: 83, size: 15, anim: "float", delay: 0.626, dur: 1.53 },
      { type: "emoji", emoji: "✨", x: 66, y: 61, size: 18, anim: "blink", delay: 1.563, dur: 1.24 },
      { type: "emoji", emoji: "💖", x: 18, y: 31, size: 11, anim: "blink", delay: 1.711, dur: 1.07 }
    ],
  },
  crab_fitness_23_565: {
    v: 1,
    loop: 3.05,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffab91", opacity: 0.44, anim: "twinkle", dur: 2.28, w: 101.92, h: 20.12 },
      { type: "emoji", emoji: "🦀", x: 66, y: 55, size: 43, anim: "twinkle", dur: 2.36 },
      { type: "emoji", emoji: "🍭", x: 69, y: 41, size: 26, anim: "rise", delay: 0.688, dur: 1.9 },
      { type: "emoji", emoji: "🎈", x: 27, y: 22, size: 14, anim: "rise", delay: 0.452, dur: 1.83 },
      { type: "emoji", emoji: "🎈", x: 87, y: 31, size: 25, anim: "float", delay: 0.036, dur: 1.65 },
      { type: "emoji", emoji: "⭐", x: 89, y: 37, size: 22, anim: "blink", delay: 0.97, dur: 2.11 },
      { type: "emoji", emoji: "🌸", x: 88, y: 73, size: 24, anim: "float", delay: 0.395, dur: 1.86 },
      { type: "emoji", emoji: "⭐", x: 57, y: 68, size: 16, anim: "blink", delay: 1.867, dur: 1.26 },
      { type: "emoji", emoji: "✨", x: 21, y: 80, size: 16, anim: "blink", delay: 0.971, dur: 1.03 }
    ],
  },
  crab_travel_23_566: {
    v: 1,
    loop: 3.43,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fce4ec", opacity: 0.67, anim: "float", dur: 2.89, w: 107.17, h: 25.27 },
      { type: "emoji", emoji: "🦀", x: 40, y: 49, size: 40, anim: "float", dur: 2.92 },
      { type: "emoji", emoji: "👒", x: 49, y: 13, size: 32, anim: "bounce", delay: 0.322, dur: 1.91 },
      { type: "emoji", emoji: "🍄", x: 73, y: 42, size: 25, anim: "blink", delay: 0.827, dur: 1.84 },
      { type: "emoji", emoji: "🌿", x: 73, y: 65, size: 22, anim: "float", delay: 0.251, dur: 1.26 },
      { type: "emoji", emoji: "🌊", x: 68, y: 73, size: 15, anim: "rise", delay: 0.547, dur: 1.64 },
      { type: "emoji", emoji: "💖", x: 38, y: 50, size: 25, anim: "rise", delay: 1.052, dur: 1.7 },
      { type: "emoji", emoji: "✨", x: 82, y: 43, size: 12, anim: "blink", delay: 0.495, dur: 1.58 },
      { type: "emoji", emoji: "🌊", x: 47, y: 59, size: 19, anim: "wiggle", delay: 0.7, dur: 2.38 },
      { type: "emoji", emoji: "🌟", x: 69, y: 78, size: 17, anim: "blink", delay: 1.412, dur: 1.62 },
      { type: "emoji", emoji: "🌟", x: 42, y: 24, size: 17, anim: "blink", delay: 1.843, dur: 1.46 }
    ],
  },
  crab_art_23_567: {
    v: 1,
    loop: 2.03,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f3e5f5", opacity: 0.53, anim: "pop", dur: 1.83, r: 45.39 },
      { type: "emoji", emoji: "🦀", x: 60, y: 54, size: 37, anim: "pop", dur: 1.66 },
      { type: "emoji", emoji: "👑", x: 49, y: 12, size: 32, anim: "bounce", delay: 0.461, dur: 1.54 },
      { type: "emoji", emoji: "🍫", x: 69, y: 41, size: 27, anim: "rise", delay: 0.633, dur: 1.86 },
      { type: "emoji", emoji: "🌸", x: 24, y: 85, size: 12, anim: "rise", delay: 0.712, dur: 1.44 },
      { type: "emoji", emoji: "🎈", x: 85, y: 34, size: 25, anim: "blink", delay: 0.609, dur: 1.97 },
      { type: "emoji", emoji: "🔥", x: 43, y: 30, size: 25, anim: "pop", delay: 0.989, dur: 1.97 },
      { type: "emoji", emoji: "💖", x: 57, y: 58, size: 10, anim: "blink", delay: 1.104, dur: 1.93 },
      { type: "emoji", emoji: "✨", x: 40, y: 20, size: 15, anim: "blink", delay: 1.835, dur: 1.64 }
    ],
  },
  crab_science_23_568: {
    v: 1,
    loop: 2.99,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fbc02d", opacity: 0.36, anim: "heartbeat", dur: 2.4, r: 43.11 },
      { type: "emoji", emoji: "🦀", x: 65, y: 52, size: 39, anim: "heartbeat", dur: 2.42 },
      { type: "emoji", emoji: "👮", x: 52, y: 17, size: 30, anim: "bounce", delay: 0.503, dur: 1.87 },
      { type: "emoji", emoji: "💫", x: 28, y: 76, size: 24, anim: "wiggle", delay: 0.364, dur: 1.25 },
      { type: "emoji", emoji: "🎉", x: 81, y: 10, size: 13, anim: "blink", delay: 0.27, dur: 1.21 },
      { type: "emoji", emoji: "💖", x: 78, y: 30, size: 10, anim: "blink", delay: 0.985, dur: 1.47 },
      { type: "emoji", emoji: "⭐", x: 72, y: 37, size: 13, anim: "blink", delay: 0.683, dur: 1.13 }
    ],
  },
  crab_pets_23_569: {
    v: 1,
    loop: 4.05,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#7986cb", opacity: 0.43, anim: "float", dur: 3.71, r: 43.9 },
      { type: "emoji", emoji: "🦀", x: 37, y: 49, size: 34, anim: "float", dur: 3.48 },
      { type: "emoji", emoji: "🧣", x: 48, y: 59, size: 25, anim: "bounce", delay: 0.602, dur: 1.57 },
      { type: "emoji", emoji: "💫", x: 37, y: 86, size: 20, anim: "pop", delay: 1.417, dur: 2.24 },
      { type: "emoji", emoji: "✨", x: 22, y: 56, size: 20, anim: "rise", delay: 0.059, dur: 1.92 },
      { type: "emoji", emoji: "💖", x: 44, y: 26, size: 14, anim: "blink", delay: 1.823, dur: 1.68 },
      { type: "emoji", emoji: "🌟", x: 28, y: 61, size: 15, anim: "blink", delay: 1.46, dur: 1.07 }
    ],
  },
  crab_magic_23_570: {
    v: 1,
    loop: 3.08,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fff9c4", opacity: 0.41, anim: "float", dur: 3.13, r: 40.35 },
      { type: "emoji", emoji: "🦀", x: 68, y: 51, size: 44, anim: "float", dur: 3.01 },
      { type: "emoji", emoji: "🎩", x: 50, y: 11, size: 31, anim: "bounce", delay: 0.375, dur: 1.67 },
      { type: "emoji", emoji: "✨", x: 61, y: 34, size: 13, anim: "wiggle", delay: 0.32, dur: 2.1 },
      { type: "emoji", emoji: "🎉", x: 68, y: 48, size: 20, anim: "rise", delay: 1.263, dur: 1.76 },
      { type: "emoji", emoji: "✨", x: 72, y: 81, size: 19, anim: "blink", delay: 1.753, dur: 1.79 },
      { type: "emoji", emoji: "💫", x: 33, y: 76, size: 18, anim: "blink", delay: 0.537, dur: 1.96 }
    ],
  },
  crab_retro_23_571: {
    v: 1,
    loop: 2.59,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#0288d1", opacity: 0.38, anim: "wave", dur: 1.6, w: 102.66, h: 27.06 },
      { type: "emoji", emoji: "🦀", x: 69, y: 51, size: 41, anim: "wave", dur: 1.68 },
      { type: "emoji", emoji: "🎭", x: 51, y: 30, size: 28, anim: "bounce", delay: 0.461, dur: 1.6 },
      { type: "emoji", emoji: "⭐", x: 72, y: 30, size: 22, anim: "rise", delay: 0.749, dur: 1.76 },
      { type: "emoji", emoji: "🍂", x: 35, y: 59, size: 17, anim: "pop", delay: 0.373, dur: 1.84 },
      { type: "emoji", emoji: "❄️", x: 48, y: 56, size: 20, anim: "float", delay: 1.169, dur: 1.49 },
      { type: "emoji", emoji: "🍂", x: 79, y: 43, size: 17, anim: "wiggle", delay: 0.02, dur: 1.85 },
      { type: "emoji", emoji: "✨", x: 22, y: 66, size: 16, anim: "pop", delay: 0.582, dur: 1.25 },
      { type: "emoji", emoji: "💖", x: 41, y: 47, size: 14, anim: "blink", delay: 0.907, dur: 1.04 },
      { type: "emoji", emoji: "🌟", x: 47, y: 26, size: 10, anim: "blink", delay: 1.116, dur: 1.42 }
    ],
  },
  crab_cyber_23_572: {
    v: 1,
    loop: 2.09,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fff3e0", opacity: 0.44, anim: "bounce", dur: 1.71, r: 43.47 },
      { type: "emoji", emoji: "🦀", x: 37, y: 45, size: 33, anim: "bounce", dur: 1.43 },
      { type: "emoji", emoji: "👷", x: 49, y: 16, size: 29, anim: "bounce", delay: 0.415, dur: 1.65 },
      { type: "emoji", emoji: "💌", x: 68, y: 45, size: 24, anim: "blink", delay: 0.579, dur: 1.5 },
      { type: "emoji", emoji: "🌟", x: 14, y: 12, size: 13, anim: "blink", delay: 0.926, dur: 1.88 },
      { type: "emoji", emoji: "🎊", x: 44, y: 10, size: 25, anim: "wiggle", delay: 0.189, dur: 2 },
      { type: "emoji", emoji: "💖", x: 40, y: 86, size: 18, anim: "wiggle", delay: 0.94, dur: 1.43 },
      { type: "emoji", emoji: "✨", x: 49, y: 31, size: 10, anim: "blink", delay: 1.659, dur: 1.34 },
      { type: "emoji", emoji: "💫", x: 67, y: 37, size: 14, anim: "blink", delay: 1.501, dur: 1.48 }
    ],
  },
  crab_nature_23_573: {
    v: 1,
    loop: 2.11,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 52, y: 50, size: 38, anim: "wiggle", dur: 1.49 },
      { type: "emoji", emoji: "🍳", x: 50, y: 16, size: 27, anim: "bounce", delay: 0.391, dur: 1.57 },
      { type: "emoji", emoji: "🍂", x: 53, y: 65, size: 19, anim: "rise", delay: 0.149, dur: 1.81 },
      { type: "emoji", emoji: "🌸", x: 13, y: 33, size: 20, anim: "pop", delay: 1.213, dur: 2.01 },
      { type: "emoji", emoji: "🎊", x: 64, y: 31, size: 23, anim: "blink", delay: 1.5, dur: 1.77 },
      { type: "emoji", emoji: "💫", x: 33, y: 84, size: 15, anim: "blink", delay: 1.113, dur: 1.42 },
      { type: "emoji", emoji: "💫", x: 55, y: 36, size: 18, anim: "blink", delay: 1.722, dur: 1.25 }
    ],
  },
  crab_underwater_23_574: {
    v: 1,
    loop: 4.19,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#d1c4e9", opacity: 0.5, anim: "breathe", dur: 3.66, r: 49.15 },
      { type: "emoji", emoji: "🦀", x: 59, y: 48, size: 44, anim: "breathe", dur: 3.39 },
      { type: "emoji", emoji: "🪖", x: 50, y: 17, size: 30, anim: "bounce", delay: 0.572, dur: 1.68 },
      { type: "emoji", emoji: "🔥", x: 50, y: 44, size: 24, anim: "rise", delay: 0.689, dur: 2.02 },
      { type: "emoji", emoji: "❄️", x: 74, y: 10, size: 24, anim: "float", delay: 1.478, dur: 1.89 },
      { type: "emoji", emoji: "⭐", x: 37, y: 68, size: 25, anim: "wiggle", delay: 1.323, dur: 1.54 },
      { type: "emoji", emoji: "⭐", x: 14, y: 15, size: 18, anim: "wiggle", delay: 0.122, dur: 1.46 },
      { type: "emoji", emoji: "❤️", x: 58, y: 53, size: 12, anim: "rise", delay: 0.051, dur: 2.26 },
      { type: "emoji", emoji: "💖", x: 65, y: 20, size: 11, anim: "blink", delay: 1.029, dur: 1.65 },
      { type: "emoji", emoji: "🌟", x: 67, y: 28, size: 14, anim: "blink", delay: 0.716, dur: 1.48 }
    ],
  },
  crab_sky_23_575: {
    v: 1,
    loop: 2.93,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 34, y: 46, size: 34, anim: "pulse", dur: 1.9 },
      { type: "emoji", emoji: "🕶️", x: 51, y: 29, size: 28, anim: "bounce", delay: 0.695, dur: 1.7 },
      { type: "emoji", emoji: "🍭", x: 70, y: 40, size: 25, anim: "blink", delay: 0.996, dur: 1.85 },
      { type: "emoji", emoji: "🎊", x: 74, y: 50, size: 14, anim: "blink", delay: 1.454, dur: 2.39 },
      { type: "emoji", emoji: "🌸", x: 40, y: 55, size: 23, anim: "float", delay: 1.163, dur: 1.73 },
      { type: "emoji", emoji: "✨", x: 32, y: 44, size: 11, anim: "blink", delay: 0.781, dur: 1.05 },
      { type: "emoji", emoji: "💖", x: 55, y: 65, size: 19, anim: "blink", delay: 1.637, dur: 1.5 }
    ],
  },
  crab_party_24_576: {
    v: 1,
    loop: 2.44,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 38, y: 52, size: 43, anim: "pulse", dur: 2.34 },
      { type: "emoji", emoji: "🪖", x: 50, y: 16, size: 30, anim: "bounce", delay: 0.313, dur: 1.96 },
      { type: "emoji", emoji: "🌿", x: 15, y: 31, size: 19, anim: "rise", delay: 1.035, dur: 1.99 },
      { type: "emoji", emoji: "⭐", x: 37, y: 19, size: 14, anim: "pop", delay: 1.281, dur: 1.32 },
      { type: "emoji", emoji: "✨", x: 71, y: 52, size: 24, anim: "rise", delay: 0.741, dur: 2.07 },
      { type: "emoji", emoji: "✨", x: 15, y: 56, size: 22, anim: "pop", delay: 0.416, dur: 2.23 },
      { type: "emoji", emoji: "🍃", x: 51, y: 24, size: 14, anim: "pop", delay: 0.159, dur: 2.17 },
      { type: "emoji", emoji: "💫", x: 65, y: 72, size: 13, anim: "blink", delay: 0.731, dur: 1.92 },
      { type: "emoji", emoji: "💫", x: 67, y: 29, size: 15, anim: "blink", delay: 1.173, dur: 1.27 }
    ],
  },
  crab_beach_24_577: {
    v: 1,
    loop: 3.19,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e1bee7", opacity: 0.68, anim: "float", dur: 2.88, r: 43.85 },
      { type: "emoji", emoji: "🦀", x: 40, y: 52, size: 41, anim: "float", dur: 2.69 },
      { type: "emoji", emoji: "🎈", x: 70, y: 26, size: 28, anim: "rise", delay: 0.653, dur: 1.96 },
      { type: "emoji", emoji: "💖", x: 44, y: 21, size: 16, anim: "blink", delay: 1.472, dur: 1.62 },
      { type: "emoji", emoji: "💖", x: 76, y: 19, size: 19, anim: "blink", delay: 1.471, dur: 1.8 },
      { type: "emoji", emoji: "💫", x: 65, y: 60, size: 12, anim: "blink", delay: 0.866, dur: 2 },
      { type: "emoji", emoji: "🌟", x: 73, y: 48, size: 16, anim: "blink", delay: 1.108, dur: 1.24 }
    ],
  },
  crab_winter_24_578: {
    v: 1,
    loop: 3.44,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fdd835", opacity: 0.64, anim: "settle", dur: 2.81, w: 104.39, h: 18.37 },
      { type: "emoji", emoji: "🦀", x: 33, y: 49, size: 35, anim: "settle", dur: 2.89 },
      { type: "emoji", emoji: "🌊", x: 86, y: 38, size: 21, anim: "rise", delay: 0.14, dur: 2.27 },
      { type: "emoji", emoji: "❤️", x: 24, y: 84, size: 14, anim: "wiggle", delay: 0.569, dur: 1.71 },
      { type: "emoji", emoji: "💖", x: 47, y: 78, size: 21, anim: "blink", delay: 0.84, dur: 2.23 },
      { type: "emoji", emoji: "✨", x: 16, y: 32, size: 12, anim: "blink", delay: 1.57, dur: 1.67 },
      { type: "emoji", emoji: "💫", x: 69, y: 69, size: 10, anim: "blink", delay: 1.574, dur: 1.99 }
    ],
  },
  crab_spring_24_579: {
    v: 1,
    loop: 2.12,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#5c6bc0", opacity: 0.55, anim: "bounce", dur: 1.43, w: 95.09, h: 18.26 },
      { type: "emoji", emoji: "🦀", x: 66, y: 49, size: 33, anim: "bounce", dur: 1.34 },
      { type: "emoji", emoji: "💎", x: 73, y: 36, size: 24, anim: "float", delay: 0.73, dur: 1.62 },
      { type: "emoji", emoji: "🎉", x: 44, y: 83, size: 22, anim: "wiggle", delay: 0.96, dur: 1.41 },
      { type: "emoji", emoji: "🌟", x: 80, y: 49, size: 19, anim: "rise", delay: 0.306, dur: 2.31 },
      { type: "emoji", emoji: "✨", x: 51, y: 45, size: 12, anim: "blink", delay: 1.572, dur: 1.37 },
      { type: "emoji", emoji: "🌟", x: 54, y: 79, size: 19, anim: "blink", delay: 0.577, dur: 1.87 }
    ],
  },
  crab_halloween_24_580: {
    v: 1,
    loop: 2.95,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e6f7ff", opacity: 0.39, anim: "twinkle", dur: 2.38, r: 47.01 },
      { type: "emoji", emoji: "🦀", x: 39, y: 53, size: 32, anim: "twinkle", dur: 2.46 },
      { type: "emoji", emoji: "🎓", x: 49, y: 15, size: 29, anim: "bounce", delay: 0.311, dur: 1.75 },
      { type: "emoji", emoji: "💌", x: 71, y: 40, size: 27, anim: "pop", delay: 0.595, dur: 1.62 },
      { type: "emoji", emoji: "🌿", x: 22, y: 60, size: 22, anim: "float", delay: 0.757, dur: 1.29 },
      { type: "emoji", emoji: "✨", x: 21, y: 52, size: 20, anim: "float", delay: 0.416, dur: 1.28 },
      { type: "emoji", emoji: "🎉", x: 53, y: 21, size: 25, anim: "wiggle", delay: 0.836, dur: 2.02 },
      { type: "emoji", emoji: "💫", x: 63, y: 49, size: 12, anim: "blink", delay: 1.894, dur: 1.97 },
      { type: "emoji", emoji: "🌟", x: 41, y: 48, size: 19, anim: "blink", delay: 1.123, dur: 1.21 }
    ],
  },
  crab_christmas_24_581: {
    v: 1,
    loop: 2.97,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#0277bd", opacity: 0.46, anim: "float", dur: 3.01, r: 45.33 },
      { type: "emoji", emoji: "🦀", x: 69, y: 45, size: 36, anim: "float", dur: 3.11 },
      { type: "emoji", emoji: "🎀", x: 67, y: 28, size: 16, anim: "rise", delay: 0.961, dur: 1.42 },
      { type: "emoji", emoji: "🌟", x: 65, y: 80, size: 20, anim: "blink", delay: 0.809, dur: 1.45 },
      { type: "emoji", emoji: "🎉", x: 17, y: 27, size: 13, anim: "rise", delay: 0.922, dur: 2.13 },
      { type: "emoji", emoji: "💖", x: 36, y: 11, size: 14, anim: "blink", delay: 1.21, dur: 1.58 },
      { type: "emoji", emoji: "💫", x: 68, y: 48, size: 10, anim: "blink", delay: 0.661, dur: 1.55 },
      { type: "emoji", emoji: "💫", x: 24, y: 83, size: 11, anim: "blink", delay: 1.709, dur: 1.74 }
    ],
  },
  crab_coding_24_582: {
    v: 1,
    loop: 2.27,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ffa726", opacity: 0.5, anim: "pop", dur: 1.49, r: 47.15 },
      { type: "emoji", emoji: "🦀", x: 65, y: 55, size: 34, anim: "pop", dur: 1.64 },
      { type: "emoji", emoji: "🍃", x: 71, y: 16, size: 24, anim: "float", delay: 0.99, dur: 2.17 },
      { type: "emoji", emoji: "💖", x: 72, y: 80, size: 12, anim: "float", delay: 1.275, dur: 2.01 },
      { type: "emoji", emoji: "🎊", x: 88, y: 12, size: 22, anim: "rise", delay: 0.002, dur: 2.38 },
      { type: "emoji", emoji: "✨", x: 44, y: 32, size: 16, anim: "blink", delay: 1.401, dur: 1.09 },
      { type: "emoji", emoji: "✨", x: 37, y: 41, size: 16, anim: "blink", delay: 0.961, dur: 1.7 }
    ],
  },
  crab_music_24_583: {
    v: 1,
    loop: 3.01,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 41, y: 52, size: 42, anim: "heartbeat", dur: 2.49 },
      { type: "emoji", emoji: "🌸", x: 70, y: 42, size: 25, anim: "pop", delay: 0.882, dur: 1.88 },
      { type: "emoji", emoji: "✨", x: 30, y: 87, size: 23, anim: "blink", delay: 0.067, dur: 1.42 },
      { type: "emoji", emoji: "🍃", x: 16, y: 75, size: 23, anim: "wiggle", delay: 0.118, dur: 2.4 },
      { type: "emoji", emoji: "⭐", x: 84, y: 47, size: 18, anim: "pop", delay: 1.469, dur: 1.31 },
      { type: "emoji", emoji: "⭐", x: 62, y: 49, size: 12, anim: "blink", delay: 1.487, dur: 1.65 },
      { type: "emoji", emoji: "💖", x: 32, y: 77, size: 15, anim: "blink", delay: 1.95, dur: 1.93 }
    ],
  },
  crab_sports_24_584: {
    v: 1,
    loop: 3.75,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 33, y: 52, size: 39, anim: "float", dur: 3.62 },
      { type: "emoji", emoji: "🪖", x: 49, y: 14, size: 28, anim: "bounce", delay: 0.309, dur: 1.93 },
      { type: "emoji", emoji: "🎈", x: 12, y: 48, size: 21, anim: "rise", delay: 0.103, dur: 1.44 },
      { type: "emoji", emoji: "❄️", x: 66, y: 13, size: 21, anim: "blink", delay: 1.247, dur: 1.32 },
      { type: "emoji", emoji: "💖", x: 32, y: 46, size: 10, anim: "blink", delay: 1.093, dur: 1.47 },
      { type: "emoji", emoji: "⭐", x: 60, y: 59, size: 18, anim: "blink", delay: 0.809, dur: 1.71 }
    ],
  },
  crab_food_24_585: {
    v: 1,
    loop: 2.97,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ff5722", opacity: 0.58, anim: "float", dur: 3.21, w: 95.7, h: 23.75 },
      { type: "emoji", emoji: "🦀", x: 45, y: 44, size: 37, anim: "float", dur: 2.95 },
      { type: "emoji", emoji: "🎭", x: 51, y: 26, size: 27, anim: "bounce", delay: 0.325, dur: 1.88 },
      { type: "emoji", emoji: "🍦", x: 70, y: 43, size: 29, anim: "float", delay: 0.556, dur: 1.96 },
      { type: "emoji", emoji: "🎈", x: 67, y: 45, size: 14, anim: "pop", delay: 1.271, dur: 2.14 },
      { type: "emoji", emoji: "⭐", x: 43, y: 69, size: 13, anim: "float", delay: 0.211, dur: 2.16 },
      { type: "emoji", emoji: "🌟", x: 57, y: 20, size: 12, anim: "wiggle", delay: 0.806, dur: 1.42 },
      { type: "emoji", emoji: "⭐", x: 39, y: 68, size: 12, anim: "blink", delay: 1.663, dur: 1.03 },
      { type: "emoji", emoji: "⭐", x: 29, y: 42, size: 10, anim: "blink", delay: 0.836, dur: 1.83 }
    ],
  },
  crab_space_24_586: {
    v: 1,
    loop: 2.73,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f06292", opacity: 0.35, anim: "wave", dur: 2, w: 103.01, h: 18.55 },
      { type: "emoji", emoji: "🦀", x: 65, y: 49, size: 40, anim: "wave", dur: 1.79 },
      { type: "emoji", emoji: "👮", x: 49, y: 17, size: 29, anim: "bounce", delay: 0.571, dur: 1.77 },
      { type: "emoji", emoji: "🎉", x: 33, y: 30, size: 15, anim: "pop", delay: 1.275, dur: 2.15 },
      { type: "emoji", emoji: "🎊", x: 88, y: 22, size: 17, anim: "pop", delay: 0.924, dur: 1.84 },
      { type: "emoji", emoji: "⭐", x: 89, y: 19, size: 17, anim: "rise", delay: 0.49, dur: 1.29 },
      { type: "emoji", emoji: "✨", x: 43, y: 89, size: 17, anim: "blink", delay: 1.446, dur: 1.96 },
      { type: "emoji", emoji: "⭐", x: 42, y: 83, size: 15, anim: "blink", delay: 1.725, dur: 1.66 },
      { type: "emoji", emoji: "🌟", x: 71, y: 33, size: 10, anim: "blink", delay: 1.698, dur: 1.47 }
    ],
  },
  crab_fantasy_24_587: {
    v: 1,
    loop: 2.19,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#7b1fa2", opacity: 0.46, anim: "bounce", dur: 1.66, w: 109.31, h: 20.27 },
      { type: "emoji", emoji: "🦀", x: 31, y: 52, size: 38, anim: "bounce", dur: 1.53 },
      { type: "emoji", emoji: "🎭", x: 49, y: 26, size: 28, anim: "bounce", delay: 0.659, dur: 1.87 },
      { type: "emoji", emoji: "💌", x: 68, y: 42, size: 27, anim: "rise", delay: 0.478, dur: 1.9 },
      { type: "emoji", emoji: "🌸", x: 52, y: 24, size: 17, anim: "blink", delay: 0.266, dur: 1.69 },
      { type: "emoji", emoji: "⭐", x: 88, y: 79, size: 13, anim: "wiggle", delay: 1.176, dur: 2.04 },
      { type: "emoji", emoji: "❤️", x: 85, y: 56, size: 24, anim: "float", delay: 0.373, dur: 1.46 },
      { type: "emoji", emoji: "❤️", x: 18, y: 68, size: 19, anim: "blink", delay: 0.545, dur: 1.78 },
      { type: "emoji", emoji: "🌊", x: 24, y: 72, size: 25, anim: "blink", delay: 1.261, dur: 1.41 },
      { type: "emoji", emoji: "💖", x: 80, y: 20, size: 19, anim: "blink", delay: 1.38, dur: 1.4 },
      { type: "emoji", emoji: "💖", x: 43, y: 34, size: 10, anim: "blink", delay: 1.822, dur: 1.36 }
    ],
  },
  crab_office_24_588: {
    v: 1,
    loop: 2.11,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff176", opacity: 0.4, anim: "wiggle", dur: 1.38, w: 90.02, h: 22.1 },
      { type: "emoji", emoji: "🦀", x: 69, y: 55, size: 38, anim: "wiggle", dur: 1.37 },
      { type: "emoji", emoji: "🌿", x: 18, y: 38, size: 15, anim: "blink", delay: 0.244, dur: 1.97 },
      { type: "emoji", emoji: "🌿", x: 87, y: 65, size: 12, anim: "rise", delay: 0.071, dur: 1.25 },
      { type: "emoji", emoji: "🎊", x: 26, y: 60, size: 23, anim: "pop", delay: 1.034, dur: 1.55 },
      { type: "emoji", emoji: "⭐", x: 30, y: 30, size: 16, anim: "blink", delay: 1.07, dur: 1.01 },
      { type: "emoji", emoji: "🌟", x: 64, y: 68, size: 15, anim: "blink", delay: 1.743, dur: 1.66 }
    ],
  },
  crab_fitness_24_589: {
    v: 1,
    loop: 4.22,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 62, y: 45, size: 38, anim: "breathe", dur: 3.45 },
      { type: "emoji", emoji: "🌸", x: 72, y: 41, size: 24, anim: "blink", delay: 0.48, dur: 1.43 },
      { type: "emoji", emoji: "✨", x: 87, y: 66, size: 25, anim: "pop", delay: 1.224, dur: 2.11 },
      { type: "emoji", emoji: "🌟", x: 59, y: 85, size: 13, anim: "pop", delay: 0.523, dur: 1.6 },
      { type: "emoji", emoji: "🌟", x: 64, y: 69, size: 22, anim: "wiggle", delay: 0.28, dur: 2.08 },
      { type: "emoji", emoji: "🌟", x: 87, y: 76, size: 13, anim: "blink", delay: 0.949, dur: 1.37 },
      { type: "emoji", emoji: "🌟", x: 69, y: 77, size: 22, anim: "float", delay: 1.487, dur: 1.91 },
      { type: "emoji", emoji: "⭐", x: 43, y: 49, size: 14, anim: "blink", delay: 1.219, dur: 1.87 },
      { type: "emoji", emoji: "💖", x: 28, y: 55, size: 19, anim: "blink", delay: 1.913, dur: 1.64 }
    ],
  },
  crab_travel_24_590: {
    v: 1,
    loop: 2.66,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#e1f5fe", opacity: 0.57, anim: "pulse", dur: 2.05, w: 106.36, h: 19.13 },
      { type: "emoji", emoji: "🦀", x: 61, y: 46, size: 42, anim: "pulse", dur: 2.12 },
      { type: "emoji", emoji: "🤠", x: 51, y: 14, size: 31, anim: "bounce", delay: 0.679, dur: 1.93 },
      { type: "emoji", emoji: "❤️", x: 84, y: 53, size: 21, anim: "rise", delay: 0.443, dur: 1.57 },
      { type: "emoji", emoji: "❤️", x: 22, y: 83, size: 23, anim: "blink", delay: 0.832, dur: 1.67 },
      { type: "emoji", emoji: "🍃", x: 69, y: 47, size: 22, anim: "rise", delay: 0.22, dur: 2.23 },
      { type: "emoji", emoji: "❄️", x: 70, y: 31, size: 18, anim: "float", delay: 1.297, dur: 1.2 },
      { type: "emoji", emoji: "🌟", x: 56, y: 37, size: 13, anim: "blink", delay: 1.008, dur: 1.11 },
      { type: "emoji", emoji: "💖", x: 62, y: 40, size: 14, anim: "blink", delay: 1.218, dur: 1.63 }
    ],
  },
  crab_art_24_591: {
    v: 1,
    loop: 2.36,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#b3e5fc", opacity: 0.54, anim: "pulse", dur: 2.26, w: 100.65, h: 21.71 },
      { type: "emoji", emoji: "🦀", x: 68, y: 49, size: 39, anim: "pulse", dur: 2.25 },
      { type: "emoji", emoji: "🎀", x: 69, y: 27, size: 16, anim: "pop", delay: 0.637, dur: 1.83 },
      { type: "emoji", emoji: "🌿", x: 13, y: 70, size: 23, anim: "rise", delay: 0.945, dur: 1.75 },
      { type: "emoji", emoji: "🎈", x: 18, y: 36, size: 16, anim: "pop", delay: 1.449, dur: 2.34 },
      { type: "emoji", emoji: "💫", x: 37, y: 76, size: 12, anim: "blink", delay: 0.874, dur: 1.48 },
      { type: "emoji", emoji: "⭐", x: 27, y: 33, size: 19, anim: "blink", delay: 1.228, dur: 1.72 }
    ],
  },
  crab_science_24_592: {
    v: 1,
    loop: 3.19,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ffcc80", opacity: 0.68, anim: "float", dur: 2.57, w: 94.86, h: 22.84 },
      { type: "emoji", emoji: "🦀", x: 59, y: 46, size: 42, anim: "float", dur: 2.94 },
      { type: "emoji", emoji: "🍫", x: 69, y: 43, size: 26, anim: "rise", delay: 0.932, dur: 1.71 },
      { type: "emoji", emoji: "🌊", x: 60, y: 67, size: 25, anim: "blink", delay: 0.774, dur: 2.21 },
      { type: "emoji", emoji: "🌟", x: 63, y: 70, size: 25, anim: "rise", delay: 1.292, dur: 2.22 },
      { type: "emoji", emoji: "🌸", x: 65, y: 11, size: 14, anim: "blink", delay: 0.485, dur: 1.56 },
      { type: "emoji", emoji: "💖", x: 71, y: 53, size: 18, anim: "blink", delay: 0.85, dur: 1.68 },
      { type: "emoji", emoji: "🌟", x: 34, y: 79, size: 10, anim: "blink", delay: 1.43, dur: 1.11 }
    ],
  },
  crab_pets_24_593: {
    v: 1,
    loop: 3.26,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 61, y: 46, size: 35, anim: "settle", dur: 2.88 },
      { type: "emoji", emoji: "🌊", x: 82, y: 76, size: 14, anim: "float", delay: 0.512, dur: 1.77 },
      { type: "emoji", emoji: "🌟", x: 17, y: 17, size: 24, anim: "blink", delay: 0.356, dur: 1.91 },
      { type: "emoji", emoji: "💫", x: 85, y: 26, size: 24, anim: "rise", delay: 0.189, dur: 2.04 },
      { type: "emoji", emoji: "💫", x: 18, y: 19, size: 20, anim: "float", delay: 1.151, dur: 1.92 },
      { type: "emoji", emoji: "🌟", x: 35, y: 57, size: 18, anim: "blink", delay: 0.552, dur: 1.6 },
      { type: "emoji", emoji: "🌟", x: 18, y: 46, size: 17, anim: "blink", delay: 1.666, dur: 1.97 }
    ],
  },
  crab_magic_24_594: {
    v: 1,
    loop: 2.23,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 63, y: 49, size: 42, anim: "bounce", dur: 1.22 },
      { type: "emoji", emoji: "🍰", x: 69, y: 39, size: 29, anim: "blink", delay: 0.454, dur: 1.83 },
      { type: "emoji", emoji: "🌸", x: 84, y: 30, size: 12, anim: "blink", delay: 0.247, dur: 1.67 },
      { type: "emoji", emoji: "🎉", x: 13, y: 74, size: 12, anim: "blink", delay: 1.234, dur: 2.35 },
      { type: "emoji", emoji: "❄️", x: 79, y: 52, size: 15, anim: "wiggle", delay: 1.045, dur: 1.62 },
      { type: "emoji", emoji: "⭐", x: 72, y: 58, size: 15, anim: "blink", delay: 1.669, dur: 1.33 },
      { type: "emoji", emoji: "⭐", x: 82, y: 33, size: 10, anim: "blink", delay: 1.616, dur: 1.51 }
    ],
  },
  crab_retro_24_595: {
    v: 1,
    loop: 3.15,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ff7043", opacity: 0.43, anim: "twinkle", dur: 2.4, w: 97.52, h: 18.92 },
      { type: "emoji", emoji: "🦀", x: 68, y: 44, size: 41, anim: "twinkle", dur: 2.53 },
      { type: "emoji", emoji: "🎊", x: 87, y: 69, size: 23, anim: "pop", delay: 1.434, dur: 1.96 },
      { type: "emoji", emoji: "💖", x: 29, y: 65, size: 18, anim: "float", delay: 0.337, dur: 2.32 },
      { type: "emoji", emoji: "🍃", x: 67, y: 73, size: 21, anim: "blink", delay: 0.565, dur: 1.79 },
      { type: "emoji", emoji: "💫", x: 15, y: 81, size: 19, anim: "wiggle", delay: 0.562, dur: 2.34 },
      { type: "emoji", emoji: "🎉", x: 71, y: 69, size: 15, anim: "pop", delay: 0.121, dur: 1.82 },
      { type: "emoji", emoji: "⭐", x: 49, y: 27, size: 12, anim: "blink", delay: 1.673, dur: 1.74 },
      { type: "emoji", emoji: "💫", x: 34, y: 46, size: 18, anim: "blink", delay: 1.389, dur: 1.72 }
    ],
  },
  crab_cyber_24_596: {
    v: 1,
    loop: 3.32,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#f48fb1", opacity: 0.38, anim: "float", dur: 3.02, r: 42.74 },
      { type: "emoji", emoji: "🦀", x: 53, y: 46, size: 36, anim: "float", dur: 2.89 },
      { type: "emoji", emoji: "🎓", x: 51, y: 16, size: 29, anim: "bounce", delay: 0.632, dur: 1.82 },
      { type: "emoji", emoji: "🎈", x: 73, y: 27, size: 29, anim: "blink", delay: 0.931, dur: 1.91 },
      { type: "emoji", emoji: "🎉", x: 41, y: 26, size: 16, anim: "pop", delay: 1.287, dur: 2.3 },
      { type: "emoji", emoji: "🎈", x: 51, y: 18, size: 13, anim: "wiggle", delay: 1.294, dur: 1.23 },
      { type: "emoji", emoji: "⭐", x: 82, y: 80, size: 14, anim: "rise", delay: 1.009, dur: 1.96 },
      { type: "emoji", emoji: "🔥", x: 83, y: 15, size: 13, anim: "pop", delay: 0.205, dur: 1.35 },
      { type: "emoji", emoji: "💫", x: 38, y: 62, size: 19, anim: "pop", delay: 1.132, dur: 2.39 },
      { type: "emoji", emoji: "✨", x: 43, y: 45, size: 10, anim: "blink", delay: 1.135, dur: 1.71 },
      { type: "emoji", emoji: "💖", x: 74, y: 44, size: 19, anim: "blink", delay: 1.099, dur: 1.66 }
    ],
  },
  crab_nature_24_597: {
    v: 1,
    loop: 2.31,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#f3e5f5", opacity: 0.49, anim: "pop", dur: 1.41, w: 103.77, h: 18.02 },
      { type: "emoji", emoji: "🦀", x: 33, y: 51, size: 37, anim: "pop", dur: 1.59 },
      { type: "emoji", emoji: "👮", x: 49, y: 17, size: 29, anim: "bounce", delay: 0.667, dur: 1.92 },
      { type: "emoji", emoji: "🍭", x: 69, y: 40, size: 27, anim: "float", delay: 0.702, dur: 1.8 },
      { type: "emoji", emoji: "🔥", x: 50, y: 72, size: 21, anim: "rise", delay: 0.359, dur: 1.45 },
      { type: "emoji", emoji: "✨", x: 37, y: 81, size: 12, anim: "blink", delay: 0.539, dur: 1.92 },
      { type: "emoji", emoji: "💖", x: 24, y: 70, size: 14, anim: "blink", delay: 1.726, dur: 1.48 }
    ],
  },
  crab_underwater_24_598: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fbc02d", opacity: 0.37, anim: "heartbeat", dur: 2.39, w: 101.41, h: 26.36 },
      { type: "emoji", emoji: "🦀", x: 31, y: 54, size: 36, anim: "heartbeat", dur: 2.56 },
      { type: "emoji", emoji: "🍳", x: 51, y: 17, size: 27, anim: "bounce", delay: 0.328, dur: 1.87 },
      { type: "emoji", emoji: "🍭", x: 67, y: 37, size: 26, anim: "pop", delay: 0.944, dur: 1.6 },
      { type: "emoji", emoji: "⭐", x: 59, y: 42, size: 25, anim: "float", delay: 1.033, dur: 2.08 },
      { type: "emoji", emoji: "❤️", x: 81, y: 54, size: 23, anim: "wiggle", delay: 1.017, dur: 2.03 },
      { type: "emoji", emoji: "🍃", x: 86, y: 85, size: 23, anim: "rise", delay: 0.543, dur: 2.34 },
      { type: "emoji", emoji: "❄️", x: 54, y: 23, size: 16, anim: "blink", delay: 0.093, dur: 2.31 },
      { type: "emoji", emoji: "💫", x: 15, y: 30, size: 15, anim: "blink", delay: 1.18, dur: 1.76 },
      { type: "emoji", emoji: "✨", x: 65, y: 24, size: 16, anim: "blink", delay: 0.631, dur: 1.47 }
    ],
  },
  crab_sky_24_599: {
    v: 1,
    loop: 3.98,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 45, y: 50, size: 37, anim: "float", dur: 3.6 },
      { type: "emoji", emoji: "👮", x: 52, y: 16, size: 28, anim: "bounce", delay: 0.529, dur: 1.6 },
      { type: "emoji", emoji: "🍪", x: 70, y: 42, size: 24, anim: "float", delay: 0.972, dur: 1.68 },
      { type: "emoji", emoji: "❄️", x: 43, y: 59, size: 15, anim: "pop", delay: 1.139, dur: 1.29 },
      { type: "emoji", emoji: "🎉", x: 17, y: 24, size: 16, anim: "rise", delay: 1.052, dur: 1.46 },
      { type: "emoji", emoji: "🍂", x: 70, y: 77, size: 23, anim: "blink", delay: 1.352, dur: 1.52 },
      { type: "emoji", emoji: "🎊", x: 88, y: 51, size: 19, anim: "wiggle", delay: 0.19, dur: 2.31 },
      { type: "emoji", emoji: "⭐", x: 67, y: 37, size: 15, anim: "blink", delay: 1.349, dur: 1.86 },
      { type: "emoji", emoji: "💖", x: 37, y: 46, size: 15, anim: "blink", delay: 0.522, dur: 1.27 }
    ],
  },
  crab_party_25_600: {
    v: 1,
    loop: 3.03,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#e1f5fe", opacity: 0.66, anim: "float", dur: 3.04, w: 99.26, h: 25.13 },
      { type: "emoji", emoji: "🦀", x: 51, y: 44, size: 39, anim: "float", dur: 2.94 },
      { type: "emoji", emoji: "👑", x: 50, y: 16, size: 30, anim: "bounce", delay: 0.454, dur: 1.51 },
      { type: "emoji", emoji: "🍄", x: 70, y: 43, size: 27, anim: "rise", delay: 0.426, dur: 1.43 },
      { type: "emoji", emoji: "💫", x: 36, y: 21, size: 17, anim: "blink", delay: 1.44, dur: 1.27 },
      { type: "emoji", emoji: "🍂", x: 78, y: 64, size: 20, anim: "rise", delay: 1.001, dur: 1.71 },
      { type: "emoji", emoji: "❤️", x: 64, y: 10, size: 13, anim: "rise", delay: 0.813, dur: 2.03 },
      { type: "emoji", emoji: "🎊", x: 74, y: 32, size: 17, anim: "pop", delay: 1.477, dur: 1.28 },
      { type: "emoji", emoji: "💫", x: 49, y: 42, size: 17, anim: "blink", delay: 1.478, dur: 1.72 },
      { type: "emoji", emoji: "🌟", x: 78, y: 44, size: 15, anim: "blink", delay: 0.74, dur: 1.94 }
    ],
  },
  crab_beach_25_601: {
    v: 1,
    loop: 2.67,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#4fc3f7", opacity: 0.44, anim: "wave", dur: 1.95, r: 49.43 },
      { type: "emoji", emoji: "🦀", x: 37, y: 49, size: 38, anim: "wave", dur: 1.92 },
      { type: "emoji", emoji: "🕶️", x: 48, y: 26, size: 31, anim: "bounce", delay: 0.363, dur: 1.7 },
      { type: "emoji", emoji: "🎁", x: 73, y: 41, size: 24, anim: "blink", delay: 0.757, dur: 1.55 },
      { type: "emoji", emoji: "🎊", x: 20, y: 52, size: 20, anim: "float", delay: 0.149, dur: 1.88 },
      { type: "emoji", emoji: "⭐", x: 42, y: 62, size: 24, anim: "wiggle", delay: 0.769, dur: 2.28 },
      { type: "emoji", emoji: "🎉", x: 11, y: 78, size: 17, anim: "pop", delay: 0.571, dur: 1.55 },
      { type: "emoji", emoji: "⭐", x: 16, y: 38, size: 16, anim: "pop", delay: 0.269, dur: 2.17 },
      { type: "emoji", emoji: "✨", x: 74, y: 16, size: 12, anim: "blink", delay: 1.671, dur: 1.83 },
      { type: "emoji", emoji: "⭐", x: 52, y: 44, size: 17, anim: "blink", delay: 1.344, dur: 1.33 }
    ],
  },
  crab_winter_25_602: {
    v: 1,
    loop: 2.12,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 32, y: 51, size: 39, anim: "bounce", dur: 1.59 },
      { type: "emoji", emoji: "🧢", x: 49, y: 14, size: 29, anim: "bounce", delay: 0.337, dur: 1.92 },
      { type: "emoji", emoji: "🍄", x: 68, y: 44, size: 26, anim: "rise", delay: 0.486, dur: 1.91 },
      { type: "emoji", emoji: "🔥", x: 79, y: 15, size: 24, anim: "blink", delay: 0.519, dur: 2.31 },
      { type: "emoji", emoji: "❤️", x: 52, y: 77, size: 14, anim: "float", delay: 0.75, dur: 2.22 },
      { type: "emoji", emoji: "🎊", x: 73, y: 89, size: 17, anim: "pop", delay: 0.41, dur: 2.21 },
      { type: "emoji", emoji: "⭐", x: 62, y: 51, size: 15, anim: "rise", delay: 0.987, dur: 1.8 },
      { type: "emoji", emoji: "✨", x: 28, y: 32, size: 19, anim: "blink", delay: 1.628, dur: 1.49 },
      { type: "emoji", emoji: "🌟", x: 61, y: 41, size: 18, anim: "blink", delay: 1.543, dur: 1.61 }
    ],
  },
  crab_spring_25_603: {
    v: 1,
    loop: 1.99,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#c8e6c9", opacity: 0.58, anim: "wiggle", dur: 1.2, r: 45.01 },
      { type: "emoji", emoji: "🦀", x: 44, y: 50, size: 35, anim: "wiggle", dur: 1.48 },
      { type: "emoji", emoji: "🎈", x: 74, y: 26, size: 29, anim: "rise", delay: 0.785, dur: 1.9 },
      { type: "emoji", emoji: "⭐", x: 70, y: 37, size: 22, anim: "float", delay: 0.893, dur: 2.31 },
      { type: "emoji", emoji: "🌿", x: 17, y: 66, size: 17, anim: "rise", delay: 0.447, dur: 1.88 },
      { type: "emoji", emoji: "⭐", x: 24, y: 44, size: 17, anim: "blink", delay: 0.595, dur: 1.92 },
      { type: "emoji", emoji: "💖", x: 18, y: 66, size: 18, anim: "blink", delay: 1.866, dur: 1.05 }
    ],
  },
  crab_halloween_25_604: {
    v: 1,
    loop: 3.78,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 45, y: 49, size: 36, anim: "breathe", dur: 3.51 },
      { type: "emoji", emoji: "❄️", x: 27, y: 84, size: 18, anim: "float", delay: 0.717, dur: 1.71 },
      { type: "emoji", emoji: "❄️", x: 63, y: 19, size: 14, anim: "pop", delay: 0.531, dur: 2.25 },
      { type: "emoji", emoji: "💖", x: 66, y: 27, size: 16, anim: "blink", delay: 0.657, dur: 1.28 },
      { type: "emoji", emoji: "✨", x: 37, y: 46, size: 15, anim: "blink", delay: 0.913, dur: 1.26 }
    ],
  },
  crab_christmas_25_605: {
    v: 1,
    loop: 2.69,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 32, y: 45, size: 32, anim: "pulse", dur: 1.89 },
      { type: "emoji", emoji: "🌿", x: 70, y: 18, size: 13, anim: "pop", delay: 0.348, dur: 2.4 },
      { type: "emoji", emoji: "🔥", x: 60, y: 61, size: 20, anim: "pop", delay: 0.153, dur: 1.54 },
      { type: "emoji", emoji: "🌊", x: 55, y: 69, size: 24, anim: "pop", delay: 1.099, dur: 1.7 },
      { type: "emoji", emoji: "💫", x: 20, y: 73, size: 13, anim: "blink", delay: 0.92, dur: 1.32 },
      { type: "emoji", emoji: "💫", x: 29, y: 41, size: 19, anim: "blink", delay: 1.603, dur: 1.13 }
    ],
  },
  crab_coding_25_606: {
    v: 1,
    loop: 2.4,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#e91e63", opacity: 0.32, anim: "pulse", dur: 2.13, w: 94.51, h: 20.66 },
      { type: "emoji", emoji: "🦀", x: 46, y: 48, size: 39, anim: "pulse", dur: 2.35 },
      { type: "emoji", emoji: "🕶️", x: 51, y: 27, size: 28, anim: "bounce", delay: 0.605, dur: 1.7 },
      { type: "emoji", emoji: "🎈", x: 72, y: 30, size: 27, anim: "float", delay: 0.993, dur: 1.95 },
      { type: "emoji", emoji: "🍂", x: 33, y: 81, size: 13, anim: "blink", delay: 0.237, dur: 1.37 },
      { type: "emoji", emoji: "🎈", x: 66, y: 63, size: 12, anim: "rise", delay: 0.696, dur: 1.66 },
      { type: "emoji", emoji: "💫", x: 89, y: 23, size: 22, anim: "float", delay: 0.171, dur: 1.85 },
      { type: "emoji", emoji: "🍂", x: 12, y: 75, size: 17, anim: "wiggle", delay: 0.685, dur: 2.3 },
      { type: "emoji", emoji: "❤️", x: 71, y: 23, size: 14, anim: "blink", delay: 1.316, dur: 1.69 },
      { type: "emoji", emoji: "💫", x: 27, y: 56, size: 16, anim: "blink", delay: 1.393, dur: 1.68 },
      { type: "emoji", emoji: "🌟", x: 60, y: 27, size: 19, anim: "blink", delay: 0.85, dur: 1.84 }
    ],
  },
  crab_music_25_607: {
    v: 1,
    loop: 3.17,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 32, y: 48, size: 42, anim: "float", dur: 2.9 },
      { type: "emoji", emoji: "👑", x: 51, y: 14, size: 30, anim: "bounce", delay: 0.514, dur: 1.59 },
      { type: "emoji", emoji: "🎁", x: 72, y: 41, size: 25, anim: "blink", delay: 0.402, dur: 1.82 },
      { type: "emoji", emoji: "🌿", x: 85, y: 20, size: 25, anim: "blink", delay: 0.653, dur: 1.8 },
      { type: "emoji", emoji: "🔥", x: 87, y: 12, size: 12, anim: "wiggle", delay: 0.139, dur: 1.63 },
      { type: "emoji", emoji: "✨", x: 61, y: 52, size: 14, anim: "pop", delay: 1.448, dur: 1.76 },
      { type: "emoji", emoji: "🌿", x: 74, y: 30, size: 25, anim: "blink", delay: 0.902, dur: 2.3 },
      { type: "emoji", emoji: "💫", x: 58, y: 64, size: 17, anim: "blink", delay: 1.917, dur: 1.27 },
      { type: "emoji", emoji: "💫", x: 16, y: 58, size: 16, anim: "blink", delay: 1.019, dur: 1.68 }
    ],
  },
  crab_sports_25_608: {
    v: 1,
    loop: 3.64,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 36, y: 44, size: 44, anim: "settle", dur: 2.95 },
      { type: "emoji", emoji: "👒", x: 48, y: 12, size: 35, anim: "bounce", delay: 0.335, dur: 1.52 },
      { type: "emoji", emoji: "💌", x: 72, y: 40, size: 26, anim: "rise", delay: 0.534, dur: 1.96 },
      { type: "emoji", emoji: "🍂", x: 47, y: 64, size: 19, anim: "pop", delay: 1.338, dur: 2.25 },
      { type: "emoji", emoji: "❄️", x: 27, y: 73, size: 20, anim: "rise", delay: 0.998, dur: 1.46 },
      { type: "emoji", emoji: "💫", x: 76, y: 73, size: 13, anim: "pop", delay: 0.201, dur: 1.54 },
      { type: "emoji", emoji: "🍂", x: 89, y: 42, size: 24, anim: "rise", delay: 1.232, dur: 1.84 },
      { type: "emoji", emoji: "🌟", x: 19, y: 61, size: 17, anim: "blink", delay: 1.225, dur: 1.06 },
      { type: "emoji", emoji: "🌟", x: 44, y: 21, size: 17, anim: "blink", delay: 0.639, dur: 1.73 }
    ],
  },
  crab_food_25_609: {
    v: 1,
    loop: 2.1,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#5c6bc0", opacity: 0.68, anim: "bounce", dur: 1.29, r: 41.63 },
      { type: "emoji", emoji: "🦀", x: 36, y: 44, size: 33, anim: "bounce", dur: 1.37 },
      { type: "emoji", emoji: "🎀", x: 71, y: 30, size: 18, anim: "float", delay: 0.849, dur: 1.87 },
      { type: "emoji", emoji: "🎈", x: 12, y: 17, size: 19, anim: "float", delay: 1.335, dur: 1.95 },
      { type: "emoji", emoji: "🔥", x: 31, y: 25, size: 19, anim: "blink", delay: 0.082, dur: 1.92 },
      { type: "emoji", emoji: "💫", x: 74, y: 67, size: 10, anim: "blink", delay: 0.833, dur: 1.23 },
      { type: "emoji", emoji: "💫", x: 51, y: 18, size: 11, anim: "blink", delay: 0.639, dur: 1.59 }
    ],
  },
  crab_space_25_610: {
    v: 1,
    loop: 2.86,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff0f6", opacity: 0.36, anim: "twinkle", dur: 2.27, w: 93.24, h: 20.37 },
      { type: "emoji", emoji: "🦀", x: 54, y: 53, size: 32, anim: "twinkle", dur: 2.65 },
      { type: "emoji", emoji: "🍬", x: 72, y: 44, size: 22, anim: "rise", delay: 0.579, dur: 1.44 },
      { type: "emoji", emoji: "🎉", x: 12, y: 63, size: 22, anim: "wiggle", delay: 0.146, dur: 2.08 },
      { type: "emoji", emoji: "🌟", x: 59, y: 88, size: 19, anim: "blink", delay: 0.594, dur: 1.96 },
      { type: "emoji", emoji: "💫", x: 56, y: 76, size: 17, anim: "blink", delay: 1.97, dur: 1.69 },
      { type: "emoji", emoji: "✨", x: 24, y: 24, size: 10, anim: "blink", delay: 1.933, dur: 1.56 }
    ],
  },
  crab_fantasy_25_611: {
    v: 1,
    loop: 2.99,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#4fc3f7", opacity: 0.62, anim: "float", dur: 3.24, r: 49.19 },
      { type: "emoji", emoji: "🦀", x: 50, y: 50, size: 43, anim: "float", dur: 3.07 },
      { type: "emoji", emoji: "🎩", x: 50, y: 12, size: 33, anim: "bounce", delay: 0.412, dur: 1.56 },
      { type: "emoji", emoji: "🍩", x: 71, y: 44, size: 24, anim: "blink", delay: 0.983, dur: 1.65 },
      { type: "emoji", emoji: "💖", x: 63, y: 80, size: 17, anim: "blink", delay: 1.382, dur: 1.3 },
      { type: "emoji", emoji: "⭐", x: 57, y: 65, size: 16, anim: "float", delay: 1.115, dur: 2.38 },
      { type: "emoji", emoji: "🎈", x: 88, y: 54, size: 14, anim: "float", delay: 0.39, dur: 2.33 },
      { type: "emoji", emoji: "💫", x: 42, y: 61, size: 12, anim: "blink", delay: 1.221, dur: 1.04 },
      { type: "emoji", emoji: "💖", x: 56, y: 48, size: 14, anim: "blink", delay: 1.783, dur: 1.31 }
    ],
  },
  crab_office_25_612: {
    v: 1,
    loop: 2.25,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 55, y: 45, size: 33, anim: "pop", dur: 1.6 },
      { type: "emoji", emoji: "🎭", x: 52, y: 28, size: 29, anim: "bounce", delay: 0.586, dur: 1.92 },
      { type: "emoji", emoji: "⭐", x: 70, y: 33, size: 22, anim: "float", delay: 0.544, dur: 1.7 },
      { type: "emoji", emoji: "❄️", x: 59, y: 89, size: 12, anim: "pop", delay: 0.307, dur: 1.58 },
      { type: "emoji", emoji: "🌊", x: 61, y: 38, size: 18, anim: "rise", delay: 1.16, dur: 2.21 },
      { type: "emoji", emoji: "💫", x: 71, y: 58, size: 18, anim: "blink", delay: 1.853, dur: 1.51 },
      { type: "emoji", emoji: "🌟", x: 51, y: 37, size: 13, anim: "blink", delay: 0.911, dur: 1.53 }
    ],
  },
  crab_fitness_25_613: {
    v: 1,
    loop: 2.94,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 35, y: 48, size: 36, anim: "heartbeat", dur: 2.36 },
      { type: "emoji", emoji: "⭐", x: 73, y: 30, size: 22, anim: "float", delay: 0.571, dur: 1.45 },
      { type: "emoji", emoji: "⭐", x: 81, y: 78, size: 15, anim: "blink", delay: 1.092, dur: 1.35 },
      { type: "emoji", emoji: "🎈", x: 21, y: 44, size: 19, anim: "float", delay: 1.276, dur: 1.35 },
      { type: "emoji", emoji: "💖", x: 51, y: 74, size: 13, anim: "blink", delay: 1.133, dur: 1.95 },
      { type: "emoji", emoji: "⭐", x: 72, y: 25, size: 10, anim: "blink", delay: 1.962, dur: 1.02 }
    ],
  },
  crab_travel_25_614: {
    v: 1,
    loop: 4.05,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ede7f6", opacity: 0.64, anim: "float", dur: 3.39, w: 99, h: 27.28 },
      { type: "emoji", emoji: "🦀", x: 60, y: 53, size: 35, anim: "float", dur: 3.39 },
      { type: "emoji", emoji: "🎓", x: 51, y: 16, size: 27, anim: "bounce", delay: 0.562, dur: 1.89 },
      { type: "emoji", emoji: "🎀", x: 70, y: 30, size: 17, anim: "blink", delay: 0.55, dur: 1.83 },
      { type: "emoji", emoji: "❤️", x: 42, y: 57, size: 16, anim: "rise", delay: 1.261, dur: 1.73 },
      { type: "emoji", emoji: "⭐", x: 56, y: 84, size: 20, anim: "blink", delay: 0.679, dur: 1.8 },
      { type: "emoji", emoji: "💫", x: 76, y: 56, size: 14, anim: "wiggle", delay: 1.053, dur: 2.01 },
      { type: "emoji", emoji: "💖", x: 36, y: 78, size: 16, anim: "blink", delay: 1.28, dur: 1.78 },
      { type: "emoji", emoji: "⭐", x: 24, y: 57, size: 15, anim: "blink", delay: 1.29, dur: 1.15 },
      { type: "emoji", emoji: "🌟", x: 38, y: 50, size: 16, anim: "blink", delay: 1.451, dur: 1.01 }
    ],
  },
  crab_art_25_615: {
    v: 1,
    loop: 2.79,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 67, y: 52, size: 37, anim: "float", dur: 3.07 },
      { type: "emoji", emoji: "👑", x: 51, y: 15, size: 33, anim: "bounce", delay: 0.428, dur: 1.59 },
      { type: "emoji", emoji: "🔥", x: 37, y: 58, size: 13, anim: "float", delay: 0.089, dur: 1.45 },
      { type: "emoji", emoji: "🌿", x: 64, y: 53, size: 14, anim: "rise", delay: 1.326, dur: 1.87 },
      { type: "emoji", emoji: "❤️", x: 48, y: 27, size: 17, anim: "float", delay: 0.394, dur: 1.61 },
      { type: "emoji", emoji: "🌊", x: 14, y: 64, size: 16, anim: "wiggle", delay: 1.439, dur: 1.99 },
      { type: "emoji", emoji: "🌿", x: 81, y: 54, size: 17, anim: "pop", delay: 1.009, dur: 1.45 },
      { type: "emoji", emoji: "💖", x: 21, y: 34, size: 10, anim: "blink", delay: 1.128, dur: 1.3 },
      { type: "emoji", emoji: "🌟", x: 61, y: 46, size: 18, anim: "blink", delay: 1.701, dur: 1.17 }
    ],
  },
  crab_science_25_616: {
    v: 1,
    loop: 2.39,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f48fb1", opacity: 0.48, anim: "wave", dur: 1.64, r: 43.18 },
      { type: "emoji", emoji: "🦀", x: 35, y: 49, size: 43, anim: "wave", dur: 1.85 },
      { type: "emoji", emoji: "🎩", x: 52, y: 11, size: 30, anim: "bounce", delay: 0.415, dur: 1.85 },
      { type: "emoji", emoji: "🎀", x: 70, y: 32, size: 18, anim: "float", delay: 0.542, dur: 1.85 },
      { type: "emoji", emoji: "🌊", x: 30, y: 18, size: 13, anim: "blink", delay: 0.925, dur: 2.11 },
      { type: "emoji", emoji: "🔥", x: 70, y: 30, size: 24, anim: "rise", delay: 0.743, dur: 2.3 },
      { type: "emoji", emoji: "⭐", x: 71, y: 83, size: 15, anim: "blink", delay: 0.61, dur: 1.46 },
      { type: "emoji", emoji: "⭐", x: 68, y: 30, size: 14, anim: "blink", delay: 0.977, dur: 1.88 }
    ],
  },
  crab_pets_25_617: {
    v: 1,
    loop: 1.81,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#f3e5f5", opacity: 0.49, anim: "bounce", dur: 1.68, w: 91.64, h: 22.26 },
      { type: "emoji", emoji: "🦀", x: 48, y: 45, size: 35, anim: "bounce", dur: 1.62 },
      { type: "emoji", emoji: "👑", x: 49, y: 14, size: 28, anim: "bounce", delay: 0.554, dur: 1.73 },
      { type: "emoji", emoji: "🌹", x: 69, y: 40, size: 26, anim: "pop", delay: 0.542, dur: 1.44 },
      { type: "emoji", emoji: "🍃", x: 80, y: 37, size: 16, anim: "rise", delay: 0.761, dur: 2.05 },
      { type: "emoji", emoji: "🌊", x: 35, y: 10, size: 17, anim: "rise", delay: 0.203, dur: 1.23 },
      { type: "emoji", emoji: "🍂", x: 61, y: 50, size: 20, anim: "float", delay: 0.227, dur: 1.59 },
      { type: "emoji", emoji: "❄️", x: 43, y: 37, size: 16, anim: "float", delay: 1.462, dur: 1.96 },
      { type: "emoji", emoji: "✨", x: 79, y: 70, size: 15, anim: "rise", delay: 1.324, dur: 1.59 },
      { type: "emoji", emoji: "🌟", x: 18, y: 69, size: 12, anim: "blink", delay: 0.952, dur: 1.32 },
      { type: "emoji", emoji: "💖", x: 78, y: 71, size: 16, anim: "blink", delay: 1.281, dur: 1.2 }
    ],
  },
  crab_magic_25_618: {
    v: 1,
    loop: 2.05,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fdd835", opacity: 0.47, anim: "wiggle", dur: 1.4, r: 49.2 },
      { type: "emoji", emoji: "🦀", x: 66, y: 53, size: 39, anim: "wiggle", dur: 1.43 },
      { type: "emoji", emoji: "👑", x: 51, y: 13, size: 29, anim: "bounce", delay: 0.381, dur: 1.9 },
      { type: "emoji", emoji: "🍂", x: 70, y: 23, size: 17, anim: "pop", delay: 0.237, dur: 2.31 },
      { type: "emoji", emoji: "💖", x: 16, y: 37, size: 25, anim: "pop", delay: 0.68, dur: 1.78 },
      { type: "emoji", emoji: "✨", x: 20, y: 32, size: 14, anim: "blink", delay: 1.502, dur: 1.73 },
      { type: "emoji", emoji: "💫", x: 35, y: 76, size: 14, anim: "blink", delay: 0.595, dur: 1.13 }
    ],
  },
  crab_retro_25_619: {
    v: 1,
    loop: 3.76,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 47, y: 54, size: 41, anim: "breathe", dur: 3.57 },
      { type: "emoji", emoji: "🎈", x: 70, y: 29, size: 26, anim: "pop", delay: 0.405, dur: 1.68 },
      { type: "emoji", emoji: "💖", x: 84, y: 11, size: 18, anim: "wiggle", delay: 0.252, dur: 2.35 },
      { type: "emoji", emoji: "🔥", x: 81, y: 76, size: 17, anim: "rise", delay: 1.339, dur: 1.52 },
      { type: "emoji", emoji: "🎊", x: 63, y: 38, size: 14, anim: "float", delay: 0.755, dur: 2.26 },
      { type: "emoji", emoji: "🍃", x: 86, y: 63, size: 20, anim: "float", delay: 0.158, dur: 1.32 },
      { type: "emoji", emoji: "💖", x: 77, y: 72, size: 12, anim: "blink", delay: 1.062, dur: 1.64 },
      { type: "emoji", emoji: "🌟", x: 51, y: 24, size: 19, anim: "blink", delay: 1.906, dur: 1.01 }
    ],
  },
  crab_cyber_25_620: {
    v: 1,
    loop: 2.73,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 47, y: 56, size: 41, anim: "pulse", dur: 1.89 },
      { type: "emoji", emoji: "🍀", x: 71, y: 47, size: 23, anim: "rise", delay: 0.479, dur: 1.81 },
      { type: "emoji", emoji: "🔥", x: 60, y: 28, size: 23, anim: "rise", delay: 0.781, dur: 2.03 },
      { type: "emoji", emoji: "🍂", x: 71, y: 89, size: 23, anim: "pop", delay: 1.391, dur: 1.56 },
      { type: "emoji", emoji: "✨", x: 31, y: 43, size: 17, anim: "blink", delay: 0.687, dur: 1.35 },
      { type: "emoji", emoji: "🌟", x: 46, y: 31, size: 18, anim: "blink", delay: 1.111, dur: 1.31 }
    ],
  },
  crab_nature_25_621: {
    v: 1,
    loop: 2.4,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 55, y: 45, size: 38, anim: "pulse", dur: 2.25 },
      { type: "emoji", emoji: "🍳", x: 49, y: 16, size: 27, anim: "bounce", delay: 0.463, dur: 1.75 },
      { type: "emoji", emoji: "🍩", x: 68, y: 42, size: 25, anim: "float", delay: 0.822, dur: 1.86 },
      { type: "emoji", emoji: "💖", x: 25, y: 12, size: 22, anim: "wiggle", delay: 1.434, dur: 1.9 },
      { type: "emoji", emoji: "⭐", x: 21, y: 61, size: 17, anim: "rise", delay: 0.275, dur: 1.93 },
      { type: "emoji", emoji: "⭐", x: 59, y: 52, size: 13, anim: "blink", delay: 0.684, dur: 1.67 },
      { type: "emoji", emoji: "💫", x: 29, y: 34, size: 15, anim: "blink", delay: 0.94, dur: 1.89 }
    ],
  },
  crab_underwater_25_622: {
    v: 1,
    loop: 3.16,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffb74d", opacity: 0.45, anim: "float", dur: 2.67, r: 49.25 },
      { type: "emoji", emoji: "🦀", x: 56, y: 56, size: 38, anim: "float", dur: 2.75 },
      { type: "emoji", emoji: "🎓", x: 49, y: 15, size: 26, anim: "bounce", delay: 0.323, dur: 1.78 },
      { type: "emoji", emoji: "🎀", x: 68, y: 28, size: 17, anim: "float", delay: 0.468, dur: 1.75 },
      { type: "emoji", emoji: "🔥", x: 83, y: 30, size: 22, anim: "float", delay: 1.214, dur: 1.72 },
      { type: "emoji", emoji: "💫", x: 11, y: 88, size: 15, anim: "rise", delay: 0.132, dur: 1.52 },
      { type: "emoji", emoji: "🎈", x: 71, y: 18, size: 18, anim: "wiggle", delay: 0.005, dur: 1.37 },
      { type: "emoji", emoji: "💫", x: 78, y: 17, size: 18, anim: "blink", delay: 1.751, dur: 1.79 },
      { type: "emoji", emoji: "💫", x: 57, y: 64, size: 19, anim: "blink", delay: 1.114, dur: 1.81 }
    ],
  },
  crab_sky_25_623: {
    v: 1,
    loop: 3.54,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 38, y: 50, size: 42, anim: "settle", dur: 3.09 },
      { type: "emoji", emoji: "👒", x: 49, y: 13, size: 35, anim: "bounce", delay: 0.47, dur: 1.91 },
      { type: "emoji", emoji: "🌟", x: 74, y: 30, size: 26, anim: "pop", delay: 0.963, dur: 1.57 },
      { type: "emoji", emoji: "❄️", x: 80, y: 17, size: 18, anim: "float", delay: 0.236, dur: 2.22 },
      { type: "emoji", emoji: "🎈", x: 42, y: 19, size: 21, anim: "wiggle", delay: 0.438, dur: 1.97 },
      { type: "emoji", emoji: "⭐", x: 40, y: 29, size: 19, anim: "blink", delay: 1.144, dur: 1.06 },
      { type: "emoji", emoji: "🌟", x: 37, y: 27, size: 10, anim: "blink", delay: 0.875, dur: 1.96 }
    ],
  },
  crab_party_26_624: {
    v: 1,
    loop: 2.01,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 42, y: 50, size: 33, anim: "bounce", dur: 1.24 },
      { type: "emoji", emoji: "👑", x: 49, y: 14, size: 31, anim: "bounce", delay: 0.452, dur: 1.71 },
      { type: "emoji", emoji: "🍭", x: 70, y: 38, size: 26, anim: "blink", delay: 0.423, dur: 1.71 },
      { type: "emoji", emoji: "🌊", x: 82, y: 74, size: 15, anim: "rise", delay: 1.024, dur: 2.28 },
      { type: "emoji", emoji: "🎊", x: 56, y: 77, size: 23, anim: "pop", delay: 1.046, dur: 1.85 },
      { type: "emoji", emoji: "⭐", x: 67, y: 39, size: 19, anim: "blink", delay: 1.693, dur: 1.85 },
      { type: "emoji", emoji: "⭐", x: 62, y: 46, size: 16, anim: "blink", delay: 0.677, dur: 1.11 }
    ],
  },
  crab_beach_26_625: {
    v: 1,
    loop: 3.02,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ff8a65", opacity: 0.49, anim: "twinkle", dur: 2.73, w: 93.89, h: 27.9 },
      { type: "emoji", emoji: "🦀", x: 39, y: 52, size: 36, anim: "twinkle", dur: 2.63 },
      { type: "emoji", emoji: "🍬", x: 70, y: 45, size: 22, anim: "rise", delay: 0.978, dur: 1.47 },
      { type: "emoji", emoji: "⭐", x: 21, y: 38, size: 12, anim: "blink", delay: 0.748, dur: 1.55 },
      { type: "emoji", emoji: "✨", x: 68, y: 83, size: 13, anim: "blink", delay: 0.767, dur: 1.83 }
    ],
  },
  crab_winter_26_626: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f48fb1", opacity: 0.47, anim: "float", dur: 2.9, w: 91.19, h: 25.18 },
      { type: "emoji", emoji: "🦀", x: 45, y: 49, size: 42, anim: "float", dur: 2.93 },
      { type: "emoji", emoji: "👮", x: 48, y: 17, size: 28, anim: "bounce", delay: 0.377, dur: 1.54 },
      { type: "emoji", emoji: "💖", x: 72, y: 26, size: 13, anim: "blink", delay: 0.716, dur: 1.2 },
      { type: "emoji", emoji: "💖", x: 87, y: 27, size: 13, anim: "pop", delay: 0.562, dur: 2.13 },
      { type: "emoji", emoji: "💖", x: 64, y: 23, size: 12, anim: "rise", delay: 0.166, dur: 1.61 },
      { type: "emoji", emoji: "💫", x: 51, y: 44, size: 14, anim: "blink", delay: 1.338, dur: 1.37 },
      { type: "emoji", emoji: "💫", x: 54, y: 71, size: 12, anim: "blink", delay: 1.442, dur: 1.43 }
    ],
  },
  crab_spring_26_627: {
    v: 1,
    loop: 2.14,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ab47bc", opacity: 0.56, anim: "pop", dur: 1.81, w: 98.82, h: 19.44 },
      { type: "emoji", emoji: "🦀", x: 69, y: 51, size: 34, anim: "pop", dur: 1.55 },
      { type: "emoji", emoji: "👒", x: 52, y: 16, size: 34, anim: "bounce", delay: 0.393, dur: 1.74 },
      { type: "emoji", emoji: "🍰", x: 70, y: 39, size: 28, anim: "rise", delay: 0.534, dur: 1.59 },
      { type: "emoji", emoji: "🌟", x: 43, y: 11, size: 20, anim: "float", delay: 0.37, dur: 1.32 },
      { type: "emoji", emoji: "🎉", x: 60, y: 19, size: 17, anim: "float", delay: 1.124, dur: 2 },
      { type: "emoji", emoji: "⭐", x: 47, y: 46, size: 12, anim: "blink", delay: 1.902, dur: 1.92 },
      { type: "emoji", emoji: "⭐", x: 66, y: 57, size: 13, anim: "blink", delay: 1.268, dur: 1.29 }
    ],
  },
  crab_halloween_26_628: {
    v: 1,
    loop: 2.96,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ffee58", opacity: 0.66, anim: "heartbeat", dur: 2.47, w: 97.52, h: 20.48 },
      { type: "emoji", emoji: "🦀", x: 55, y: 45, size: 42, anim: "heartbeat", dur: 2.49 },
      { type: "emoji", emoji: "🎩", x: 49, y: 11, size: 31, anim: "bounce", delay: 0.484, dur: 1.59 },
      { type: "emoji", emoji: "🍫", x: 68, y: 46, size: 25, anim: "blink", delay: 0.555, dur: 1.51 },
      { type: "emoji", emoji: "💫", x: 32, y: 21, size: 24, anim: "pop", delay: 1.113, dur: 1.39 },
      { type: "emoji", emoji: "⭐", x: 69, y: 12, size: 16, anim: "pop", delay: 0.253, dur: 2.18 },
      { type: "emoji", emoji: "⭐", x: 31, y: 37, size: 13, anim: "blink", delay: 1.809, dur: 1.15 },
      { type: "emoji", emoji: "💖", x: 47, y: 15, size: 12, anim: "blink", delay: 1.592, dur: 1.87 }
    ],
  },
  crab_christmas_26_629: {
    v: 1,
    loop: 3.96,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#303f9f", opacity: 0.32, anim: "float", dur: 3.6, r: 42.11 },
      { type: "emoji", emoji: "🦀", x: 65, y: 55, size: 34, anim: "float", dur: 3.43 },
      { type: "emoji", emoji: "🌸", x: 62, y: 44, size: 18, anim: "wiggle", delay: 1.006, dur: 1.74 },
      { type: "emoji", emoji: "🎊", x: 86, y: 16, size: 18, anim: "float", delay: 0.442, dur: 1.76 },
      { type: "emoji", emoji: "❄️", x: 57, y: 23, size: 20, anim: "rise", delay: 1.154, dur: 2.07 },
      { type: "emoji", emoji: "🌸", x: 16, y: 13, size: 24, anim: "pop", delay: 1.246, dur: 1.48 },
      { type: "emoji", emoji: "🌟", x: 32, y: 66, size: 15, anim: "blink", delay: 1.328, dur: 1.32 },
      { type: "emoji", emoji: "✨", x: 83, y: 66, size: 14, anim: "blink", delay: 0.518, dur: 1.39 }
    ],
  },
  crab_coding_26_630: {
    v: 1,
    loop: 2.77,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 47, y: 54, size: 35, anim: "float", dur: 2.99 },
      { type: "emoji", emoji: "👑", x: 49, y: 13, size: 31, anim: "bounce", delay: 0.39, dur: 1.94 },
      { type: "emoji", emoji: "🌸", x: 13, y: 36, size: 16, anim: "float", delay: 0.933, dur: 1.82 },
      { type: "emoji", emoji: "💖", x: 32, y: 81, size: 16, anim: "pop", delay: 0.925, dur: 1.65 },
      { type: "emoji", emoji: "💖", x: 35, y: 85, size: 14, anim: "wiggle", delay: 1.183, dur: 1.91 },
      { type: "emoji", emoji: "⭐", x: 44, y: 29, size: 14, anim: "blink", delay: 1.705, dur: 1.24 },
      { type: "emoji", emoji: "💖", x: 60, y: 74, size: 11, anim: "blink", delay: 1.817, dur: 1.22 }
    ],
  },
  crab_music_26_631: {
    v: 1,
    loop: 2.6,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#4fc3f7", opacity: 0.66, anim: "wave", dur: 1.81, w: 109.55, h: 26.08 },
      { type: "emoji", emoji: "🦀", x: 55, y: 49, size: 39, anim: "wave", dur: 1.71 },
      { type: "emoji", emoji: "👑", x: 49, y: 13, size: 28, anim: "bounce", delay: 0.607, dur: 1.81 },
      { type: "emoji", emoji: "🌹", x: 70, y: 45, size: 26, anim: "pop", delay: 0.855, dur: 1.99 },
      { type: "emoji", emoji: "⭐", x: 87, y: 47, size: 25, anim: "wiggle", delay: 0.74, dur: 2.37 },
      { type: "emoji", emoji: "🌊", x: 18, y: 24, size: 25, anim: "float", delay: 1.278, dur: 2.39 },
      { type: "emoji", emoji: "🎊", x: 52, y: 69, size: 13, anim: "blink", delay: 1.174, dur: 2.28 },
      { type: "emoji", emoji: "🎉", x: 88, y: 20, size: 20, anim: "rise", delay: 1.19, dur: 1.8 },
      { type: "emoji", emoji: "🌟", x: 36, y: 51, size: 19, anim: "blink", delay: 0.145, dur: 2.19 },
      { type: "emoji", emoji: "⭐", x: 22, y: 30, size: 13, anim: "blink", delay: 0.567, dur: 1.18 },
      { type: "emoji", emoji: "✨", x: 18, y: 47, size: 19, anim: "blink", delay: 1.06, dur: 1.46 }
    ],
  },
  crab_sports_26_632: {
    v: 1,
    loop: 1.83,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fb8c00", opacity: 0.66, anim: "bounce", dur: 1.32, w: 92.35, h: 19.28 },
      { type: "emoji", emoji: "🦀", x: 48, y: 52, size: 41, anim: "bounce", dur: 1.53 },
      { type: "emoji", emoji: "🌟", x: 72, y: 29, size: 25, anim: "blink", delay: 0.998, dur: 1.81 },
      { type: "emoji", emoji: "🎈", x: 45, y: 50, size: 21, anim: "pop", delay: 0.488, dur: 1.25 },
      { type: "emoji", emoji: "🌟", x: 23, y: 55, size: 17, anim: "float", delay: 1.198, dur: 1.5 },
      { type: "emoji", emoji: "⭐", x: 30, y: 55, size: 14, anim: "blink", delay: 1.453, dur: 2.37 },
      { type: "emoji", emoji: "✨", x: 37, y: 51, size: 22, anim: "pop", delay: 0.238, dur: 1.77 },
      { type: "emoji", emoji: "💫", x: 51, y: 81, size: 17, anim: "blink", delay: 1.114, dur: 1.73 },
      { type: "emoji", emoji: "💫", x: 32, y: 68, size: 16, anim: "blink", delay: 0.911, dur: 1.87 }
    ],
  },
  crab_food_26_633: {
    v: 1,
    loop: 2.4,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 33, y: 53, size: 35, anim: "wiggle", dur: 1.51 },
      { type: "emoji", emoji: "🧢", x: 50, y: 14, size: 30, anim: "bounce", delay: 0.593, dur: 1.64 },
      { type: "emoji", emoji: "🌟", x: 74, y: 31, size: 26, anim: "rise", delay: 0.783, dur: 1.42 },
      { type: "emoji", emoji: "🔥", x: 29, y: 84, size: 18, anim: "rise", delay: 0.474, dur: 1.92 },
      { type: "emoji", emoji: "✨", x: 65, y: 83, size: 17, anim: "float", delay: 0.109, dur: 2.12 },
      { type: "emoji", emoji: "✨", x: 79, y: 69, size: 16, anim: "blink", delay: 1.118, dur: 1.21 },
      { type: "emoji", emoji: "✨", x: 33, y: 34, size: 16, anim: "blink", delay: 1.111, dur: 1.56 }
    ],
  },
  crab_space_26_634: {
    v: 1,
    loop: 4.15,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#b39ddb", opacity: 0.59, anim: "breathe", dur: 3.28, w: 97.11, h: 22.69 },
      { type: "emoji", emoji: "🦀", x: 51, y: 52, size: 38, anim: "breathe", dur: 3.44 },
      { type: "emoji", emoji: "🪖", x: 49, y: 16, size: 30, anim: "bounce", delay: 0.595, dur: 1.66 },
      { type: "emoji", emoji: "🍪", x: 71, y: 46, size: 23, anim: "blink", delay: 0.621, dur: 1.78 },
      { type: "emoji", emoji: "⭐", x: 41, y: 74, size: 13, anim: "blink", delay: 1.167, dur: 1.3 },
      { type: "emoji", emoji: "⭐", x: 51, y: 18, size: 10, anim: "blink", delay: 1.438, dur: 1.53 }
    ],
  },
  crab_fantasy_26_635: {
    v: 1,
    loop: 2.84,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffab91", opacity: 0.32, anim: "pulse", dur: 2.03, r: 49.1 },
      { type: "emoji", emoji: "🦀", x: 60, y: 55, size: 39, anim: "pulse", dur: 1.97 },
      { type: "emoji", emoji: "🍳", x: 50, y: 15, size: 28, anim: "bounce", delay: 0.635, dur: 1.79 },
      { type: "emoji", emoji: "🌊", x: 68, y: 40, size: 22, anim: "rise", delay: 0.113, dur: 1.8 },
      { type: "emoji", emoji: "✨", x: 66, y: 67, size: 21, anim: "wiggle", delay: 1.027, dur: 1.74 },
      { type: "emoji", emoji: "🍂", x: 87, y: 52, size: 15, anim: "wiggle", delay: 1.087, dur: 1.49 },
      { type: "emoji", emoji: "✨", x: 53, y: 44, size: 10, anim: "blink", delay: 1.736, dur: 1.49 },
      { type: "emoji", emoji: "💖", x: 79, y: 20, size: 13, anim: "blink", delay: 0.976, dur: 1.65 }
    ],
  },
  crab_office_26_636: {
    v: 1,
    loop: 2.4,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#d81b60", opacity: 0.64, anim: "pulse", dur: 2.18, w: 95.1, h: 20.33 },
      { type: "emoji", emoji: "🦀", x: 48, y: 49, size: 35, anim: "pulse", dur: 2.22 },
      { type: "emoji", emoji: "🧙", x: 50, y: 13, size: 32, anim: "bounce", delay: 0.432, dur: 1.6 },
      { type: "emoji", emoji: "🎈", x: 41, y: 19, size: 25, anim: "pop", delay: 1.265, dur: 1.21 },
      { type: "emoji", emoji: "🌊", x: 16, y: 43, size: 24, anim: "float", delay: 1.056, dur: 1.98 },
      { type: "emoji", emoji: "✨", x: 50, y: 65, size: 14, anim: "pop", delay: 0.61, dur: 1.62 },
      { type: "emoji", emoji: "🌊", x: 79, y: 46, size: 20, anim: "pop", delay: 1.235, dur: 1.73 },
      { type: "emoji", emoji: "🌟", x: 15, y: 20, size: 18, anim: "blink", delay: 0.93, dur: 1.96 },
      { type: "emoji", emoji: "💖", x: 33, y: 39, size: 14, anim: "blink", delay: 0.693, dur: 1.06 }
    ],
  },
  crab_fitness_26_637: {
    v: 1,
    loop: 2.75,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e1bee7", opacity: 0.52, anim: "float", dur: 2.6, r: 48.03 },
      { type: "emoji", emoji: "🦀", x: 52, y: 54, size: 42, anim: "float", dur: 2.78 },
      { type: "emoji", emoji: "🎈", x: 70, y: 29, size: 29, anim: "pop", delay: 0.978, dur: 1.48 },
      { type: "emoji", emoji: "❄️", x: 71, y: 70, size: 12, anim: "float", delay: 0.812, dur: 1.86 },
      { type: "emoji", emoji: "❄️", x: 76, y: 59, size: 24, anim: "pop", delay: 1.315, dur: 1.44 },
      { type: "emoji", emoji: "🌟", x: 31, y: 70, size: 10, anim: "blink", delay: 1.649, dur: 1.8 },
      { type: "emoji", emoji: "🌟", x: 70, y: 67, size: 15, anim: "blink", delay: 0.573, dur: 1.85 }
    ],
  },
  crab_travel_26_638: {
    v: 1,
    loop: 3.61,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ffee58", opacity: 0.46, anim: "settle", dur: 3.09, w: 98.91, h: 23.63 },
      { type: "emoji", emoji: "🦀", x: 41, y: 44, size: 43, anim: "settle", dur: 3.07 },
      { type: "emoji", emoji: "✨", x: 55, y: 80, size: 24, anim: "wiggle", delay: 0.472, dur: 1.55 },
      { type: "emoji", emoji: "💫", x: 44, y: 33, size: 20, anim: "blink", delay: 1.012, dur: 1.76 },
      { type: "emoji", emoji: "🍃", x: 64, y: 89, size: 17, anim: "pop", delay: 1.029, dur: 1.29 },
      { type: "emoji", emoji: "⭐", x: 19, y: 63, size: 15, anim: "blink", delay: 0.665, dur: 1.1 },
      { type: "emoji", emoji: "💖", x: 68, y: 49, size: 12, anim: "blink", delay: 0.619, dur: 1.45 }
    ],
  },
  crab_art_26_639: {
    v: 1,
    loop: 1.97,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#303f9f", opacity: 0.31, anim: "bounce", dur: 1.31, r: 49.6 },
      { type: "emoji", emoji: "🦀", x: 39, y: 46, size: 40, anim: "bounce", dur: 1.25 },
      { type: "emoji", emoji: "🧣", x: 49, y: 60, size: 25, anim: "bounce", delay: 0.443, dur: 1.9 },
      { type: "emoji", emoji: "🍫", x: 72, y: 46, size: 26, anim: "blink", delay: 0.53, dur: 1.47 },
      { type: "emoji", emoji: "🌊", x: 51, y: 13, size: 14, anim: "blink", delay: 0.562, dur: 1.67 },
      { type: "emoji", emoji: "🌊", x: 64, y: 30, size: 22, anim: "float", delay: 0.876, dur: 1.32 },
      { type: "emoji", emoji: "🌟", x: 31, y: 64, size: 13, anim: "blink", delay: 1.691, dur: 1.93 },
      { type: "emoji", emoji: "💫", x: 63, y: 82, size: 11, anim: "blink", delay: 1.021, dur: 1.38 }
    ],
  },
  crab_science_26_640: {
    v: 1,
    loop: 2.91,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff0f6", opacity: 0.54, anim: "twinkle", dur: 2.64, w: 102.73, h: 18.75 },
      { type: "emoji", emoji: "🦀", x: 51, y: 55, size: 38, anim: "twinkle", dur: 2.6 },
      { type: "emoji", emoji: "🎓", x: 52, y: 17, size: 27, anim: "bounce", delay: 0.607, dur: 1.51 },
      { type: "emoji", emoji: "🍄", x: 70, y: 44, size: 25, anim: "pop", delay: 0.522, dur: 1.61 },
      { type: "emoji", emoji: "🍂", x: 75, y: 88, size: 18, anim: "float", delay: 0.153, dur: 2.19 },
      { type: "emoji", emoji: "🎊", x: 11, y: 29, size: 15, anim: "wiggle", delay: 0.42, dur: 2.06 },
      { type: "emoji", emoji: "✨", x: 88, y: 33, size: 17, anim: "pop", delay: 1.385, dur: 1.8 },
      { type: "emoji", emoji: "💖", x: 58, y: 54, size: 18, anim: "blink", delay: 0.612, dur: 1.77 },
      { type: "emoji", emoji: "🌟", x: 19, y: 64, size: 12, anim: "blink", delay: 0.93, dur: 1.34 }
    ],
  },
  crab_pets_26_641: {
    v: 1,
    loop: 3.11,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 33, y: 46, size: 43, anim: "float", dur: 3.1 },
      { type: "emoji", emoji: "💫", x: 89, y: 76, size: 20, anim: "wiggle", delay: 1.43, dur: 1.53 },
      { type: "emoji", emoji: "✨", x: 41, y: 15, size: 14, anim: "pop", delay: 0.293, dur: 1.83 },
      { type: "emoji", emoji: "🎊", x: 52, y: 27, size: 21, anim: "blink", delay: 0.584, dur: 2.22 },
      { type: "emoji", emoji: "❄️", x: 12, y: 75, size: 16, anim: "pop", delay: 0.268, dur: 2.09 },
      { type: "emoji", emoji: "💖", x: 39, y: 36, size: 19, anim: "blink", delay: 1.047, dur: 1.85 },
      { type: "emoji", emoji: "💖", x: 34, y: 83, size: 11, anim: "blink", delay: 0.74, dur: 1.2 }
    ],
  },
  crab_magic_26_642: {
    v: 1,
    loop: 2.32,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 45, y: 55, size: 37, anim: "pop", dur: 1.73 },
      { type: "emoji", emoji: "🕶️", x: 49, y: 27, size: 30, anim: "bounce", delay: 0.509, dur: 1.52 },
      { type: "emoji", emoji: "🍰", x: 68, y: 39, size: 26, anim: "float", delay: 0.837, dur: 1.86 },
      { type: "emoji", emoji: "🎊", x: 84, y: 61, size: 18, anim: "float", delay: 0.584, dur: 1.62 },
      { type: "emoji", emoji: "🌿", x: 35, y: 40, size: 14, anim: "wiggle", delay: 0.433, dur: 1.56 },
      { type: "emoji", emoji: "✨", x: 81, y: 55, size: 16, anim: "blink", delay: 1.672, dur: 1.06 },
      { type: "emoji", emoji: "⭐", x: 32, y: 49, size: 17, anim: "blink", delay: 1.64, dur: 1.73 }
    ],
  },
  crab_retro_26_643: {
    v: 1,
    loop: 2.81,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#43a047", opacity: 0.65, anim: "heartbeat", dur: 2.57, w: 103.11, h: 26.28 },
      { type: "emoji", emoji: "🦀", x: 44, y: 50, size: 41, anim: "heartbeat", dur: 2.46 },
      { type: "emoji", emoji: "🍂", x: 76, y: 77, size: 22, anim: "wiggle", delay: 0.493, dur: 1.45 },
      { type: "emoji", emoji: "🌟", x: 40, y: 86, size: 14, anim: "rise", delay: 1.332, dur: 1.93 },
      { type: "emoji", emoji: "⭐", x: 83, y: 23, size: 18, anim: "blink", delay: 0.078, dur: 2.09 },
      { type: "emoji", emoji: "🌸", x: 38, y: 49, size: 14, anim: "rise", delay: 0.078, dur: 2.27 },
      { type: "emoji", emoji: "✨", x: 76, y: 27, size: 19, anim: "blink", delay: 1.473, dur: 1.25 },
      { type: "emoji", emoji: "💫", x: 34, y: 35, size: 11, anim: "blink", delay: 1.11, dur: 1.74 }
    ],
  },
  crab_cyber_26_644: {
    v: 1,
    loop: 3.75,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ede7f6", opacity: 0.58, anim: "float", dur: 3.44, w: 105.43, h: 25.95 },
      { type: "emoji", emoji: "🦀", x: 46, y: 50, size: 42, anim: "float", dur: 3.43 },
      { type: "emoji", emoji: "🍪", x: 72, y: 41, size: 22, anim: "pop", delay: 0.783, dur: 1.82 },
      { type: "emoji", emoji: "✨", x: 64, y: 81, size: 15, anim: "pop", delay: 0.06, dur: 2.1 },
      { type: "emoji", emoji: "🌊", x: 62, y: 72, size: 15, anim: "wiggle", delay: 0.323, dur: 2.16 },
      { type: "emoji", emoji: "🎊", x: 40, y: 33, size: 21, anim: "rise", delay: 0.138, dur: 1.63 },
      { type: "emoji", emoji: "✨", x: 19, y: 11, size: 24, anim: "wiggle", delay: 0.743, dur: 2.28 },
      { type: "emoji", emoji: "✨", x: 21, y: 42, size: 12, anim: "pop", delay: 1.348, dur: 1.8 },
      { type: "emoji", emoji: "⭐", x: 68, y: 67, size: 13, anim: "blink", delay: 1.56, dur: 1.27 },
      { type: "emoji", emoji: "⭐", x: 34, y: 54, size: 13, anim: "blink", delay: 1.52, dur: 1.53 }
    ],
  },
  crab_nature_26_645: {
    v: 1,
    loop: 2.84,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 59, y: 50, size: 38, anim: "float", dur: 2.93 },
      { type: "emoji", emoji: "🌹", x: 69, y: 41, size: 26, anim: "blink", delay: 0.923, dur: 1.87 },
      { type: "emoji", emoji: "✨", x: 85, y: 19, size: 12, anim: "rise", delay: 1.284, dur: 1.96 },
      { type: "emoji", emoji: "⭐", x: 80, y: 59, size: 19, anim: "blink", delay: 0.638, dur: 1.71 },
      { type: "emoji", emoji: "🌟", x: 19, y: 51, size: 12, anim: "blink", delay: 1.75, dur: 1.51 }
    ],
  },
  crab_underwater_26_646: {
    v: 1,
    loop: 2.7,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 43, y: 52, size: 43, anim: "wave", dur: 1.93 },
      { type: "emoji", emoji: "🌟", x: 71, y: 29, size: 26, anim: "blink", delay: 0.931, dur: 1.97 },
      { type: "emoji", emoji: "🍂", x: 36, y: 14, size: 21, anim: "wiggle", delay: 0.403, dur: 1.31 },
      { type: "emoji", emoji: "🎈", x: 27, y: 13, size: 24, anim: "float", delay: 0.261, dur: 1.56 },
      { type: "emoji", emoji: "🌸", x: 20, y: 73, size: 24, anim: "rise", delay: 1.275, dur: 1.42 },
      { type: "emoji", emoji: "🌟", x: 79, y: 72, size: 15, anim: "blink", delay: 0.526, dur: 1.98 },
      { type: "emoji", emoji: "✨", x: 77, y: 68, size: 18, anim: "blink", delay: 0.644, dur: 1.63 }
    ],
  },
  crab_sky_26_647: {
    v: 1,
    loop: 2.04,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#e1bee7", opacity: 0.6, anim: "bounce", dur: 1.68, w: 105.91, h: 27.16 },
      { type: "emoji", emoji: "🦀", x: 68, y: 54, size: 35, anim: "bounce", dur: 1.46 },
      { type: "emoji", emoji: "👮", x: 48, y: 14, size: 30, anim: "bounce", delay: 0.562, dur: 1.52 },
      { type: "emoji", emoji: "🔥", x: 13, y: 81, size: 21, anim: "float", delay: 0.372, dur: 2.22 },
      { type: "emoji", emoji: "💫", x: 59, y: 23, size: 19, anim: "blink", delay: 1.218, dur: 1.52 },
      { type: "emoji", emoji: "✨", x: 37, y: 62, size: 19, anim: "blink", delay: 1.722, dur: 1.87 }
    ],
  },
  crab_party_27_648: {
    v: 1,
    loop: 2.05,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 65, y: 48, size: 43, anim: "wiggle", dur: 1.46 },
      { type: "emoji", emoji: "🪖", x: 49, y: 15, size: 29, anim: "bounce", delay: 0.696, dur: 1.88 },
      { type: "emoji", emoji: "🌸", x: 68, y: 42, size: 26, anim: "pop", delay: 0.741, dur: 1.57 },
      { type: "emoji", emoji: "❤️", x: 88, y: 71, size: 18, anim: "pop", delay: 1.32, dur: 1.7 },
      { type: "emoji", emoji: "🎈", x: 10, y: 40, size: 21, anim: "float", delay: 1.047, dur: 1.3 },
      { type: "emoji", emoji: "🎉", x: 43, y: 67, size: 21, anim: "wiggle", delay: 0.785, dur: 2.13 },
      { type: "emoji", emoji: "⭐", x: 68, y: 62, size: 19, anim: "float", delay: 1.319, dur: 1.44 },
      { type: "emoji", emoji: "💖", x: 30, y: 23, size: 13, anim: "blink", delay: 1.384, dur: 1.72 },
      { type: "emoji", emoji: "🌟", x: 38, y: 53, size: 15, anim: "blink", delay: 1.519, dur: 1.68 }
    ],
  },
  crab_beach_27_649: {
    v: 1,
    loop: 4.24,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#303f9f", opacity: 0.32, anim: "breathe", dur: 3.51, w: 101.69, h: 25.49 },
      { type: "emoji", emoji: "🦀", x: 33, y: 50, size: 43, anim: "breathe", dur: 3.51 },
      { type: "emoji", emoji: "🤠", x: 49, y: 14, size: 30, anim: "bounce", delay: 0.602, dur: 1.97 },
      { type: "emoji", emoji: "🍫", x: 68, y: 46, size: 26, anim: "float", delay: 0.948, dur: 1.67 },
      { type: "emoji", emoji: "🎈", x: 35, y: 61, size: 14, anim: "float", delay: 0.251, dur: 2.07 },
      { type: "emoji", emoji: "💖", x: 40, y: 84, size: 13, anim: "rise", delay: 0.768, dur: 2.17 },
      { type: "emoji", emoji: "🌊", x: 52, y: 66, size: 18, anim: "pop", delay: 0.628, dur: 1.64 },
      { type: "emoji", emoji: "❄️", x: 51, y: 88, size: 23, anim: "wiggle", delay: 1.431, dur: 2.17 },
      { type: "emoji", emoji: "🍃", x: 62, y: 46, size: 17, anim: "rise", delay: 0.087, dur: 1.98 },
      { type: "emoji", emoji: "💖", x: 63, y: 39, size: 17, anim: "blink", delay: 1.254, dur: 1.47 },
      { type: "emoji", emoji: "🌟", x: 64, y: 74, size: 13, anim: "blink", delay: 1.579, dur: 1.66 }
    ],
  },
  crab_winter_27_650: {
    v: 1,
    loop: 2.78,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff0f6", opacity: 0.46, anim: "pulse", dur: 1.89, w: 103.89, h: 23.08 },
      { type: "emoji", emoji: "🦀", x: 38, y: 51, size: 43, anim: "pulse", dur: 1.99 },
      { type: "emoji", emoji: "❄️", x: 29, y: 37, size: 14, anim: "blink", delay: 0.428, dur: 1.72 },
      { type: "emoji", emoji: "🍂", x: 37, y: 89, size: 25, anim: "blink", delay: 1.459, dur: 2.36 },
      { type: "emoji", emoji: "⭐", x: 78, y: 71, size: 14, anim: "blink", delay: 1.977, dur: 1.79 },
      { type: "emoji", emoji: "🌟", x: 70, y: 44, size: 13, anim: "blink", delay: 1.542, dur: 1.02 }
    ],
  },
  crab_spring_27_651: {
    v: 1,
    loop: 2.53,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#039be5", opacity: 0.68, anim: "pulse", dur: 1.97, r: 45.14 },
      { type: "emoji", emoji: "🦀", x: 67, y: 47, size: 38, anim: "pulse", dur: 2.25 },
      { type: "emoji", emoji: "💖", x: 86, y: 26, size: 18, anim: "blink", delay: 1.23, dur: 2.39 },
      { type: "emoji", emoji: "🌟", x: 14, y: 84, size: 12, anim: "wiggle", delay: 0.694, dur: 2.32 },
      { type: "emoji", emoji: "⭐", x: 74, y: 30, size: 19, anim: "float", delay: 1.024, dur: 2.2 },
      { type: "emoji", emoji: "🌟", x: 58, y: 60, size: 16, anim: "blink", delay: 1.652, dur: 1.48 },
      { type: "emoji", emoji: "💖", x: 58, y: 77, size: 16, anim: "blink", delay: 0.941, dur: 1.23 }
    ],
  },
  crab_halloween_27_652: {
    v: 1,
    loop: 2.96,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 65, y: 50, size: 42, anim: "float", dur: 2.81 },
      { type: "emoji", emoji: "🎓", x: 51, y: 15, size: 27, anim: "bounce", delay: 0.559, dur: 1.62 },
      { type: "emoji", emoji: "❄️", x: 88, y: 33, size: 19, anim: "float", delay: 0.492, dur: 2.23 },
      { type: "emoji", emoji: "⭐", x: 81, y: 63, size: 15, anim: "float", delay: 1.036, dur: 1.39 },
      { type: "emoji", emoji: "🌟", x: 44, y: 70, size: 16, anim: "blink", delay: 0.824, dur: 1.02 },
      { type: "emoji", emoji: "💖", x: 58, y: 18, size: 14, anim: "blink", delay: 0.572, dur: 1.01 }
    ],
  },
  crab_christmas_27_653: {
    v: 1,
    loop: 3.57,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#43a047", opacity: 0.35, anim: "settle", dur: 3.01, w: 97.52, h: 24.8 },
      { type: "emoji", emoji: "🦀", x: 60, y: 55, size: 36, anim: "settle", dur: 3.12 },
      { type: "emoji", emoji: "👒", x: 50, y: 15, size: 32, anim: "bounce", delay: 0.337, dur: 1.51 },
      { type: "emoji", emoji: "🎈", x: 11, y: 35, size: 14, anim: "blink", delay: 0.257, dur: 1.34 },
      { type: "emoji", emoji: "🍃", x: 64, y: 47, size: 22, anim: "pop", delay: 0.546, dur: 2.04 },
      { type: "emoji", emoji: "🌊", x: 13, y: 77, size: 13, anim: "pop", delay: 0.751, dur: 1.88 },
      { type: "emoji", emoji: "🌟", x: 65, y: 57, size: 17, anim: "blink", delay: 1.518, dur: 1.79 },
      { type: "emoji", emoji: "✨", x: 18, y: 84, size: 16, anim: "blink", delay: 0.98, dur: 1.68 }
    ],
  },
  crab_coding_27_654: {
    v: 1,
    loop: 1.9,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#512da8", opacity: 0.6, anim: "bounce", dur: 1.33, r: 45.31 },
      { type: "emoji", emoji: "🦀", x: 64, y: 53, size: 43, anim: "bounce", dur: 1.25 },
      { type: "emoji", emoji: "🧣", x: 51, y: 59, size: 24, anim: "bounce", delay: 0.49, dur: 1.51 },
      { type: "emoji", emoji: "💝", x: 68, y: 42, size: 27, anim: "rise", delay: 0.745, dur: 1.8 },
      { type: "emoji", emoji: "🎈", x: 10, y: 20, size: 23, anim: "wiggle", delay: 0.507, dur: 1.65 },
      { type: "emoji", emoji: "🎉", x: 40, y: 87, size: 24, anim: "wiggle", delay: 0.892, dur: 2.13 },
      { type: "emoji", emoji: "⭐", x: 22, y: 55, size: 18, anim: "blink", delay: 0.935, dur: 1.47 },
      { type: "emoji", emoji: "🌟", x: 65, y: 45, size: 16, anim: "blink", delay: 0.63, dur: 1.28 }
    ],
  },
  crab_music_27_655: {
    v: 1,
    loop: 3.1,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffab91", opacity: 0.38, anim: "twinkle", dur: 2.62, r: 46.56 },
      { type: "emoji", emoji: "🦀", x: 67, y: 48, size: 38, anim: "twinkle", dur: 2.58 },
      { type: "emoji", emoji: "🎩", x: 52, y: 13, size: 32, anim: "bounce", delay: 0.32, dur: 1.82 },
      { type: "emoji", emoji: "🍬", x: 72, y: 46, size: 22, anim: "rise", delay: 0.999, dur: 1.42 },
      { type: "emoji", emoji: "💖", x: 68, y: 68, size: 13, anim: "wiggle", delay: 1.18, dur: 1.95 },
      { type: "emoji", emoji: "❄️", x: 60, y: 39, size: 14, anim: "pop", delay: 1.356, dur: 1.77 },
      { type: "emoji", emoji: "🎉", x: 47, y: 53, size: 13, anim: "rise", delay: 0.537, dur: 1.95 },
      { type: "emoji", emoji: "💫", x: 58, y: 15, size: 19, anim: "blink", delay: 0.821, dur: 1.29 },
      { type: "emoji", emoji: "🌟", x: 31, y: 56, size: 12, anim: "blink", delay: 1.964, dur: 1.47 }
    ],
  },
  crab_sports_27_656: {
    v: 1,
    loop: 3.36,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 49, y: 54, size: 38, anim: "float", dur: 2.95 },
      { type: "emoji", emoji: "🧣", x: 49, y: 59, size: 25, anim: "bounce", delay: 0.442, dur: 1.75 },
      { type: "emoji", emoji: "🍩", x: 70, y: 43, size: 26, anim: "float", delay: 0.605, dur: 1.8 },
      { type: "emoji", emoji: "🔥", x: 22, y: 25, size: 12, anim: "float", delay: 1.443, dur: 2.13 },
      { type: "emoji", emoji: "💫", x: 19, y: 63, size: 21, anim: "float", delay: 0.871, dur: 1.92 },
      { type: "emoji", emoji: "✨", x: 60, y: 53, size: 20, anim: "pop", delay: 0.665, dur: 1.59 },
      { type: "emoji", emoji: "🍃", x: 64, y: 27, size: 20, anim: "wiggle", delay: 0.426, dur: 1.77 },
      { type: "emoji", emoji: "⭐", x: 61, y: 24, size: 16, anim: "blink", delay: 1.076, dur: 1.21 },
      { type: "emoji", emoji: "⭐", x: 75, y: 82, size: 13, anim: "blink", delay: 1.681, dur: 1.64 }
    ],
  },
  crab_food_27_657: {
    v: 1,
    loop: 2,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 37, y: 50, size: 33, anim: "pop", dur: 1.67 },
      { type: "emoji", emoji: "🍫", x: 68, y: 43, size: 27, anim: "rise", delay: 0.942, dur: 1.7 },
      { type: "emoji", emoji: "💖", x: 85, y: 28, size: 14, anim: "wiggle", delay: 0.593, dur: 2.16 },
      { type: "emoji", emoji: "🌊", x: 76, y: 41, size: 16, anim: "wiggle", delay: 1.165, dur: 1.72 },
      { type: "emoji", emoji: "⭐", x: 32, y: 31, size: 12, anim: "pop", delay: 1.274, dur: 2.12 },
      { type: "emoji", emoji: "🌟", x: 34, y: 63, size: 14, anim: "float", delay: 1.392, dur: 1.33 },
      { type: "emoji", emoji: "✨", x: 16, y: 81, size: 22, anim: "rise", delay: 0.458, dur: 2.09 },
      { type: "emoji", emoji: "⭐", x: 71, y: 71, size: 10, anim: "blink", delay: 0.751, dur: 1.54 },
      { type: "emoji", emoji: "✨", x: 38, y: 73, size: 16, anim: "blink", delay: 1.938, dur: 1.28 }
    ],
  },
  crab_space_27_658: {
    v: 1,
    loop: 2.96,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 66, y: 54, size: 39, anim: "heartbeat", dur: 2.43 },
      { type: "emoji", emoji: "👮", x: 48, y: 17, size: 28, anim: "bounce", delay: 0.59, dur: 1.7 },
      { type: "emoji", emoji: "🍀", x: 70, y: 44, size: 22, anim: "rise", delay: 0.979, dur: 1.79 },
      { type: "emoji", emoji: "🍂", x: 73, y: 48, size: 20, anim: "rise", delay: 1.333, dur: 1.77 },
      { type: "emoji", emoji: "✨", x: 33, y: 25, size: 25, anim: "pop", delay: 1.201, dur: 1.77 },
      { type: "emoji", emoji: "🌟", x: 61, y: 75, size: 13, anim: "blink", delay: 1.237, dur: 1.59 },
      { type: "emoji", emoji: "✨", x: 83, y: 83, size: 13, anim: "blink", delay: 0.581, dur: 1.88 }
    ],
  },
  crab_fantasy_27_659: {
    v: 1,
    loop: 4.02,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#9fa8da", opacity: 0.53, anim: "float", dur: 3.3, w: 91.06, h: 24.48 },
      { type: "emoji", emoji: "🦀", x: 52, y: 53, size: 39, anim: "float", dur: 3.52 },
      { type: "emoji", emoji: "🍳", x: 49, y: 15, size: 28, anim: "bounce", delay: 0.367, dur: 2 },
      { type: "emoji", emoji: "🌟", x: 72, y: 28, size: 27, anim: "rise", delay: 0.66, dur: 1.82 },
      { type: "emoji", emoji: "🎉", x: 69, y: 11, size: 14, anim: "rise", delay: 0.837, dur: 1.43 },
      { type: "emoji", emoji: "🍂", x: 86, y: 75, size: 19, anim: "wiggle", delay: 1.463, dur: 1.23 },
      { type: "emoji", emoji: "🎈", x: 41, y: 73, size: 17, anim: "float", delay: 0.185, dur: 1.96 },
      { type: "emoji", emoji: "💫", x: 18, y: 39, size: 19, anim: "blink", delay: 0.561, dur: 1.78 },
      { type: "emoji", emoji: "💖", x: 51, y: 64, size: 11, anim: "blink", delay: 1.461, dur: 1.8 }
    ],
  },
  crab_office_27_660: {
    v: 1,
    loop: 2.78,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fff0f6", opacity: 0.62, anim: "float", dur: 2.8, r: 45.57 },
      { type: "emoji", emoji: "🦀", x: 31, y: 46, size: 40, anim: "float", dur: 3.1 },
      { type: "emoji", emoji: "🪖", x: 51, y: 15, size: 29, anim: "bounce", delay: 0.428, dur: 1.64 },
      { type: "emoji", emoji: "🍬", x: 74, y: 43, size: 23, anim: "blink", delay: 0.99, dur: 1.41 },
      { type: "emoji", emoji: "🌊", x: 79, y: 15, size: 18, anim: "float", delay: 0.441, dur: 1.5 },
      { type: "emoji", emoji: "🌊", x: 80, y: 20, size: 16, anim: "wiggle", delay: 1.361, dur: 1.92 },
      { type: "emoji", emoji: "❤️", x: 47, y: 10, size: 23, anim: "pop", delay: 1.321, dur: 2.07 },
      { type: "emoji", emoji: "💖", x: 22, y: 33, size: 17, anim: "float", delay: 0.045, dur: 1.99 },
      { type: "emoji", emoji: "⭐", x: 76, y: 42, size: 11, anim: "blink", delay: 1.794, dur: 1.68 },
      { type: "emoji", emoji: "🌟", x: 17, y: 23, size: 16, anim: "blink", delay: 0.771, dur: 1.42 }
    ],
  },
  crab_fitness_27_661: {
    v: 1,
    loop: 2.27,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 68, y: 49, size: 42, anim: "wave", dur: 1.8 },
      { type: "emoji", emoji: "🤠", x: 51, y: 12, size: 33, anim: "bounce", delay: 0.543, dur: 1.74 },
      { type: "emoji", emoji: "🔥", x: 65, y: 56, size: 19, anim: "rise", delay: 0.869, dur: 1.63 },
      { type: "emoji", emoji: "❤️", x: 72, y: 44, size: 16, anim: "blink", delay: 0.179, dur: 1.81 },
      { type: "emoji", emoji: "💖", x: 44, y: 24, size: 18, anim: "blink", delay: 0.764, dur: 1.36 },
      { type: "emoji", emoji: "⭐", x: 21, y: 72, size: 12, anim: "blink", delay: 1.177, dur: 1.35 }
    ],
  },
  crab_travel_27_662: {
    v: 1,
    loop: 2.02,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#f57c00", opacity: 0.58, anim: "bounce", dur: 1.7, w: 104.74, h: 22.85 },
      { type: "emoji", emoji: "🦀", x: 39, y: 45, size: 42, anim: "bounce", dur: 1.64 },
      { type: "emoji", emoji: "🍭", x: 68, y: 43, size: 27, anim: "pop", delay: 0.957, dur: 1.92 },
      { type: "emoji", emoji: "🔥", x: 34, y: 86, size: 24, anim: "wiggle", delay: 0.598, dur: 2.27 },
      { type: "emoji", emoji: "💫", x: 31, y: 38, size: 19, anim: "rise", delay: 0.661, dur: 1.4 },
      { type: "emoji", emoji: "✨", x: 22, y: 33, size: 15, anim: "pop", delay: 0.929, dur: 1.47 },
      { type: "emoji", emoji: "💫", x: 21, y: 79, size: 22, anim: "blink", delay: 0.503, dur: 1.52 },
      { type: "emoji", emoji: "💫", x: 26, y: 78, size: 16, anim: "blink", delay: 1.734, dur: 1.25 },
      { type: "emoji", emoji: "⭐", x: 36, y: 22, size: 19, anim: "blink", delay: 1.718, dur: 1.3 }
    ],
  },
  crab_art_27_663: {
    v: 1,
    loop: 2.18,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 34, y: 51, size: 40, anim: "wiggle", dur: 1.48 },
      { type: "emoji", emoji: "🪖", x: 51, y: 18, size: 30, anim: "bounce", delay: 0.454, dur: 1.63 },
      { type: "emoji", emoji: "🍫", x: 69, y: 42, size: 27, anim: "blink", delay: 0.775, dur: 1.71 },
      { type: "emoji", emoji: "❤️", x: 11, y: 71, size: 22, anim: "pop", delay: 0.181, dur: 1.3 },
      { type: "emoji", emoji: "🎊", x: 87, y: 36, size: 23, anim: "rise", delay: 0.703, dur: 1.84 },
      { type: "emoji", emoji: "💫", x: 26, y: 74, size: 17, anim: "blink", delay: 1.065, dur: 1.52 },
      { type: "emoji", emoji: "💫", x: 58, y: 80, size: 19, anim: "blink", delay: 1.299, dur: 1.52 }
    ],
  },
  crab_science_27_664: {
    v: 1,
    loop: 3.89,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ede7f6", opacity: 0.57, anim: "breathe", dur: 3.56, r: 42.57 },
      { type: "emoji", emoji: "🦀", x: 55, y: 50, size: 41, anim: "breathe", dur: 3.59 },
      { type: "emoji", emoji: "🎓", x: 50, y: 17, size: 27, anim: "bounce", delay: 0.407, dur: 1.69 },
      { type: "emoji", emoji: "🌟", x: 73, y: 26, size: 24, anim: "float", delay: 0.652, dur: 1.4 },
      { type: "emoji", emoji: "💖", x: 17, y: 87, size: 15, anim: "pop", delay: 0.246, dur: 1.93 },
      { type: "emoji", emoji: "⭐", x: 66, y: 18, size: 19, anim: "wiggle", delay: 0.081, dur: 1.3 },
      { type: "emoji", emoji: "🌊", x: 12, y: 10, size: 14, anim: "pop", delay: 0.255, dur: 1.56 },
      { type: "emoji", emoji: "❤️", x: 50, y: 15, size: 16, anim: "blink", delay: 1.038, dur: 1.75 },
      { type: "emoji", emoji: "⭐", x: 41, y: 19, size: 14, anim: "pop", delay: 0.56, dur: 1.55 },
      { type: "emoji", emoji: "✨", x: 73, y: 62, size: 12, anim: "blink", delay: 1.334, dur: 1.39 },
      { type: "emoji", emoji: "⭐", x: 29, y: 20, size: 12, anim: "blink", delay: 0.883, dur: 1.79 }
    ],
  },
  crab_pets_27_665: {
    v: 1,
    loop: 2.75,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fbe9e7", opacity: 0.51, anim: "pulse", dur: 1.89, w: 98.9, h: 18.77 },
      { type: "emoji", emoji: "🦀", x: 57, y: 52, size: 36, anim: "pulse", dur: 1.92 },
      { type: "emoji", emoji: "🌹", x: 67, y: 40, size: 27, anim: "pop", delay: 0.824, dur: 1.73 },
      { type: "emoji", emoji: "🌸", x: 21, y: 52, size: 25, anim: "float", delay: 0.548, dur: 1.44 },
      { type: "emoji", emoji: "🌟", x: 36, y: 75, size: 16, anim: "pop", delay: 0.827, dur: 1.83 },
      { type: "emoji", emoji: "⭐", x: 40, y: 44, size: 16, anim: "blink", delay: 0.956, dur: 1.66 },
      { type: "emoji", emoji: "🌟", x: 71, y: 71, size: 16, anim: "blink", delay: 0.629, dur: 1.76 }
    ],
  },
  crab_magic_27_666: {
    v: 1,
    loop: 2.69,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 67, y: 47, size: 40, anim: "pulse", dur: 2.24 },
      { type: "emoji", emoji: "🍀", x: 71, y: 46, size: 24, anim: "float", delay: 0.756, dur: 1.62 },
      { type: "emoji", emoji: "🎊", x: 10, y: 44, size: 20, anim: "wiggle", delay: 0.253, dur: 1.65 },
      { type: "emoji", emoji: "❄️", x: 19, y: 73, size: 17, anim: "rise", delay: 1.346, dur: 1.24 },
      { type: "emoji", emoji: "🌸", x: 87, y: 31, size: 20, anim: "float", delay: 1.349, dur: 1.98 },
      { type: "emoji", emoji: "🌸", x: 55, y: 47, size: 16, anim: "float", delay: 0.046, dur: 2.05 },
      { type: "emoji", emoji: "🌟", x: 55, y: 49, size: 25, anim: "rise", delay: 0.587, dur: 2.26 },
      { type: "emoji", emoji: "💫", x: 20, y: 58, size: 15, anim: "blink", delay: 1.919, dur: 1.06 },
      { type: "emoji", emoji: "⭐", x: 79, y: 67, size: 17, anim: "blink", delay: 1.97, dur: 1.64 }
    ],
  },
  crab_retro_27_667: {
    v: 1,
    loop: 3.04,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#9c27b0", opacity: 0.44, anim: "float", dur: 2.6, w: 96.61, h: 25.77 },
      { type: "emoji", emoji: "🦀", x: 60, y: 56, size: 40, anim: "float", dur: 2.71 },
      { type: "emoji", emoji: "🎩", x: 49, y: 13, size: 32, anim: "bounce", delay: 0.366, dur: 1.55 },
      { type: "emoji", emoji: "🍄", x: 68, y: 45, size: 24, anim: "float", delay: 0.558, dur: 1.51 },
      { type: "emoji", emoji: "🍂", x: 47, y: 61, size: 16, anim: "float", delay: 1.344, dur: 1.24 },
      { type: "emoji", emoji: "🔥", x: 37, y: 23, size: 23, anim: "rise", delay: 1.092, dur: 1.43 },
      { type: "emoji", emoji: "🎊", x: 57, y: 17, size: 22, anim: "rise", delay: 0.336, dur: 1.32 },
      { type: "emoji", emoji: "❤️", x: 36, y: 44, size: 23, anim: "pop", delay: 0.982, dur: 1.88 },
      { type: "emoji", emoji: "🌟", x: 52, y: 58, size: 19, anim: "blink", delay: 0.618, dur: 1.09 },
      { type: "emoji", emoji: "✨", x: 58, y: 32, size: 14, anim: "blink", delay: 1.359, dur: 1.04 }
    ],
  },
  crab_cyber_27_668: {
    v: 1,
    loop: 3.56,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 69, y: 45, size: 44, anim: "settle", dur: 2.91 },
      { type: "emoji", emoji: "🤠", x: 49, y: 15, size: 33, anim: "bounce", delay: 0.627, dur: 1.7 },
      { type: "emoji", emoji: "🍰", x: 67, y: 37, size: 27, anim: "pop", delay: 0.885, dur: 1.96 },
      { type: "emoji", emoji: "⭐", x: 67, y: 72, size: 25, anim: "wiggle", delay: 0.308, dur: 1.95 },
      { type: "emoji", emoji: "🌟", x: 84, y: 10, size: 15, anim: "pop", delay: 0.394, dur: 2.29 },
      { type: "emoji", emoji: "⭐", x: 71, y: 44, size: 18, anim: "blink", delay: 0.974, dur: 1 },
      { type: "emoji", emoji: "🌟", x: 22, y: 68, size: 14, anim: "blink", delay: 1.298, dur: 1.4 }
    ],
  },
  crab_nature_27_669: {
    v: 1,
    loop: 1.91,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e8eaf6", opacity: 0.59, anim: "bounce", dur: 1.06, r: 45.19 },
      { type: "emoji", emoji: "🦀", x: 44, y: 51, size: 34, anim: "bounce", dur: 1.43 },
      { type: "emoji", emoji: "👑", x: 49, y: 15, size: 30, anim: "bounce", delay: 0.443, dur: 1.67 },
      { type: "emoji", emoji: "🌟", x: 26, y: 77, size: 24, anim: "rise", delay: 1.142, dur: 1.63 },
      { type: "emoji", emoji: "🌸", x: 68, y: 37, size: 23, anim: "blink", delay: 0.16, dur: 2.12 },
      { type: "emoji", emoji: "🍃", x: 22, y: 67, size: 14, anim: "float", delay: 0.877, dur: 2.22 },
      { type: "emoji", emoji: "✨", x: 18, y: 16, size: 22, anim: "rise", delay: 0.144, dur: 2.29 },
      { type: "emoji", emoji: "🌟", x: 62, y: 41, size: 16, anim: "blink", delay: 0.979, dur: 1.44 },
      { type: "emoji", emoji: "🌟", x: 44, y: 50, size: 16, anim: "blink", delay: 1.627, dur: 1.52 }
    ],
  },
  crab_underwater_27_670: {
    v: 1,
    loop: 3.12,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff9c4", opacity: 0.37, anim: "twinkle", dur: 2.31, w: 104.36, h: 23.7 },
      { type: "emoji", emoji: "🦀", x: 38, y: 55, size: 33, anim: "twinkle", dur: 2.39 },
      { type: "emoji", emoji: "🎩", x: 50, y: 12, size: 33, anim: "bounce", delay: 0.458, dur: 1.54 },
      { type: "emoji", emoji: "🍪", x: 72, y: 44, size: 24, anim: "pop", delay: 0.905, dur: 1.89 },
      { type: "emoji", emoji: "🔥", x: 49, y: 17, size: 21, anim: "blink", delay: 1.166, dur: 1.61 },
      { type: "emoji", emoji: "🌟", x: 48, y: 80, size: 22, anim: "blink", delay: 0.381, dur: 1.81 },
      { type: "emoji", emoji: "🎈", x: 22, y: 44, size: 20, anim: "rise", delay: 0.117, dur: 1.52 },
      { type: "emoji", emoji: "🍃", x: 87, y: 79, size: 22, anim: "rise", delay: 0.379, dur: 1.66 },
      { type: "emoji", emoji: "⭐", x: 49, y: 76, size: 11, anim: "blink", delay: 1.191, dur: 1.72 },
      { type: "emoji", emoji: "⭐", x: 20, y: 81, size: 19, anim: "blink", delay: 1.411, dur: 1.84 }
    ],
  },
  crab_sky_27_671: {
    v: 1,
    loop: 3.14,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#81d4fa", opacity: 0.48, anim: "float", dur: 2.77, w: 104.03, h: 18.85 },
      { type: "emoji", emoji: "🦀", x: 53, y: 45, size: 39, anim: "float", dur: 3.05 },
      { type: "emoji", emoji: "🎩", x: 48, y: 10, size: 30, anim: "bounce", delay: 0.575, dur: 1.83 },
      { type: "emoji", emoji: "🍫", x: 70, y: 47, size: 27, anim: "blink", delay: 0.961, dur: 1.54 },
      { type: "emoji", emoji: "🎉", x: 47, y: 30, size: 17, anim: "float", delay: 0.047, dur: 2.06 },
      { type: "emoji", emoji: "🎊", x: 35, y: 47, size: 18, anim: "blink", delay: 1.397, dur: 1.48 },
      { type: "emoji", emoji: "❄️", x: 26, y: 73, size: 17, anim: "rise", delay: 0.211, dur: 1.95 },
      { type: "emoji", emoji: "⭐", x: 51, y: 18, size: 13, anim: "blink", delay: 0.948, dur: 1.86 },
      { type: "emoji", emoji: "💫", x: 73, y: 57, size: 13, anim: "blink", delay: 0.676, dur: 1.67 }
    ],
  },
  crab_party_28_672: {
    v: 1,
    loop: 2.22,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffe0b2", opacity: 0.31, anim: "pop", dur: 1.38, r: 41.7 },
      { type: "emoji", emoji: "🦀", x: 35, y: 53, size: 35, anim: "pop", dur: 1.71 },
      { type: "emoji", emoji: "🍬", x: 71, y: 47, size: 20, anim: "rise", delay: 0.998, dur: 1.61 },
      { type: "emoji", emoji: "🌊", x: 52, y: 78, size: 22, anim: "blink", delay: 1.283, dur: 1.6 },
      { type: "emoji", emoji: "💫", x: 13, y: 70, size: 20, anim: "pop", delay: 1.2, dur: 1.94 },
      { type: "emoji", emoji: "🌊", x: 87, y: 50, size: 12, anim: "pop", delay: 1.045, dur: 1.25 },
      { type: "emoji", emoji: "✨", x: 34, y: 46, size: 16, anim: "blink", delay: 1.481, dur: 1.55 },
      { type: "emoji", emoji: "🌟", x: 62, y: 75, size: 16, anim: "blink", delay: 1.802, dur: 1.1 },
      { type: "emoji", emoji: "✨", x: 58, y: 24, size: 11, anim: "blink", delay: 0.52, dur: 1.16 }
    ],
  },
  crab_beach_28_673: {
    v: 1,
    loop: 2.94,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#43a047", opacity: 0.61, anim: "heartbeat", dur: 2.59, w: 93.79, h: 18.96 },
      { type: "emoji", emoji: "🦀", x: 47, y: 45, size: 40, anim: "heartbeat", dur: 2.44 },
      { type: "emoji", emoji: "👷", x: 51, y: 16, size: 31, anim: "bounce", delay: 0.402, dur: 1.84 },
      { type: "emoji", emoji: "🌹", x: 68, y: 42, size: 26, anim: "blink", delay: 0.594, dur: 1.58 },
      { type: "emoji", emoji: "❄️", x: 60, y: 36, size: 23, anim: "float", delay: 1.083, dur: 1.79 },
      { type: "emoji", emoji: "🌊", x: 80, y: 47, size: 18, anim: "wiggle", delay: 0.609, dur: 1.83 },
      { type: "emoji", emoji: "💖", x: 51, y: 39, size: 18, anim: "blink", delay: 1.161, dur: 1.15 },
      { type: "emoji", emoji: "💫", x: 30, y: 16, size: 11, anim: "blink", delay: 1.002, dur: 1.22 }
    ],
  },
  crab_winter_28_674: {
    v: 1,
    loop: 4.25,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 62, y: 46, size: 34, anim: "float", dur: 3.57 },
      { type: "emoji", emoji: "🎓", x: 49, y: 14, size: 28, anim: "bounce", delay: 0.555, dur: 1.7 },
      { type: "emoji", emoji: "🎀", x: 71, y: 30, size: 19, anim: "blink", delay: 0.806, dur: 1.44 },
      { type: "emoji", emoji: "🔥", x: 34, y: 19, size: 16, anim: "rise", delay: 0.105, dur: 1.6 },
      { type: "emoji", emoji: "🌿", x: 55, y: 76, size: 21, anim: "wiggle", delay: 1.294, dur: 1.28 },
      { type: "emoji", emoji: "🍂", x: 74, y: 82, size: 23, anim: "float", delay: 0.537, dur: 2.12 },
      { type: "emoji", emoji: "💫", x: 42, y: 88, size: 16, anim: "rise", delay: 0.333, dur: 1.25 },
      { type: "emoji", emoji: "💫", x: 31, y: 20, size: 19, anim: "blink", delay: 1.906, dur: 1.14 },
      { type: "emoji", emoji: "💫", x: 26, y: 54, size: 13, anim: "blink", delay: 1.69, dur: 1.53 }
    ],
  },
  crab_spring_28_675: {
    v: 1,
    loop: 2.87,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffccbc", opacity: 0.6, anim: "float", dur: 2.98, r: 40.7 },
      { type: "emoji", emoji: "🦀", x: 46, y: 51, size: 34, anim: "float", dur: 3.09 },
      { type: "emoji", emoji: "🤠", x: 49, y: 16, size: 33, anim: "bounce", delay: 0.519, dur: 1.81 },
      { type: "emoji", emoji: "💎", x: 68, y: 39, size: 23, anim: "rise", delay: 0.605, dur: 1.65 },
      { type: "emoji", emoji: "🍂", x: 26, y: 56, size: 21, anim: "blink", delay: 0.14, dur: 2.01 },
      { type: "emoji", emoji: "🔥", x: 57, y: 49, size: 18, anim: "float", delay: 0.624, dur: 1.55 },
      { type: "emoji", emoji: "🌟", x: 58, y: 72, size: 10, anim: "blink", delay: 0.615, dur: 1.01 },
      { type: "emoji", emoji: "💫", x: 22, y: 59, size: 17, anim: "blink", delay: 1.804, dur: 1.5 }
    ],
  },
  crab_halloween_28_676: {
    v: 1,
    loop: 2.47,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 65, y: 55, size: 39, anim: "wave", dur: 1.68 },
      { type: "emoji", emoji: "🪖", x: 52, y: 17, size: 29, anim: "bounce", delay: 0.405, dur: 1.94 },
      { type: "emoji", emoji: "🎉", x: 46, y: 25, size: 23, anim: "float", delay: 0.213, dur: 1.71 },
      { type: "emoji", emoji: "❤️", x: 35, y: 17, size: 18, anim: "pop", delay: 0.595, dur: 1.78 },
      { type: "emoji", emoji: "🌟", x: 50, y: 82, size: 10, anim: "blink", delay: 1.449, dur: 1.37 },
      { type: "emoji", emoji: "💫", x: 32, y: 79, size: 14, anim: "blink", delay: 0.579, dur: 1.91 }
    ],
  },
  crab_christmas_28_677: {
    v: 1,
    loop: 2.21,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#f3e5f5", opacity: 0.43, anim: "bounce", dur: 1.64, w: 103.52, h: 21.75 },
      { type: "emoji", emoji: "🦀", x: 51, y: 45, size: 43, anim: "bounce", dur: 1.4 },
      { type: "emoji", emoji: "🧢", x: 50, y: 18, size: 30, anim: "bounce", delay: 0.469, dur: 1.52 },
      { type: "emoji", emoji: "🍩", x: 69, y: 44, size: 25, anim: "pop", delay: 0.574, dur: 1.56 },
      { type: "emoji", emoji: "🌿", x: 83, y: 74, size: 23, anim: "rise", delay: 1.293, dur: 1.45 },
      { type: "emoji", emoji: "⭐", x: 48, y: 25, size: 18, anim: "float", delay: 1.447, dur: 1.22 },
      { type: "emoji", emoji: "💫", x: 52, y: 68, size: 18, anim: "blink", delay: 0.657, dur: 1.47 },
      { type: "emoji", emoji: "💖", x: 36, y: 84, size: 15, anim: "wiggle", delay: 0.785, dur: 1.57 },
      { type: "emoji", emoji: "💫", x: 47, y: 59, size: 15, anim: "blink", delay: 0.808, dur: 1.69 },
      { type: "emoji", emoji: "✨", x: 15, y: 72, size: 14, anim: "blink", delay: 1.815, dur: 1.04 }
    ],
  },
  crab_coding_28_678: {
    v: 1,
    loop: 2.04,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffeb3b", opacity: 0.61, anim: "wiggle", dur: 1.24, r: 46.59 },
      { type: "emoji", emoji: "🦀", x: 39, y: 47, size: 34, anim: "wiggle", dur: 1.34 },
      { type: "emoji", emoji: "🪖", x: 48, y: 15, size: 30, anim: "bounce", delay: 0.645, dur: 1.55 },
      { type: "emoji", emoji: "🍦", x: 73, y: 43, size: 28, anim: "blink", delay: 0.428, dur: 1.84 },
      { type: "emoji", emoji: "❄️", x: 49, y: 47, size: 20, anim: "wiggle", delay: 1.186, dur: 1.75 },
      { type: "emoji", emoji: "🎉", x: 53, y: 21, size: 22, anim: "float", delay: 0.706, dur: 1.83 },
      { type: "emoji", emoji: "💫", x: 77, y: 49, size: 16, anim: "blink", delay: 1.758, dur: 1.2 },
      { type: "emoji", emoji: "⭐", x: 20, y: 76, size: 11, anim: "blink", delay: 0.602, dur: 1.26 }
    ],
  },
  crab_music_28_679: {
    v: 1,
    loop: 3.91,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#3f51b5", opacity: 0.37, anim: "breathe", dur: 3.37, r: 45.99 },
      { type: "emoji", emoji: "🦀", x: 51, y: 47, size: 33, anim: "breathe", dur: 3.55 },
      { type: "emoji", emoji: "🎓", x: 49, y: 17, size: 28, anim: "bounce", delay: 0.499, dur: 1.57 },
      { type: "emoji", emoji: "🔥", x: 30, y: 39, size: 23, anim: "float", delay: 0.754, dur: 1.25 },
      { type: "emoji", emoji: "💖", x: 70, y: 36, size: 22, anim: "blink", delay: 0.355, dur: 2.33 },
      { type: "emoji", emoji: "🌊", x: 78, y: 18, size: 21, anim: "blink", delay: 0.485, dur: 1.44 },
      { type: "emoji", emoji: "💫", x: 69, y: 52, size: 16, anim: "blink", delay: 1.587, dur: 1.45 },
      { type: "emoji", emoji: "🌟", x: 28, y: 62, size: 16, anim: "blink", delay: 1.46, dur: 1.49 }
    ],
  },
  crab_sports_28_680: {
    v: 1,
    loop: 2.85,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff3e0", opacity: 0.37, anim: "pulse", dur: 1.77, w: 108.21, h: 18.09 },
      { type: "emoji", emoji: "🦀", x: 66, y: 47, size: 44, anim: "pulse", dur: 2.07 },
      { type: "emoji", emoji: "👮", x: 52, y: 17, size: 31, anim: "bounce", delay: 0.508, dur: 1.91 },
      { type: "emoji", emoji: "🍄", x: 71, y: 47, size: 24, anim: "rise", delay: 0.696, dur: 1.85 },
      { type: "emoji", emoji: "🔥", x: 70, y: 27, size: 18, anim: "pop", delay: 1.235, dur: 2.12 },
      { type: "emoji", emoji: "❄️", x: 12, y: 73, size: 12, anim: "wiggle", delay: 0.661, dur: 1.77 },
      { type: "emoji", emoji: "🌊", x: 74, y: 32, size: 23, anim: "rise", delay: 0.448, dur: 2.07 },
      { type: "emoji", emoji: "🎊", x: 30, y: 10, size: 22, anim: "rise", delay: 0.419, dur: 1.82 },
      { type: "emoji", emoji: "💫", x: 50, y: 66, size: 15, anim: "blink", delay: 0.529, dur: 1.54 },
      { type: "emoji", emoji: "⭐", x: 55, y: 39, size: 13, anim: "blink", delay: 0.814, dur: 1.53 }
    ],
  },
  crab_food_28_681: {
    v: 1,
    loop: 2.51,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 66, y: 47, size: 35, anim: "pulse", dur: 2.25 },
      { type: "emoji", emoji: "👮", x: 49, y: 16, size: 30, anim: "bounce", delay: 0.384, dur: 1.69 },
      { type: "emoji", emoji: "🎊", x: 70, y: 42, size: 18, anim: "blink", delay: 0.373, dur: 1.78 },
      { type: "emoji", emoji: "🎊", x: 54, y: 49, size: 22, anim: "blink", delay: 1.088, dur: 2.15 },
      { type: "emoji", emoji: "✨", x: 83, y: 15, size: 16, anim: "blink", delay: 1.556, dur: 1.19 },
      { type: "emoji", emoji: "⭐", x: 33, y: 80, size: 14, anim: "blink", delay: 1.892, dur: 1.89 }
    ],
  },
  crab_space_28_682: {
    v: 1,
    loop: 2.91,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff3e0", opacity: 0.38, anim: "float", dur: 2.84, w: 94.7, h: 26.54 },
      { type: "emoji", emoji: "🦀", x: 66, y: 54, size: 40, anim: "float", dur: 2.72 },
      { type: "emoji", emoji: "👑", x: 51, y: 12, size: 31, anim: "bounce", delay: 0.426, dur: 1.68 },
      { type: "emoji", emoji: "🌿", x: 74, y: 44, size: 24, anim: "float", delay: 0.58, dur: 1.94 },
      { type: "emoji", emoji: "✨", x: 30, y: 57, size: 15, anim: "float", delay: 1.025, dur: 1.46 },
      { type: "emoji", emoji: "✨", x: 54, y: 71, size: 18, anim: "wiggle", delay: 0.658, dur: 1.77 },
      { type: "emoji", emoji: "✨", x: 10, y: 36, size: 16, anim: "rise", delay: 1.088, dur: 2.3 },
      { type: "emoji", emoji: "🌟", x: 26, y: 77, size: 19, anim: "blink", delay: 0.515, dur: 1.46 },
      { type: "emoji", emoji: "🌟", x: 28, y: 64, size: 12, anim: "blink", delay: 1.298, dur: 1.3 }
    ],
  },
  crab_fantasy_28_683: {
    v: 1,
    loop: 3.4,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#a5d6a7", opacity: 0.64, anim: "settle", dur: 2.84, w: 109.5, h: 25.75 },
      { type: "emoji", emoji: "🦀", x: 57, y: 52, size: 41, anim: "settle", dur: 3.06 },
      { type: "emoji", emoji: "🕶️", x: 51, y: 27, size: 31, anim: "bounce", delay: 0.472, dur: 1.89 },
      { type: "emoji", emoji: "🍫", x: 68, y: 43, size: 27, anim: "blink", delay: 0.598, dur: 1.81 },
      { type: "emoji", emoji: "🌸", x: 54, y: 40, size: 25, anim: "blink", delay: 0.762, dur: 2.14 },
      { type: "emoji", emoji: "✨", x: 50, y: 58, size: 16, anim: "blink", delay: 0.482, dur: 1.94 },
      { type: "emoji", emoji: "🎈", x: 66, y: 33, size: 21, anim: "pop", delay: 0.323, dur: 1.45 },
      { type: "emoji", emoji: "✨", x: 60, y: 51, size: 11, anim: "blink", delay: 0.531, dur: 1.53 },
      { type: "emoji", emoji: "💖", x: 23, y: 44, size: 11, anim: "blink", delay: 0.928, dur: 1.7 }
    ],
  },
  crab_office_28_684: {
    v: 1,
    loop: 1.77,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ede7f6", opacity: 0.6, anim: "bounce", dur: 1.47, w: 101.06, h: 24.7 },
      { type: "emoji", emoji: "🦀", x: 41, y: 44, size: 43, anim: "bounce", dur: 1.22 },
      { type: "emoji", emoji: "🍳", x: 50, y: 17, size: 26, anim: "bounce", delay: 0.494, dur: 1.83 },
      { type: "emoji", emoji: "💫", x: 22, y: 65, size: 13, anim: "rise", delay: 0.14, dur: 2.04 },
      { type: "emoji", emoji: "❄️", x: 32, y: 69, size: 25, anim: "rise", delay: 0.526, dur: 2.07 },
      { type: "emoji", emoji: "💖", x: 47, y: 36, size: 18, anim: "blink", delay: 0.784, dur: 1.61 },
      { type: "emoji", emoji: "💫", x: 22, y: 58, size: 16, anim: "blink", delay: 0.525, dur: 1.7 }
    ],
  },
  crab_fitness_28_685: {
    v: 1,
    loop: 3.2,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 63, y: 44, size: 34, anim: "twinkle", dur: 2.48 },
      { type: "emoji", emoji: "🍫", x: 67, y: 46, size: 25, anim: "pop", delay: 0.484, dur: 1.66 },
      { type: "emoji", emoji: "❤️", x: 57, y: 75, size: 16, anim: "pop", delay: 0.053, dur: 2.17 },
      { type: "emoji", emoji: "💖", x: 69, y: 47, size: 17, anim: "pop", delay: 0.832, dur: 1.53 },
      { type: "emoji", emoji: "🎊", x: 78, y: 72, size: 14, anim: "rise", delay: 1.278, dur: 1.95 },
      { type: "emoji", emoji: "💖", x: 74, y: 23, size: 17, anim: "blink", delay: 1.232, dur: 1.77 },
      { type: "emoji", emoji: "✨", x: 53, y: 59, size: 14, anim: "blink", delay: 0.546, dur: 1.99 }
    ],
  },
  crab_travel_28_686: {
    v: 1,
    loop: 3.22,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e91e63", opacity: 0.63, anim: "float", dur: 2.78, r: 42.26 },
      { type: "emoji", emoji: "🦀", x: 33, y: 47, size: 35, anim: "float", dur: 2.95 },
      { type: "emoji", emoji: "🍬", x: 72, y: 45, size: 23, anim: "pop", delay: 0.46, dur: 1.51 },
      { type: "emoji", emoji: "🌟", x: 50, y: 75, size: 15, anim: "float", delay: 0.495, dur: 1.26 },
      { type: "emoji", emoji: "❤️", x: 54, y: 62, size: 13, anim: "wiggle", delay: 1.112, dur: 2.2 },
      { type: "emoji", emoji: "🔥", x: 19, y: 44, size: 21, anim: "wiggle", delay: 0.215, dur: 1.62 },
      { type: "emoji", emoji: "🌸", x: 71, y: 56, size: 22, anim: "float", delay: 0.164, dur: 1.53 },
      { type: "emoji", emoji: "💖", x: 62, y: 84, size: 11, anim: "blink", delay: 1.815, dur: 1.57 },
      { type: "emoji", emoji: "💫", x: 46, y: 45, size: 19, anim: "blink", delay: 1.362, dur: 1.77 }
    ],
  },
  crab_art_28_687: {
    v: 1,
    loop: 2.1,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ce93d8", opacity: 0.56, anim: "pop", dur: 1.41, w: 101.87, h: 21.26 },
      { type: "emoji", emoji: "🦀", x: 40, y: 55, size: 38, anim: "pop", dur: 1.5 },
      { type: "emoji", emoji: "🍬", x: 75, y: 44, size: 22, anim: "float", delay: 0.618, dur: 1.68 },
      { type: "emoji", emoji: "🍂", x: 45, y: 80, size: 12, anim: "wiggle", delay: 0.096, dur: 1.59 },
      { type: "emoji", emoji: "🌿", x: 83, y: 78, size: 24, anim: "rise", delay: 0.947, dur: 1.63 },
      { type: "emoji", emoji: "❄️", x: 14, y: 30, size: 17, anim: "wiggle", delay: 0.496, dur: 1.62 },
      { type: "emoji", emoji: "❤️", x: 82, y: 81, size: 24, anim: "blink", delay: 0.042, dur: 1.52 },
      { type: "emoji", emoji: "🌟", x: 52, y: 83, size: 10, anim: "blink", delay: 0.967, dur: 1.69 },
      { type: "emoji", emoji: "💫", x: 27, y: 24, size: 18, anim: "blink", delay: 1.343, dur: 1.72 }
    ],
  },
  crab_science_28_688: {
    v: 1,
    loop: 2.89,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffeb3b", opacity: 0.58, anim: "heartbeat", dur: 2.25, w: 98.95, h: 24.05 },
      { type: "emoji", emoji: "🦀", x: 60, y: 46, size: 36, anim: "heartbeat", dur: 2.37 },
      { type: "emoji", emoji: "❄️", x: 44, y: 15, size: 21, anim: "float", delay: 0.619, dur: 2.34 },
      { type: "emoji", emoji: "❤️", x: 35, y: 60, size: 22, anim: "pop", delay: 0.032, dur: 1.31 },
      { type: "emoji", emoji: "💫", x: 18, y: 89, size: 25, anim: "blink", delay: 1.28, dur: 2.28 },
      { type: "emoji", emoji: "🍂", x: 35, y: 10, size: 25, anim: "wiggle", delay: 1.281, dur: 1.34 },
      { type: "emoji", emoji: "🌟", x: 70, y: 58, size: 14, anim: "blink", delay: 1.622, dur: 1.88 },
      { type: "emoji", emoji: "⭐", x: 81, y: 22, size: 11, anim: "blink", delay: 0.518, dur: 1.8 }
    ],
  },
  crab_pets_28_689: {
    v: 1,
    loop: 3.81,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 50, y: 46, size: 40, anim: "float", dur: 3.59 },
      { type: "emoji", emoji: "🎀", x: 70, y: 27, size: 19, anim: "blink", delay: 0.505, dur: 1.89 },
      { type: "emoji", emoji: "🌸", x: 53, y: 41, size: 24, anim: "pop", delay: 1.481, dur: 1.86 },
      { type: "emoji", emoji: "🌊", x: 79, y: 87, size: 18, anim: "rise", delay: 0.651, dur: 1.89 },
      { type: "emoji", emoji: "✨", x: 44, y: 40, size: 13, anim: "pop", delay: 0.867, dur: 1.9 },
      { type: "emoji", emoji: "🌟", x: 45, y: 64, size: 12, anim: "blink", delay: 0.8, dur: 1.62 },
      { type: "emoji", emoji: "🌟", x: 17, y: 84, size: 13, anim: "blink", delay: 0.725, dur: 1.23 }
    ],
  },
  crab_magic_28_690: {
    v: 1,
    loop: 3.11,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff3e0", opacity: 0.64, anim: "float", dur: 3.16, w: 91.92, h: 25.18 },
      { type: "emoji", emoji: "🦀", x: 58, y: 45, size: 36, anim: "float", dur: 2.89 },
      { type: "emoji", emoji: "🍳", x: 51, y: 17, size: 27, anim: "bounce", delay: 0.555, dur: 1.89 },
      { type: "emoji", emoji: "🍪", x: 73, y: 43, size: 25, anim: "rise", delay: 0.921, dur: 1.74 },
      { type: "emoji", emoji: "🌟", x: 27, y: 46, size: 20, anim: "pop", delay: 0.146, dur: 1.28 },
      { type: "emoji", emoji: "❄️", x: 54, y: 60, size: 21, anim: "blink", delay: 0.942, dur: 1.51 },
      { type: "emoji", emoji: "💖", x: 45, y: 70, size: 18, anim: "blink", delay: 1.043, dur: 1.93 },
      { type: "emoji", emoji: "💖", x: 29, y: 43, size: 10, anim: "blink", delay: 1.313, dur: 1.49 }
    ],
  },
  crab_retro_28_691: {
    v: 1,
    loop: 2.29,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 39, y: 54, size: 42, anim: "wave", dur: 1.8 },
      { type: "emoji", emoji: "💖", x: 35, y: 69, size: 16, anim: "blink", delay: 0.893, dur: 1.56 },
      { type: "emoji", emoji: "🍂", x: 54, y: 13, size: 12, anim: "pop", delay: 0.36, dur: 1.67 },
      { type: "emoji", emoji: "🎈", x: 28, y: 51, size: 15, anim: "wiggle", delay: 0.219, dur: 2 },
      { type: "emoji", emoji: "✨", x: 78, y: 12, size: 21, anim: "pop", delay: 0.078, dur: 2.25 },
      { type: "emoji", emoji: "💫", x: 26, y: 16, size: 16, anim: "blink", delay: 0.763, dur: 1.54 },
      { type: "emoji", emoji: "💖", x: 23, y: 44, size: 14, anim: "blink", delay: 0.643, dur: 1.76 }
    ],
  },
  crab_cyber_28_692: {
    v: 1,
    loop: 1.87,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ffe0b2", opacity: 0.37, anim: "bounce", dur: 1.33, r: 46.92 },
      { type: "emoji", emoji: "🦀", x: 52, y: 53, size: 38, anim: "bounce", dur: 1.63 },
      { type: "emoji", emoji: "🍪", x: 73, y: 42, size: 24, anim: "blink", delay: 0.837, dur: 1.85 },
      { type: "emoji", emoji: "🍃", x: 54, y: 55, size: 21, anim: "wiggle", delay: 1.343, dur: 1.93 },
      { type: "emoji", emoji: "🌟", x: 35, y: 47, size: 16, anim: "blink", delay: 1.503, dur: 1.25 },
      { type: "emoji", emoji: "⭐", x: 60, y: 47, size: 14, anim: "blink", delay: 0.743, dur: 1.37 }
    ],
  },
  crab_nature_28_693: {
    v: 1,
    loop: 1.98,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 36, y: 52, size: 34, anim: "wiggle", dur: 1.4 },
      { type: "emoji", emoji: "🌿", x: 72, y: 57, size: 17, anim: "float", delay: 1.076, dur: 2.11 },
      { type: "emoji", emoji: "💫", x: 54, y: 72, size: 22, anim: "float", delay: 1.493, dur: 2.38 },
      { type: "emoji", emoji: "🎊", x: 69, y: 33, size: 23, anim: "rise", delay: 1.39, dur: 2.37 },
      { type: "emoji", emoji: "❄️", x: 46, y: 78, size: 14, anim: "rise", delay: 0.054, dur: 1.42 },
      { type: "emoji", emoji: "💫", x: 82, y: 80, size: 18, anim: "float", delay: 1.207, dur: 1.74 },
      { type: "emoji", emoji: "✨", x: 69, y: 44, size: 13, anim: "blink", delay: 1.1, dur: 1.68 },
      { type: "emoji", emoji: "⭐", x: 15, y: 80, size: 16, anim: "blink", delay: 1.794, dur: 1.03 }
    ],
  },
  crab_underwater_28_694: {
    v: 1,
    loop: 3.85,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 40, y: 48, size: 38, anim: "breathe", dur: 3.4 },
      { type: "emoji", emoji: "🍳", x: 51, y: 17, size: 29, anim: "bounce", delay: 0.462, dur: 1.7 },
      { type: "emoji", emoji: "🍩", x: 72, y: 40, size: 27, anim: "rise", delay: 0.485, dur: 1.88 },
      { type: "emoji", emoji: "⭐", x: 85, y: 30, size: 13, anim: "rise", delay: 1.179, dur: 2.32 },
      { type: "emoji", emoji: "🎈", x: 79, y: 17, size: 21, anim: "float", delay: 0.869, dur: 1.41 },
      { type: "emoji", emoji: "🌟", x: 58, y: 53, size: 19, anim: "blink", delay: 1.529, dur: 1.95 },
      { type: "emoji", emoji: "✨", x: 35, y: 24, size: 13, anim: "blink", delay: 1.75, dur: 1.39 }
    ],
  },
  crab_sky_28_695: {
    v: 1,
    loop: 2.79,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ffab91", opacity: 0.37, anim: "pulse", dur: 1.86, w: 107.04, h: 23.07 },
      { type: "emoji", emoji: "🦀", x: 41, y: 48, size: 32, anim: "pulse", dur: 2.05 },
      { type: "emoji", emoji: "👒", x: 50, y: 12, size: 34, anim: "bounce", delay: 0.59, dur: 1.64 },
      { type: "emoji", emoji: "🎈", x: 71, y: 28, size: 29, anim: "blink", delay: 0.707, dur: 1.64 },
      { type: "emoji", emoji: "🎈", x: 80, y: 53, size: 24, anim: "float", delay: 1.493, dur: 1.95 },
      { type: "emoji", emoji: "❤️", x: 69, y: 82, size: 21, anim: "blink", delay: 1.423, dur: 1.49 },
      { type: "emoji", emoji: "🌟", x: 16, y: 26, size: 23, anim: "rise", delay: 1.285, dur: 2.08 },
      { type: "emoji", emoji: "⭐", x: 79, y: 51, size: 16, anim: "blink", delay: 0.55, dur: 1.37 },
      { type: "emoji", emoji: "💫", x: 43, y: 78, size: 18, anim: "blink", delay: 1.081, dur: 1.15 }
    ],
  },
  crab_party_29_696: {
    v: 1,
    loop: 2.58,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ec407a", opacity: 0.57, anim: "pulse", dur: 2.13, r: 46.19 },
      { type: "emoji", emoji: "🦀", x: 61, y: 46, size: 36, anim: "pulse", dur: 2.29 },
      { type: "emoji", emoji: "👑", x: 49, y: 16, size: 30, anim: "bounce", delay: 0.461, dur: 1.86 },
      { type: "emoji", emoji: "🌹", x: 71, y: 42, size: 26, anim: "float", delay: 0.94, dur: 1.59 },
      { type: "emoji", emoji: "✨", x: 44, y: 71, size: 25, anim: "pop", delay: 1.299, dur: 1.26 },
      { type: "emoji", emoji: "🍃", x: 27, y: 27, size: 16, anim: "rise", delay: 0.685, dur: 1.83 },
      { type: "emoji", emoji: "❄️", x: 61, y: 38, size: 25, anim: "wiggle", delay: 0.894, dur: 1.62 },
      { type: "emoji", emoji: "⭐", x: 21, y: 79, size: 15, anim: "blink", delay: 0.904, dur: 1.32 },
      { type: "emoji", emoji: "💖", x: 53, y: 51, size: 15, anim: "blink", delay: 0.662, dur: 1.12 }
    ],
  },
  crab_beach_29_697: {
    v: 1,
    loop: 2.8,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 34, y: 55, size: 37, anim: "float", dur: 2.65 },
      { type: "emoji", emoji: "🕶️", x: 49, y: 26, size: 28, anim: "bounce", delay: 0.402, dur: 1.58 },
      { type: "emoji", emoji: "🔥", x: 46, y: 54, size: 22, anim: "rise", delay: 0.688, dur: 2.26 },
      { type: "emoji", emoji: "💖", x: 67, y: 48, size: 13, anim: "float", delay: 0.251, dur: 2.36 },
      { type: "emoji", emoji: "🔥", x: 23, y: 52, size: 14, anim: "pop", delay: 1.131, dur: 1.58 },
      { type: "emoji", emoji: "💫", x: 36, y: 20, size: 18, anim: "blink", delay: 1.145, dur: 1.27 },
      { type: "emoji", emoji: "💫", x: 18, y: 35, size: 16, anim: "blink", delay: 0.73, dur: 1.09 }
    ],
  },
  crab_winter_29_698: {
    v: 1,
    loop: 3.57,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fbc02d", opacity: 0.54, anim: "settle", dur: 2.84, r: 44.45 },
      { type: "emoji", emoji: "🦀", x: 63, y: 49, size: 33, anim: "settle", dur: 2.89 },
      { type: "emoji", emoji: "🍀", x: 70, y: 42, size: 25, anim: "rise", delay: 0.93, dur: 1.44 },
      { type: "emoji", emoji: "💖", x: 23, y: 50, size: 21, anim: "pop", delay: 0.244, dur: 2.12 },
      { type: "emoji", emoji: "✨", x: 31, y: 54, size: 19, anim: "blink", delay: 1.211, dur: 2.15 },
      { type: "emoji", emoji: "💫", x: 22, y: 34, size: 19, anim: "float", delay: 0.385, dur: 1.88 },
      { type: "emoji", emoji: "⭐", x: 56, y: 41, size: 18, anim: "rise", delay: 1.334, dur: 1.85 },
      { type: "emoji", emoji: "🌟", x: 81, y: 80, size: 19, anim: "blink", delay: 0.961, dur: 1.12 },
      { type: "emoji", emoji: "✨", x: 63, y: 52, size: 14, anim: "blink", delay: 1.849, dur: 1.03 }
    ],
  },
  crab_spring_29_699: {
    v: 1,
    loop: 2.1,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#7986cb", opacity: 0.57, anim: "bounce", dur: 1.42, r: 48.49 },
      { type: "emoji", emoji: "🦀", x: 65, y: 56, size: 42, anim: "bounce", dur: 1.32 },
      { type: "emoji", emoji: "🌟", x: 39, y: 81, size: 16, anim: "pop", delay: 0.604, dur: 1.74 },
      { type: "emoji", emoji: "🍃", x: 71, y: 46, size: 14, anim: "float", delay: 0.917, dur: 2.24 },
      { type: "emoji", emoji: "✨", x: 17, y: 73, size: 10, anim: "blink", delay: 1.487, dur: 1.9 },
      { type: "emoji", emoji: "✨", x: 38, y: 67, size: 19, anim: "blink", delay: 1.755, dur: 1.41 }
    ],
  },
  crab_halloween_29_700: {
    v: 1,
    loop: 2.8,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e8f5e9", opacity: 0.44, anim: "twinkle", dur: 2.46, r: 44.97 },
      { type: "emoji", emoji: "🦀", x: 48, y: 48, size: 37, anim: "twinkle", dur: 2.39 },
      { type: "emoji", emoji: "🎩", x: 50, y: 12, size: 30, anim: "bounce", delay: 0.384, dur: 1.6 },
      { type: "emoji", emoji: "🌸", x: 70, y: 42, size: 24, anim: "pop", delay: 0.776, dur: 1.93 },
      { type: "emoji", emoji: "✨", x: 42, y: 51, size: 19, anim: "blink", delay: 0.992, dur: 2.26 },
      { type: "emoji", emoji: "✨", x: 84, y: 25, size: 12, anim: "rise", delay: 0.738, dur: 1.84 },
      { type: "emoji", emoji: "🎉", x: 26, y: 77, size: 25, anim: "float", delay: 0.164, dur: 2.37 },
      { type: "emoji", emoji: "🌿", x: 79, y: 48, size: 16, anim: "float", delay: 1.387, dur: 1.62 },
      { type: "emoji", emoji: "❄️", x: 71, y: 60, size: 23, anim: "wiggle", delay: 1.102, dur: 2.25 },
      { type: "emoji", emoji: "🌟", x: 62, y: 38, size: 14, anim: "blink", delay: 1.313, dur: 1.39 },
      { type: "emoji", emoji: "🌟", x: 43, y: 29, size: 15, anim: "blink", delay: 0.959, dur: 1.24 }
    ],
  },
  crab_christmas_29_701: {
    v: 1,
    loop: 2.96,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#0277bd", opacity: 0.45, anim: "float", dur: 3.13, r: 49.91 },
      { type: "emoji", emoji: "🦀", x: 60, y: 44, size: 33, anim: "float", dur: 3 },
      { type: "emoji", emoji: "🕶️", x: 51, y: 28, size: 29, anim: "bounce", delay: 0.539, dur: 1.55 },
      { type: "emoji", emoji: "🌻", x: 67, y: 40, size: 28, anim: "rise", delay: 0.891, dur: 1.85 },
      { type: "emoji", emoji: "❄️", x: 37, y: 60, size: 16, anim: "rise", delay: 0.275, dur: 1.97 },
      { type: "emoji", emoji: "❄️", x: 77, y: 28, size: 18, anim: "pop", delay: 0.187, dur: 1.43 },
      { type: "emoji", emoji: "🌿", x: 70, y: 73, size: 12, anim: "pop", delay: 1.018, dur: 1.66 },
      { type: "emoji", emoji: "❄️", x: 42, y: 82, size: 12, anim: "pop", delay: 0.408, dur: 1.6 },
      { type: "emoji", emoji: "🌟", x: 46, y: 49, size: 18, anim: "blink", delay: 1.529, dur: 1.38 },
      { type: "emoji", emoji: "💖", x: 30, y: 17, size: 16, anim: "blink", delay: 1.96, dur: 1.77 }
    ],
  },
  crab_coding_29_702: {
    v: 1,
    loop: 2.43,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 34, y: 52, size: 41, anim: "pop", dur: 1.51 },
      { type: "emoji", emoji: "👮", x: 48, y: 16, size: 28, anim: "bounce", delay: 0.412, dur: 1.94 },
      { type: "emoji", emoji: "⭐", x: 71, y: 29, size: 25, anim: "float", delay: 0.634, dur: 1.82 },
      { type: "emoji", emoji: "🌟", x: 14, y: 21, size: 17, anim: "float", delay: 0.436, dur: 1.61 },
      { type: "emoji", emoji: "💖", x: 58, y: 67, size: 13, anim: "wiggle", delay: 0.987, dur: 1.51 },
      { type: "emoji", emoji: "🎊", x: 74, y: 52, size: 24, anim: "pop", delay: 1.047, dur: 2.22 },
      { type: "emoji", emoji: "🌟", x: 39, y: 55, size: 18, anim: "blink", delay: 1.066, dur: 1.89 },
      { type: "emoji", emoji: "🌟", x: 17, y: 50, size: 12, anim: "blink", delay: 0.87, dur: 1.81 }
    ],
  },
  crab_music_29_703: {
    v: 1,
    loop: 3.1,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#4caf50", opacity: 0.46, anim: "heartbeat", dur: 2.31, r: 45.31 },
      { type: "emoji", emoji: "🦀", x: 47, y: 53, size: 37, anim: "heartbeat", dur: 2.47 },
      { type: "emoji", emoji: "👷", x: 49, y: 17, size: 29, anim: "bounce", delay: 0.416, dur: 1.94 },
      { type: "emoji", emoji: "🍫", x: 70, y: 46, size: 27, anim: "rise", delay: 0.548, dur: 1.91 },
      { type: "emoji", emoji: "✨", x: 49, y: 85, size: 19, anim: "pop", delay: 0.518, dur: 1.55 },
      { type: "emoji", emoji: "🎉", x: 44, y: 39, size: 23, anim: "blink", delay: 1.318, dur: 1.26 },
      { type: "emoji", emoji: "🎊", x: 48, y: 89, size: 21, anim: "rise", delay: 1.018, dur: 1.9 },
      { type: "emoji", emoji: "🌊", x: 65, y: 80, size: 25, anim: "pop", delay: 0.221, dur: 2.16 },
      { type: "emoji", emoji: "✨", x: 20, y: 76, size: 18, anim: "blink", delay: 1.924, dur: 1.26 },
      { type: "emoji", emoji: "🌟", x: 62, y: 79, size: 10, anim: "blink", delay: 1.387, dur: 1.34 }
    ],
  },
  crab_sports_29_704: {
    v: 1,
    loop: 3.92,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 55, y: 51, size: 36, anim: "float", dur: 3.4 },
      { type: "emoji", emoji: "🍩", x: 68, y: 42, size: 27, anim: "rise", delay: 0.502, dur: 1.56 },
      { type: "emoji", emoji: "🎊", x: 49, y: 51, size: 23, anim: "blink", delay: 1.403, dur: 2.22 },
      { type: "emoji", emoji: "🍃", x: 48, y: 30, size: 12, anim: "wiggle", delay: 0.432, dur: 2.37 },
      { type: "emoji", emoji: "🌟", x: 67, y: 81, size: 25, anim: "float", delay: 0.018, dur: 2.15 },
      { type: "emoji", emoji: "💖", x: 57, y: 48, size: 11, anim: "blink", delay: 1.94, dur: 1.71 },
      { type: "emoji", emoji: "⭐", x: 48, y: 59, size: 15, anim: "blink", delay: 1.65, dur: 1.23 }
    ],
  },
  crab_food_29_705: {
    v: 1,
    loop: 2.79,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ff8a65", opacity: 0.69, anim: "float", dur: 3.01, w: 98.86, h: 25.26 },
      { type: "emoji", emoji: "🦀", x: 30, y: 53, size: 32, anim: "float", dur: 2.94 },
      { type: "emoji", emoji: "🍬", x: 70, y: 47, size: 22, anim: "float", delay: 0.53, dur: 1.74 },
      { type: "emoji", emoji: "❤️", x: 80, y: 30, size: 13, anim: "pop", delay: 1.4, dur: 1.51 },
      { type: "emoji", emoji: "💫", x: 36, y: 41, size: 13, anim: "wiggle", delay: 1.148, dur: 1.93 },
      { type: "emoji", emoji: "🌟", x: 18, y: 63, size: 13, anim: "blink", delay: 1.98, dur: 1.42 },
      { type: "emoji", emoji: "✨", x: 22, y: 75, size: 14, anim: "blink", delay: 1.707, dur: 1.58 }
    ],
  },
  crab_space_29_706: {
    v: 1,
    loop: 2.57,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f06292", opacity: 0.39, anim: "wave", dur: 1.95, w: 108.29, h: 24.18 },
      { type: "emoji", emoji: "🦀", x: 31, y: 56, size: 35, anim: "wave", dur: 1.87 },
      { type: "emoji", emoji: "👮", x: 50, y: 17, size: 31, anim: "bounce", delay: 0.573, dur: 1.93 },
      { type: "emoji", emoji: "🌿", x: 10, y: 53, size: 18, anim: "rise", delay: 0.826, dur: 1.66 },
      { type: "emoji", emoji: "🍃", x: 75, y: 46, size: 14, anim: "pop", delay: 0.939, dur: 2.06 },
      { type: "emoji", emoji: "🌟", x: 46, y: 83, size: 16, anim: "blink", delay: 1.295, dur: 1.67 },
      { type: "emoji", emoji: "💖", x: 41, y: 73, size: 17, anim: "blink", delay: 1.115, dur: 1.9 }
    ],
  },
  crab_fantasy_29_707: {
    v: 1,
    loop: 1.9,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 60, y: 53, size: 33, anim: "bounce", dur: 1.6 },
      { type: "emoji", emoji: "💎", x: 72, y: 41, size: 25, anim: "blink", delay: 0.445, dur: 1.62 },
      { type: "emoji", emoji: "✨", x: 59, y: 75, size: 23, anim: "wiggle", delay: 0.997, dur: 1.26 },
      { type: "emoji", emoji: "🌊", x: 24, y: 12, size: 20, anim: "blink", delay: 1.201, dur: 2.14 },
      { type: "emoji", emoji: "🌿", x: 45, y: 80, size: 18, anim: "blink", delay: 1.21, dur: 1.85 },
      { type: "emoji", emoji: "⭐", x: 53, y: 84, size: 22, anim: "rise", delay: 1.07, dur: 1.26 },
      { type: "emoji", emoji: "✨", x: 83, y: 27, size: 14, anim: "blink", delay: 1.238, dur: 1.37 },
      { type: "emoji", emoji: "💫", x: 23, y: 39, size: 10, anim: "blink", delay: 1.211, dur: 1.47 }
    ],
  },
  crab_office_29_708: {
    v: 1,
    loop: 2.16,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fffde7", opacity: 0.37, anim: "wiggle", dur: 1.63, r: 40.72 },
      { type: "emoji", emoji: "🦀", x: 68, y: 45, size: 43, anim: "wiggle", dur: 1.35 },
      { type: "emoji", emoji: "💌", x: 70, y: 40, size: 26, anim: "float", delay: 0.764, dur: 1.43 },
      { type: "emoji", emoji: "⭐", x: 55, y: 47, size: 23, anim: "rise", delay: 0.215, dur: 1.47 },
      { type: "emoji", emoji: "🍃", x: 24, y: 60, size: 24, anim: "rise", delay: 1.043, dur: 1.31 },
      { type: "emoji", emoji: "❤️", x: 49, y: 58, size: 22, anim: "float", delay: 0.736, dur: 1.78 },
      { type: "emoji", emoji: "🌟", x: 38, y: 18, size: 12, anim: "blink", delay: 1.184, dur: 1.65 },
      { type: "emoji", emoji: "⭐", x: 54, y: 55, size: 17, anim: "blink", delay: 0.504, dur: 1.91 }
    ],
  },
  crab_fitness_29_709: {
    v: 1,
    loop: 3.92,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#3f51b5", opacity: 0.67, anim: "breathe", dur: 3.59, w: 97.59, h: 21.4 },
      { type: "emoji", emoji: "🦀", x: 32, y: 51, size: 33, anim: "breathe", dur: 3.52 },
      { type: "emoji", emoji: "🎩", x: 49, y: 10, size: 32, anim: "bounce", delay: 0.398, dur: 1.99 },
      { type: "emoji", emoji: "💖", x: 86, y: 81, size: 14, anim: "blink", delay: 1.283, dur: 1.98 },
      { type: "emoji", emoji: "💖", x: 63, y: 86, size: 21, anim: "pop", delay: 1.166, dur: 1.41 },
      { type: "emoji", emoji: "✨", x: 77, y: 31, size: 15, anim: "pop", delay: 0.91, dur: 2.24 },
      { type: "emoji", emoji: "🌟", x: 85, y: 40, size: 22, anim: "wiggle", delay: 0.69, dur: 1.45 },
      { type: "emoji", emoji: "⭐", x: 58, y: 23, size: 19, anim: "blink", delay: 1.486, dur: 1.04 },
      { type: "emoji", emoji: "💖", x: 59, y: 57, size: 13, anim: "blink", delay: 0.621, dur: 1 }
    ],
  },
  crab_travel_29_710: {
    v: 1,
    loop: 2.84,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#f3e5f5", opacity: 0.58, anim: "pulse", dur: 1.83, w: 97.57, h: 23.61 },
      { type: "emoji", emoji: "🦀", x: 59, y: 53, size: 32, anim: "pulse", dur: 2.12 },
      { type: "emoji", emoji: "🎀", x: 69, y: 30, size: 17, anim: "blink", delay: 0.55, dur: 1.62 },
      { type: "emoji", emoji: "🎊", x: 34, y: 68, size: 20, anim: "blink", delay: 1.324, dur: 2.26 },
      { type: "emoji", emoji: "✨", x: 27, y: 85, size: 19, anim: "wiggle", delay: 0.858, dur: 2.26 },
      { type: "emoji", emoji: "💫", x: 74, y: 30, size: 24, anim: "float", delay: 0.876, dur: 2.17 },
      { type: "emoji", emoji: "✨", x: 73, y: 19, size: 18, anim: "blink", delay: 1.741, dur: 1.34 },
      { type: "emoji", emoji: "⭐", x: 21, y: 49, size: 15, anim: "blink", delay: 0.722, dur: 1.36 }
    ],
  },
  crab_art_29_711: {
    v: 1,
    loop: 2.32,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 60, y: 44, size: 40, anim: "pulse", dur: 2.26 },
      { type: "emoji", emoji: "🎓", x: 51, y: 15, size: 26, anim: "bounce", delay: 0.352, dur: 1.53 },
      { type: "emoji", emoji: "🍄", x: 69, y: 44, size: 26, anim: "rise", delay: 0.439, dur: 1.63 },
      { type: "emoji", emoji: "💫", x: 18, y: 80, size: 13, anim: "wiggle", delay: 1.331, dur: 1.88 },
      { type: "emoji", emoji: "✨", x: 61, y: 40, size: 16, anim: "blink", delay: 1.973, dur: 1.77 },
      { type: "emoji", emoji: "💖", x: 45, y: 20, size: 11, anim: "blink", delay: 0.716, dur: 1.24 }
    ],
  },
  crab_science_29_712: {
    v: 1,
    loop: 3.07,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ffa726", opacity: 0.7, anim: "float", dur: 2.68, w: 106.94, h: 22.86 },
      { type: "emoji", emoji: "🦀", x: 48, y: 44, size: 41, anim: "float", dur: 2.88 },
      { type: "emoji", emoji: "🪖", x: 49, y: 18, size: 29, anim: "bounce", delay: 0.32, dur: 1.73 },
      { type: "emoji", emoji: "🍫", x: 72, y: 42, size: 25, anim: "rise", delay: 0.497, dur: 1.65 },
      { type: "emoji", emoji: "🌟", x: 44, y: 48, size: 17, anim: "rise", delay: 1.126, dur: 1.27 },
      { type: "emoji", emoji: "🔥", x: 49, y: 48, size: 18, anim: "float", delay: 0.046, dur: 1.37 },
      { type: "emoji", emoji: "🎈", x: 15, y: 56, size: 24, anim: "pop", delay: 1.124, dur: 1.53 },
      { type: "emoji", emoji: "🌟", x: 33, y: 69, size: 19, anim: "blink", delay: 0.765, dur: 1.23 },
      { type: "emoji", emoji: "✨", x: 76, y: 39, size: 12, anim: "blink", delay: 1.374, dur: 1.04 }
    ],
  },
  crab_pets_29_713: {
    v: 1,
    loop: 3.41,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#e8f5e9", opacity: 0.56, anim: "settle", dur: 2.77, w: 92.44, h: 20.05 },
      { type: "emoji", emoji: "🦀", x: 46, y: 55, size: 37, anim: "settle", dur: 3.01 },
      { type: "emoji", emoji: "🎁", x: 74, y: 38, size: 24, anim: "pop", delay: 0.84, dur: 1.59 },
      { type: "emoji", emoji: "🌟", x: 60, y: 54, size: 16, anim: "blink", delay: 1.219, dur: 1.69 },
      { type: "emoji", emoji: "🌿", x: 66, y: 22, size: 14, anim: "wiggle", delay: 0.242, dur: 2.18 },
      { type: "emoji", emoji: "💖", x: 86, y: 42, size: 15, anim: "blink", delay: 0.841, dur: 1.99 },
      { type: "emoji", emoji: "💫", x: 73, y: 18, size: 15, anim: "blink", delay: 1.73, dur: 1.29 },
      { type: "emoji", emoji: "🌟", x: 46, y: 51, size: 14, anim: "blink", delay: 0.647, dur: 1.89 }
    ],
  },
  crab_magic_29_714: {
    v: 1,
    loop: 2.03,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 54, y: 48, size: 37, anim: "bounce", dur: 1.36 },
      { type: "emoji", emoji: "🎩", x: 51, y: 12, size: 33, anim: "bounce", delay: 0.642, dur: 1.86 },
      { type: "emoji", emoji: "🎈", x: 39, y: 26, size: 25, anim: "blink", delay: 0.918, dur: 1.78 },
      { type: "emoji", emoji: "🎈", x: 56, y: 40, size: 23, anim: "float", delay: 1.391, dur: 1.56 },
      { type: "emoji", emoji: "✨", x: 10, y: 68, size: 18, anim: "blink", delay: 0.472, dur: 1.3 },
      { type: "emoji", emoji: "🌊", x: 20, y: 65, size: 23, anim: "rise", delay: 0.181, dur: 1.42 },
      { type: "emoji", emoji: "💖", x: 84, y: 51, size: 11, anim: "blink", delay: 1.965, dur: 1.68 },
      { type: "emoji", emoji: "💫", x: 32, y: 19, size: 13, anim: "blink", delay: 1.977, dur: 1.93 }
    ],
  },
  crab_retro_29_715: {
    v: 1,
    loop: 2.88,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#e64a19", opacity: 0.49, anim: "twinkle", dur: 2.59, w: 101.28, h: 27.31 },
      { type: "emoji", emoji: "🦀", x: 32, y: 54, size: 37, anim: "twinkle", dur: 2.4 },
      { type: "emoji", emoji: "🌻", x: 71, y: 41, size: 29, anim: "rise", delay: 0.75, dur: 1.66 },
      { type: "emoji", emoji: "✨", x: 63, y: 57, size: 19, anim: "pop", delay: 1.338, dur: 1.42 },
      { type: "emoji", emoji: "❄️", x: 44, y: 13, size: 24, anim: "pop", delay: 0.504, dur: 1.26 },
      { type: "emoji", emoji: "💫", x: 64, y: 19, size: 12, anim: "blink", delay: 1.096, dur: 1.96 },
      { type: "emoji", emoji: "🌟", x: 45, y: 36, size: 15, anim: "blink", delay: 0.652, dur: 1.48 }
    ],
  },
  crab_cyber_29_716: {
    v: 1,
    loop: 3.01,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ec407a", opacity: 0.46, anim: "float", dur: 2.79, r: 47.46 },
      { type: "emoji", emoji: "🦀", x: 69, y: 46, size: 37, anim: "float", dur: 2.9 },
      { type: "emoji", emoji: "🌹", x: 68, y: 44, size: 28, anim: "blink", delay: 0.738, dur: 1.49 },
      { type: "emoji", emoji: "🌿", x: 20, y: 51, size: 23, anim: "pop", delay: 1.324, dur: 1.25 },
      { type: "emoji", emoji: "🍃", x: 70, y: 74, size: 14, anim: "wiggle", delay: 0.91, dur: 2.02 },
      { type: "emoji", emoji: "💫", x: 77, y: 31, size: 22, anim: "rise", delay: 1.175, dur: 2.16 },
      { type: "emoji", emoji: "🔥", x: 89, y: 70, size: 13, anim: "pop", delay: 0.188, dur: 1.3 },
      { type: "emoji", emoji: "✨", x: 56, y: 32, size: 19, anim: "blink", delay: 1.711, dur: 1.01 },
      { type: "emoji", emoji: "💫", x: 63, y: 41, size: 18, anim: "blink", delay: 1.738, dur: 1.38 }
    ],
  },
  crab_nature_29_717: {
    v: 1,
    loop: 2.09,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 68, y: 56, size: 40, anim: "pop", dur: 1.56 },
      { type: "emoji", emoji: "🍃", x: 62, y: 54, size: 15, anim: "wiggle", delay: 1.404, dur: 2.01 },
      { type: "emoji", emoji: "🍃", x: 43, y: 52, size: 18, anim: "blink", delay: 0.609, dur: 1.47 },
      { type: "emoji", emoji: "🎉", x: 66, y: 41, size: 19, anim: "rise", delay: 0.521, dur: 1.71 },
      { type: "emoji", emoji: "🎈", x: 88, y: 79, size: 17, anim: "rise", delay: 1.412, dur: 1.94 },
      { type: "emoji", emoji: "💖", x: 54, y: 74, size: 12, anim: "blink", delay: 0.811, dur: 1.91 },
      { type: "emoji", emoji: "⭐", x: 39, y: 68, size: 11, anim: "blink", delay: 1.588, dur: 1.19 }
    ],
  },
  crab_underwater_29_718: {
    v: 1,
    loop: 3.2,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff9c4", opacity: 0.44, anim: "heartbeat", dur: 2.44, w: 97.27, h: 23.12 },
      { type: "emoji", emoji: "🦀", x: 42, y: 50, size: 36, anim: "heartbeat", dur: 2.64 },
      { type: "emoji", emoji: "⭐", x: 58, y: 25, size: 24, anim: "float", delay: 0.685, dur: 1.31 },
      { type: "emoji", emoji: "🌿", x: 77, y: 18, size: 16, anim: "wiggle", delay: 0.806, dur: 1.65 },
      { type: "emoji", emoji: "⭐", x: 83, y: 54, size: 20, anim: "wiggle", delay: 0.079, dur: 2.34 },
      { type: "emoji", emoji: "💖", x: 45, y: 71, size: 19, anim: "blink", delay: 1.048, dur: 1.55 },
      { type: "emoji", emoji: "✨", x: 35, y: 78, size: 18, anim: "blink", delay: 0.973, dur: 1.02 }
    ],
  },
  crab_sky_29_719: {
    v: 1,
    loop: 3.86,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 31, y: 51, size: 37, anim: "float", dur: 3.55 },
      { type: "emoji", emoji: "👷", x: 50, y: 18, size: 29, anim: "bounce", delay: 0.7, dur: 1.75 },
      { type: "emoji", emoji: "✨", x: 31, y: 50, size: 14, anim: "blink", delay: 0.967, dur: 1.83 },
      { type: "emoji", emoji: "❤️", x: 23, y: 84, size: 20, anim: "blink", delay: 0.232, dur: 1.37 },
      { type: "emoji", emoji: "🌟", x: 27, y: 60, size: 19, anim: "blink", delay: 1.997, dur: 1.15 },
      { type: "emoji", emoji: "💖", x: 56, y: 79, size: 19, anim: "blink", delay: 1.378, dur: 1.12 }
    ],
  },
  crab_party_30_720: {
    v: 1,
    loop: 3.1,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fff3e0", opacity: 0.57, anim: "float", dur: 2.76, r: 48.38 },
      { type: "emoji", emoji: "🦀", x: 63, y: 55, size: 34, anim: "float", dur: 2.97 },
      { type: "emoji", emoji: "🍫", x: 72, y: 47, size: 25, anim: "rise", delay: 0.881, dur: 1.42 },
      { type: "emoji", emoji: "🌿", x: 38, y: 77, size: 15, anim: "wiggle", delay: 0.728, dur: 1.86 },
      { type: "emoji", emoji: "🌊", x: 27, y: 22, size: 13, anim: "pop", delay: 1.067, dur: 1.22 },
      { type: "emoji", emoji: "🍃", x: 83, y: 37, size: 18, anim: "wiggle", delay: 0.473, dur: 1.99 },
      { type: "emoji", emoji: "🌿", x: 72, y: 49, size: 18, anim: "blink", delay: 0.128, dur: 1.86 },
      { type: "emoji", emoji: "🌊", x: 13, y: 75, size: 23, anim: "blink", delay: 0.843, dur: 1.66 },
      { type: "emoji", emoji: "💖", x: 57, y: 45, size: 19, anim: "blink", delay: 0.76, dur: 1.96 },
      { type: "emoji", emoji: "✨", x: 24, y: 72, size: 14, anim: "blink", delay: 0.691, dur: 1.86 }
    ],
  },
  crab_beach_30_721: {
    v: 1,
    loop: 2.28,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#29b6f6", opacity: 0.42, anim: "wave", dur: 1.74, r: 49.87 },
      { type: "emoji", emoji: "🦀", x: 40, y: 45, size: 43, anim: "wave", dur: 1.93 },
      { type: "emoji", emoji: "👮", x: 49, y: 17, size: 31, anim: "bounce", delay: 0.658, dur: 1.56 },
      { type: "emoji", emoji: "🌹", x: 72, y: 41, size: 28, anim: "rise", delay: 0.774, dur: 1.5 },
      { type: "emoji", emoji: "🎊", x: 22, y: 68, size: 22, anim: "pop", delay: 1.279, dur: 1.97 },
      { type: "emoji", emoji: "🍂", x: 73, y: 76, size: 25, anim: "blink", delay: 1.419, dur: 1.58 },
      { type: "emoji", emoji: "🔥", x: 71, y: 64, size: 20, anim: "rise", delay: 0.381, dur: 1.47 },
      { type: "emoji", emoji: "✨", x: 43, y: 26, size: 13, anim: "blink", delay: 0.733, dur: 1.99 },
      { type: "emoji", emoji: "✨", x: 17, y: 28, size: 13, anim: "blink", delay: 1.423, dur: 1.38 }
    ],
  },
  crab_winter_30_722: {
    v: 1,
    loop: 1.76,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#f57c00", opacity: 0.55, anim: "bounce", dur: 1.33, r: 49.89 },
      { type: "emoji", emoji: "🦀", x: 58, y: 50, size: 37, anim: "bounce", dur: 1.62 },
      { type: "emoji", emoji: "🧙", x: 49, y: 11, size: 35, anim: "bounce", delay: 0.421, dur: 1.92 },
      { type: "emoji", emoji: "🌹", x: 67, y: 45, size: 26, anim: "pop", delay: 0.506, dur: 1.64 },
      { type: "emoji", emoji: "🍃", x: 76, y: 57, size: 18, anim: "wiggle", delay: 0.011, dur: 1.52 },
      { type: "emoji", emoji: "💖", x: 42, y: 29, size: 25, anim: "wiggle", delay: 0.216, dur: 1.28 },
      { type: "emoji", emoji: "🍂", x: 25, y: 57, size: 21, anim: "wiggle", delay: 1.366, dur: 1.87 },
      { type: "emoji", emoji: "💫", x: 77, y: 74, size: 16, anim: "blink", delay: 1.683, dur: 1.29 },
      { type: "emoji", emoji: "💖", x: 61, y: 49, size: 11, anim: "blink", delay: 1.998, dur: 1.29 }
    ],
  },
  crab_spring_30_723: {
    v: 1,
    loop: 2.13,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 52, y: 49, size: 38, anim: "wiggle", dur: 1.38 },
      { type: "emoji", emoji: "🍳", x: 50, y: 15, size: 29, anim: "bounce", delay: 0.328, dur: 1.51 },
      { type: "emoji", emoji: "🌟", x: 74, y: 27, size: 25, anim: "pop", delay: 0.401, dur: 1.46 },
      { type: "emoji", emoji: "💫", x: 64, y: 31, size: 18, anim: "rise", delay: 1.102, dur: 2.34 },
      { type: "emoji", emoji: "💫", x: 50, y: 31, size: 11, anim: "blink", delay: 1.271, dur: 1.71 },
      { type: "emoji", emoji: "💫", x: 58, y: 67, size: 17, anim: "blink", delay: 1.063, dur: 1.54 }
    ],
  },
  crab_halloween_30_724: {
    v: 1,
    loop: 4.07,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#673ab7", opacity: 0.57, anim: "breathe", dur: 3.54, w: 102.3, h: 21.9 },
      { type: "emoji", emoji: "🦀", x: 39, y: 55, size: 33, anim: "breathe", dur: 3.4 },
      { type: "emoji", emoji: "🧣", x: 48, y: 59, size: 27, anim: "bounce", delay: 0.369, dur: 1.91 },
      { type: "emoji", emoji: "🍰", x: 69, y: 40, size: 26, anim: "blink", delay: 0.996, dur: 1.82 },
      { type: "emoji", emoji: "🎉", x: 25, y: 25, size: 13, anim: "blink", delay: 1.382, dur: 1.84 },
      { type: "emoji", emoji: "🎊", x: 12, y: 89, size: 19, anim: "wiggle", delay: 0.901, dur: 2.18 },
      { type: "emoji", emoji: "🌊", x: 75, y: 85, size: 21, anim: "float", delay: 1.406, dur: 1.99 },
      { type: "emoji", emoji: "❤️", x: 73, y: 88, size: 23, anim: "float", delay: 0.971, dur: 2.04 },
      { type: "emoji", emoji: "🌊", x: 85, y: 10, size: 17, anim: "blink", delay: 0.884, dur: 1.9 },
      { type: "emoji", emoji: "🌟", x: 63, y: 49, size: 11, anim: "blink", delay: 0.94, dur: 1.41 },
      { type: "emoji", emoji: "🌟", x: 46, y: 68, size: 12, anim: "blink", delay: 1.506, dur: 1.86 }
    ],
  },
  crab_christmas_30_725: {
    v: 1,
    loop: 2.7,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#f4511e", opacity: 0.58, anim: "pulse", dur: 1.85, r: 40.49 },
      { type: "emoji", emoji: "🦀", x: 34, y: 47, size: 36, anim: "pulse", dur: 2.14 },
      { type: "emoji", emoji: "👒", x: 51, y: 14, size: 32, anim: "bounce", delay: 0.622, dur: 1.5 },
      { type: "emoji", emoji: "🎊", x: 15, y: 67, size: 12, anim: "blink", delay: 1.134, dur: 1.9 },
      { type: "emoji", emoji: "⭐", x: 15, y: 38, size: 20, anim: "wiggle", delay: 0.333, dur: 2.29 },
      { type: "emoji", emoji: "✨", x: 23, y: 50, size: 18, anim: "rise", delay: 1.019, dur: 1.69 },
      { type: "emoji", emoji: "🌟", x: 76, y: 30, size: 16, anim: "blink", delay: 1.112, dur: 1.72 },
      { type: "emoji", emoji: "✨", x: 29, y: 34, size: 13, anim: "blink", delay: 1.091, dur: 1.31 }
    ],
  },
  crab_coding_30_726: {
    v: 1,
    loop: 2.32,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 61, y: 48, size: 36, anim: "pulse", dur: 2.17 },
      { type: "emoji", emoji: "🌟", x: 75, y: 28, size: 27, anim: "blink", delay: 0.524, dur: 1.83 },
      { type: "emoji", emoji: "❤️", x: 22, y: 31, size: 20, anim: "rise", delay: 0.283, dur: 1.75 },
      { type: "emoji", emoji: "🍃", x: 76, y: 28, size: 21, anim: "wiggle", delay: 1.421, dur: 1.72 },
      { type: "emoji", emoji: "💖", x: 17, y: 68, size: 10, anim: "blink", delay: 0.898, dur: 1.14 },
      { type: "emoji", emoji: "💫", x: 38, y: 51, size: 11, anim: "blink", delay: 1.494, dur: 1.8 }
    ],
  },
  crab_music_30_727: {
    v: 1,
    loop: 3.15,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 45, y: 53, size: 40, anim: "float", dur: 2.89 },
      { type: "emoji", emoji: "🔥", x: 70, y: 22, size: 21, anim: "rise", delay: 0.232, dur: 1.29 },
      { type: "emoji", emoji: "❄️", x: 38, y: 75, size: 14, anim: "blink", delay: 1.25, dur: 2.05 },
      { type: "emoji", emoji: "🌿", x: 20, y: 53, size: 17, anim: "wiggle", delay: 0.464, dur: 1.47 },
      { type: "emoji", emoji: "🌸", x: 20, y: 29, size: 21, anim: "blink", delay: 0.016, dur: 1.95 },
      { type: "emoji", emoji: "✨", x: 51, y: 79, size: 14, anim: "blink", delay: 0.826, dur: 1.5 },
      { type: "emoji", emoji: "💖", x: 35, y: 49, size: 16, anim: "blink", delay: 1.859, dur: 1.44 }
    ],
  },
  crab_sports_30_728: {
    v: 1,
    loop: 3.59,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fbc02d", opacity: 0.63, anim: "settle", dur: 3.2, w: 90.05, h: 26.23 },
      { type: "emoji", emoji: "🦀", x: 32, y: 53, size: 39, anim: "settle", dur: 2.85 },
      { type: "emoji", emoji: "🎩", x: 49, y: 14, size: 31, anim: "bounce", delay: 0.683, dur: 1.74 },
      { type: "emoji", emoji: "💖", x: 22, y: 12, size: 15, anim: "wiggle", delay: 0.344, dur: 2.03 },
      { type: "emoji", emoji: "❄️", x: 26, y: 34, size: 18, anim: "rise", delay: 0.629, dur: 2.4 },
      { type: "emoji", emoji: "🎈", x: 53, y: 67, size: 23, anim: "float", delay: 0.05, dur: 2.28 },
      { type: "emoji", emoji: "🎉", x: 68, y: 27, size: 16, anim: "blink", delay: 0.732, dur: 2.31 },
      { type: "emoji", emoji: "🌊", x: 61, y: 30, size: 19, anim: "float", delay: 0.574, dur: 1.6 },
      { type: "emoji", emoji: "💖", x: 82, y: 58, size: 19, anim: "blink", delay: 0.6, dur: 1.77 },
      { type: "emoji", emoji: "⭐", x: 21, y: 25, size: 13, anim: "blink", delay: 0.796, dur: 1.22 }
    ],
  },
  crab_food_30_729: {
    v: 1,
    loop: 1.79,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#9fa8da", opacity: 0.45, anim: "bounce", dur: 1.13, w: 108.86, h: 27.35 },
      { type: "emoji", emoji: "🦀", x: 47, y: 52, size: 39, anim: "bounce", dur: 1.19 },
      { type: "emoji", emoji: "🌊", x: 40, y: 69, size: 23, anim: "float", delay: 0.013, dur: 1.6 },
      { type: "emoji", emoji: "🌊", x: 87, y: 78, size: 13, anim: "pop", delay: 0.084, dur: 1.25 },
      { type: "emoji", emoji: "🌸", x: 21, y: 46, size: 15, anim: "wiggle", delay: 1.084, dur: 2.13 },
      { type: "emoji", emoji: "🌊", x: 74, y: 79, size: 15, anim: "wiggle", delay: 0.508, dur: 1.8 },
      { type: "emoji", emoji: "💖", x: 68, y: 45, size: 13, anim: "blink", delay: 0.888, dur: 1.5 },
      { type: "emoji", emoji: "⭐", x: 82, y: 43, size: 11, anim: "blink", delay: 0.839, dur: 1.91 }
    ],
  },
  crab_space_30_730: {
    v: 1,
    loop: 3.05,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 58, y: 48, size: 41, anim: "twinkle", dur: 2.37 },
      { type: "emoji", emoji: "🌟", x: 53, y: 55, size: 25, anim: "rise", delay: 0.644, dur: 2.35 },
      { type: "emoji", emoji: "❤️", x: 89, y: 77, size: 25, anim: "wiggle", delay: 0.451, dur: 1.95 },
      { type: "emoji", emoji: "✨", x: 47, y: 52, size: 12, anim: "blink", delay: 0.704, dur: 1.46 },
      { type: "emoji", emoji: "💖", x: 43, y: 31, size: 14, anim: "blink", delay: 1.986, dur: 1.31 }
    ],
  },
  crab_fantasy_30_731: {
    v: 1,
    loop: 3.43,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#b3e5fc", opacity: 0.42, anim: "float", dur: 3.09, w: 94.93, h: 20.24 },
      { type: "emoji", emoji: "🦀", x: 60, y: 46, size: 35, anim: "float", dur: 2.95 },
      { type: "emoji", emoji: "🍂", x: 34, y: 19, size: 24, anim: "wiggle", delay: 0.398, dur: 1.91 },
      { type: "emoji", emoji: "❄️", x: 80, y: 16, size: 24, anim: "rise", delay: 0.352, dur: 2.13 },
      { type: "emoji", emoji: "❄️", x: 34, y: 10, size: 13, anim: "blink", delay: 0.276, dur: 1.93 },
      { type: "emoji", emoji: "💖", x: 63, y: 56, size: 18, anim: "blink", delay: 1.753, dur: 1.25 },
      { type: "emoji", emoji: "🌟", x: 25, y: 18, size: 12, anim: "blink", delay: 1.867, dur: 1.69 }
    ],
  },
  crab_office_30_732: {
    v: 1,
    loop: 2.2,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 64, y: 54, size: 43, anim: "pop", dur: 1.69 },
      { type: "emoji", emoji: "🍬", x: 74, y: 45, size: 20, anim: "rise", delay: 0.804, dur: 1.83 },
      { type: "emoji", emoji: "🍃", x: 20, y: 37, size: 19, anim: "rise", delay: 0.943, dur: 2.06 },
      { type: "emoji", emoji: "🍂", x: 68, y: 26, size: 14, anim: "float", delay: 0.498, dur: 1.99 },
      { type: "emoji", emoji: "🌟", x: 75, y: 57, size: 16, anim: "blink", delay: 1.029, dur: 1.4 },
      { type: "emoji", emoji: "✨", x: 47, y: 39, size: 19, anim: "blink", delay: 0.504, dur: 1.18 }
    ],
  },
  crab_fitness_30_733: {
    v: 1,
    loop: 2.99,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#a5d6a7", opacity: 0.49, anim: "heartbeat", dur: 2.28, w: 99.79, h: 22.07 },
      { type: "emoji", emoji: "🦀", x: 35, y: 55, size: 32, anim: "heartbeat", dur: 2.48 },
      { type: "emoji", emoji: "🪖", x: 51, y: 16, size: 29, anim: "bounce", delay: 0.343, dur: 1.81 },
      { type: "emoji", emoji: "🍭", x: 71, y: 41, size: 26, anim: "blink", delay: 0.559, dur: 1.96 },
      { type: "emoji", emoji: "🌊", x: 86, y: 36, size: 12, anim: "pop", delay: 0.949, dur: 1.91 },
      { type: "emoji", emoji: "🌟", x: 61, y: 68, size: 24, anim: "rise", delay: 0.809, dur: 1.63 },
      { type: "emoji", emoji: "✨", x: 28, y: 76, size: 12, anim: "blink", delay: 1.526, dur: 1.43 },
      { type: "emoji", emoji: "🌟", x: 42, y: 44, size: 18, anim: "blink", delay: 1.532, dur: 1.18 }
    ],
  },
  crab_travel_30_734: {
    v: 1,
    loop: 3.84,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ede7f6", opacity: 0.68, anim: "float", dur: 3.58, w: 106.07, h: 19.44 },
      { type: "emoji", emoji: "🦀", x: 33, y: 49, size: 33, anim: "float", dur: 3.46 },
      { type: "emoji", emoji: "🧣", x: 48, y: 57, size: 24, anim: "bounce", delay: 0.528, dur: 1.68 },
      { type: "emoji", emoji: "💎", x: 67, y: 36, size: 25, anim: "float", delay: 0.82, dur: 1.81 },
      { type: "emoji", emoji: "❤️", x: 33, y: 23, size: 19, anim: "rise", delay: 1.448, dur: 1.52 },
      { type: "emoji", emoji: "🌸", x: 21, y: 85, size: 24, anim: "pop", delay: 0.565, dur: 1.48 },
      { type: "emoji", emoji: "🌸", x: 74, y: 57, size: 22, anim: "float", delay: 0.894, dur: 1.8 },
      { type: "emoji", emoji: "🌸", x: 67, y: 80, size: 22, anim: "wiggle", delay: 0.568, dur: 1.56 },
      { type: "emoji", emoji: "💖", x: 55, y: 72, size: 10, anim: "blink", delay: 0.707, dur: 1.6 },
      { type: "emoji", emoji: "💫", x: 63, y: 29, size: 11, anim: "blink", delay: 1.195, dur: 1.67 }
    ],
  },
  crab_art_30_735: {
    v: 1,
    loop: 2.96,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ff7043", opacity: 0.61, anim: "float", dur: 3.18, r: 44.99 },
      { type: "emoji", emoji: "🦀", x: 46, y: 45, size: 40, anim: "float", dur: 2.96 },
      { type: "emoji", emoji: "🧣", x: 48, y: 57, size: 25, anim: "bounce", delay: 0.315, dur: 1.85 },
      { type: "emoji", emoji: "🌟", x: 73, y: 26, size: 26, anim: "pop", delay: 0.861, dur: 1.53 },
      { type: "emoji", emoji: "🌿", x: 15, y: 55, size: 20, anim: "blink", delay: 0.342, dur: 1.54 },
      { type: "emoji", emoji: "✨", x: 38, y: 19, size: 21, anim: "rise", delay: 0.639, dur: 1.31 },
      { type: "emoji", emoji: "💖", x: 28, y: 67, size: 18, anim: "blink", delay: 1.048, dur: 1.04 },
      { type: "emoji", emoji: "💫", x: 38, y: 63, size: 15, anim: "blink", delay: 0.885, dur: 1.45 }
    ],
  },
  crab_science_30_736: {
    v: 1,
    loop: 2.48,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ec407a", opacity: 0.4, anim: "wave", dur: 1.77, r: 42.18 },
      { type: "emoji", emoji: "🦀", x: 36, y: 54, size: 40, anim: "wave", dur: 1.81 },
      { type: "emoji", emoji: "🍰", x: 68, y: 37, size: 26, anim: "rise", delay: 0.878, dur: 1.6 },
      { type: "emoji", emoji: "🎊", x: 42, y: 82, size: 18, anim: "float", delay: 1.071, dur: 1.82 },
      { type: "emoji", emoji: "🎉", x: 46, y: 42, size: 18, anim: "blink", delay: 0.231, dur: 1.81 },
      { type: "emoji", emoji: "🎈", x: 30, y: 82, size: 17, anim: "rise", delay: 0.363, dur: 1.33 },
      { type: "emoji", emoji: "⭐", x: 50, y: 68, size: 13, anim: "blink", delay: 1.302, dur: 1.8 },
      { type: "emoji", emoji: "💫", x: 61, y: 52, size: 17, anim: "blink", delay: 0.919, dur: 1.35 }
    ],
  },
  crab_pets_30_737: {
    v: 1,
    loop: 1.98,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ce93d8", opacity: 0.31, anim: "bounce", dur: 1.71, w: 98.6, h: 20.97 },
      { type: "emoji", emoji: "🦀", x: 57, y: 45, size: 33, anim: "bounce", dur: 1.36 },
      { type: "emoji", emoji: "🎭", x: 48, y: 27, size: 29, anim: "bounce", delay: 0.398, dur: 1.64 },
      { type: "emoji", emoji: "🎈", x: 72, y: 26, size: 29, anim: "float", delay: 0.919, dur: 1.92 },
      { type: "emoji", emoji: "❤️", x: 10, y: 56, size: 23, anim: "float", delay: 0.605, dur: 2.12 },
      { type: "emoji", emoji: "🍃", x: 18, y: 36, size: 25, anim: "pop", delay: 0.656, dur: 2.12 },
      { type: "emoji", emoji: "🎈", x: 46, y: 26, size: 15, anim: "pop", delay: 0.331, dur: 2.24 },
      { type: "emoji", emoji: "🌿", x: 48, y: 86, size: 12, anim: "wiggle", delay: 0.45, dur: 1.32 },
      { type: "emoji", emoji: "✨", x: 32, y: 34, size: 12, anim: "blink", delay: 1.883, dur: 1.37 },
      { type: "emoji", emoji: "✨", x: 32, y: 56, size: 16, anim: "blink", delay: 1.43, dur: 1.83 }
    ],
  },
  crab_magic_30_738: {
    v: 1,
    loop: 2.2,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fbc02d", opacity: 0.58, anim: "wiggle", dur: 1.55, r: 44.96 },
      { type: "emoji", emoji: "🦀", x: 59, y: 47, size: 39, anim: "wiggle", dur: 1.52 },
      { type: "emoji", emoji: "👮", x: 48, y: 15, size: 31, anim: "bounce", delay: 0.42, dur: 1.86 },
      { type: "emoji", emoji: "🌊", x: 10, y: 16, size: 25, anim: "float", delay: 0.193, dur: 1.8 },
      { type: "emoji", emoji: "❤️", x: 39, y: 89, size: 19, anim: "rise", delay: 1.483, dur: 1.75 },
      { type: "emoji", emoji: "💫", x: 60, y: 70, size: 25, anim: "pop", delay: 1.153, dur: 1.2 },
      { type: "emoji", emoji: "🌟", x: 27, y: 39, size: 17, anim: "blink", delay: 0.773, dur: 1.5 },
      { type: "emoji", emoji: "⭐", x: 58, y: 19, size: 16, anim: "blink", delay: 1.495, dur: 1.23 }
    ],
  },
  crab_retro_30_739: {
    v: 1,
    loop: 3.92,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#303f9f", opacity: 0.32, anim: "breathe", dur: 3.67, w: 92.37, h: 18.07 },
      { type: "emoji", emoji: "🦀", x: 44, y: 55, size: 36, anim: "breathe", dur: 3.63 },
      { type: "emoji", emoji: "👒", x: 50, y: 14, size: 33, anim: "bounce", delay: 0.661, dur: 1.57 },
      { type: "emoji", emoji: "⭐", x: 71, y: 32, size: 23, anim: "pop", delay: 0.496, dur: 1.54 },
      { type: "emoji", emoji: "🎈", x: 81, y: 33, size: 17, anim: "blink", delay: 0.14, dur: 1.47 },
      { type: "emoji", emoji: "🌊", x: 24, y: 71, size: 13, anim: "pop", delay: 0.058, dur: 2.14 },
      { type: "emoji", emoji: "💫", x: 31, y: 44, size: 13, anim: "blink", delay: 0.643, dur: 1.97 },
      { type: "emoji", emoji: "🎊", x: 60, y: 36, size: 12, anim: "float", delay: 0.975, dur: 2.22 },
      { type: "emoji", emoji: "⭐", x: 87, y: 58, size: 20, anim: "float", delay: 0.431, dur: 2.2 },
      { type: "emoji", emoji: "⭐", x: 70, y: 47, size: 13, anim: "blink", delay: 1.116, dur: 1.74 },
      { type: "emoji", emoji: "💫", x: 61, y: 49, size: 17, anim: "blink", delay: 1.452, dur: 1.85 }
    ],
  },
  crab_cyber_30_740: {
    v: 1,
    loop: 2.73,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 51, y: 56, size: 33, anim: "pulse", dur: 2.01 },
      { type: "emoji", emoji: "👮", x: 50, y: 15, size: 30, anim: "bounce", delay: 0.335, dur: 1.64 },
      { type: "emoji", emoji: "🌻", x: 69, y: 40, size: 29, anim: "pop", delay: 0.599, dur: 1.66 },
      { type: "emoji", emoji: "❤️", x: 73, y: 85, size: 13, anim: "pop", delay: 1.296, dur: 1.46 },
      { type: "emoji", emoji: "🍃", x: 31, y: 13, size: 23, anim: "wiggle", delay: 0.305, dur: 1.97 },
      { type: "emoji", emoji: "💖", x: 19, y: 77, size: 17, anim: "blink", delay: 1.993, dur: 1.77 },
      { type: "emoji", emoji: "💖", x: 48, y: 56, size: 13, anim: "blink", delay: 0.584, dur: 1.3 }
    ],
  },
  crab_nature_30_741: {
    v: 1,
    loop: 2.61,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#0288d1", opacity: 0.68, anim: "pulse", dur: 2.2, w: 94.54, h: 19.99 },
      { type: "emoji", emoji: "🦀", x: 56, y: 49, size: 36, anim: "pulse", dur: 2.08 },
      { type: "emoji", emoji: "🎩", x: 52, y: 12, size: 33, anim: "bounce", delay: 0.322, dur: 1.98 },
      { type: "emoji", emoji: "🎉", x: 69, y: 88, size: 16, anim: "pop", delay: 0.574, dur: 1.95 },
      { type: "emoji", emoji: "💖", x: 35, y: 38, size: 17, anim: "wiggle", delay: 0.937, dur: 1.71 },
      { type: "emoji", emoji: "💖", x: 47, y: 32, size: 14, anim: "blink", delay: 0.941, dur: 1.49 },
      { type: "emoji", emoji: "✨", x: 38, y: 82, size: 13, anim: "blink", delay: 1.6, dur: 1.58 }
    ],
  },
  crab_underwater_30_742: {
    v: 1,
    loop: 3.16,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffe0b2", opacity: 0.69, anim: "float", dur: 2.69, w: 108.58, h: 22.45 },
      { type: "emoji", emoji: "🦀", x: 61, y: 51, size: 38, anim: "float", dur: 2.72 },
      { type: "emoji", emoji: "🍬", x: 73, y: 41, size: 22, anim: "float", delay: 0.852, dur: 1.97 },
      { type: "emoji", emoji: "❤️", x: 13, y: 27, size: 21, anim: "float", delay: 0.749, dur: 1.99 },
      { type: "emoji", emoji: "🌿", x: 11, y: 85, size: 22, anim: "rise", delay: 0.055, dur: 1.56 },
      { type: "emoji", emoji: "💫", x: 41, y: 81, size: 17, anim: "blink", delay: 0.615, dur: 1.35 },
      { type: "emoji", emoji: "💫", x: 75, y: 57, size: 19, anim: "blink", delay: 1.248, dur: 1.01 }
    ],
  },
  crab_sky_30_743: {
    v: 1,
    loop: 3.35,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#c8e6c9", opacity: 0.52, anim: "settle", dur: 2.78, w: 101.61, h: 21.58 },
      { type: "emoji", emoji: "🦀", x: 64, y: 50, size: 36, anim: "settle", dur: 2.9 },
      { type: "emoji", emoji: "🌊", x: 33, y: 19, size: 20, anim: "blink", delay: 0.456, dur: 1.8 },
      { type: "emoji", emoji: "🌸", x: 30, y: 52, size: 22, anim: "wiggle", delay: 1.259, dur: 1.33 },
      { type: "emoji", emoji: "🍂", x: 60, y: 20, size: 25, anim: "blink", delay: 1.039, dur: 1.59 },
      { type: "emoji", emoji: "💫", x: 77, y: 57, size: 14, anim: "blink", delay: 1.169, dur: 1.71 },
      { type: "emoji", emoji: "💫", x: 56, y: 60, size: 10, anim: "blink", delay: 1.489, dur: 1.04 }
    ],
  },
  crab_party_31_744: {
    v: 1,
    loop: 2.23,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#b39ddb", opacity: 0.41, anim: "bounce", dur: 1.32, r: 48.59 },
      { type: "emoji", emoji: "🦀", x: 50, y: 50, size: 36, anim: "bounce", dur: 1.27 },
      { type: "emoji", emoji: "🌹", x: 72, y: 41, size: 27, anim: "rise", delay: 0.638, dur: 1.43 },
      { type: "emoji", emoji: "🌊", x: 51, y: 54, size: 16, anim: "blink", delay: 0.478, dur: 1.24 },
      { type: "emoji", emoji: "🍂", x: 71, y: 85, size: 25, anim: "blink", delay: 0.112, dur: 2.15 },
      { type: "emoji", emoji: "🍃", x: 41, y: 59, size: 20, anim: "rise", delay: 1.39, dur: 1.97 },
      { type: "emoji", emoji: "🌸", x: 46, y: 74, size: 23, anim: "rise", delay: 0.908, dur: 2.2 },
      { type: "emoji", emoji: "✨", x: 58, y: 25, size: 12, anim: "blink", delay: 1.562, dur: 1.79 },
      { type: "emoji", emoji: "⭐", x: 19, y: 50, size: 18, anim: "blink", delay: 1.615, dur: 1.32 }
    ],
  },
  crab_beach_31_745: {
    v: 1,
    loop: 2.96,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 58, y: 48, size: 39, anim: "twinkle", dur: 2.45 },
      { type: "emoji", emoji: "🪖", x: 52, y: 15, size: 29, anim: "bounce", delay: 0.482, dur: 1.75 },
      { type: "emoji", emoji: "🍩", x: 70, y: 42, size: 24, anim: "blink", delay: 0.961, dur: 1.47 },
      { type: "emoji", emoji: "❤️", x: 43, y: 11, size: 18, anim: "float", delay: 0.052, dur: 1.74 },
      { type: "emoji", emoji: "💖", x: 23, y: 74, size: 16, anim: "blink", delay: 0.553, dur: 1.53 },
      { type: "emoji", emoji: "🎈", x: 26, y: 19, size: 24, anim: "wiggle", delay: 0.956, dur: 2.27 },
      { type: "emoji", emoji: "🌟", x: 50, y: 15, size: 17, anim: "blink", delay: 1.678, dur: 1.89 },
      { type: "emoji", emoji: "💖", x: 56, y: 34, size: 15, anim: "blink", delay: 1.781, dur: 1.19 }
    ],
  },
  crab_winter_31_746: {
    v: 1,
    loop: 3.39,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#d81b60", opacity: 0.31, anim: "float", dur: 3.2, r: 42.09 },
      { type: "emoji", emoji: "🦀", x: 38, y: 53, size: 42, anim: "float", dur: 2.87 },
      { type: "emoji", emoji: "🍀", x: 74, y: 45, size: 25, anim: "blink", delay: 0.601, dur: 1.9 },
      { type: "emoji", emoji: "💖", x: 62, y: 85, size: 20, anim: "pop", delay: 0.083, dur: 1.27 },
      { type: "emoji", emoji: "🔥", x: 47, y: 18, size: 19, anim: "wiggle", delay: 0.654, dur: 2.07 },
      { type: "emoji", emoji: "💫", x: 38, y: 83, size: 24, anim: "blink", delay: 0.081, dur: 1.73 },
      { type: "emoji", emoji: "✨", x: 58, y: 33, size: 25, anim: "rise", delay: 1, dur: 1.71 },
      { type: "emoji", emoji: "✨", x: 12, y: 11, size: 25, anim: "blink", delay: 0.552, dur: 1.62 },
      { type: "emoji", emoji: "✨", x: 26, y: 53, size: 10, anim: "blink", delay: 1.285, dur: 1.39 },
      { type: "emoji", emoji: "💫", x: 61, y: 38, size: 14, anim: "blink", delay: 1.205, dur: 1.1 }
    ],
  },
  crab_spring_31_747: {
    v: 1,
    loop: 2.39,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 50, y: 48, size: 39, anim: "pop", dur: 1.73 },
      { type: "emoji", emoji: "🤠", x: 50, y: 12, size: 32, anim: "bounce", delay: 0.699, dur: 1.79 },
      { type: "emoji", emoji: "🌹", x: 67, y: 43, size: 27, anim: "rise", delay: 0.463, dur: 1.55 },
      { type: "emoji", emoji: "🎉", x: 63, y: 41, size: 23, anim: "pop", delay: 1.236, dur: 1.45 },
      { type: "emoji", emoji: "💖", x: 79, y: 73, size: 13, anim: "blink", delay: 0.174, dur: 2.38 },
      { type: "emoji", emoji: "🎉", x: 20, y: 24, size: 21, anim: "pop", delay: 0.627, dur: 1.8 },
      { type: "emoji", emoji: "🎊", x: 83, y: 40, size: 20, anim: "float", delay: 1.226, dur: 1.35 },
      { type: "emoji", emoji: "⭐", x: 27, y: 35, size: 17, anim: "blink", delay: 1.791, dur: 1.05 },
      { type: "emoji", emoji: "💖", x: 31, y: 37, size: 16, anim: "blink", delay: 1.308, dur: 1.09 }
    ],
  },
  crab_halloween_31_748: {
    v: 1,
    loop: 2.76,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff9c4", opacity: 0.6, anim: "heartbeat", dur: 2.36, w: 107.13, h: 18.5 },
      { type: "emoji", emoji: "🦀", x: 67, y: 52, size: 40, anim: "heartbeat", dur: 2.55 },
      { type: "emoji", emoji: "🎭", x: 50, y: 28, size: 26, anim: "bounce", delay: 0.392, dur: 1.92 },
      { type: "emoji", emoji: "🍭", x: 67, y: 42, size: 24, anim: "float", delay: 0.76, dur: 1.86 },
      { type: "emoji", emoji: "🔥", x: 57, y: 77, size: 18, anim: "rise", delay: 0.959, dur: 1.91 },
      { type: "emoji", emoji: "🍃", x: 25, y: 32, size: 25, anim: "wiggle", delay: 0.693, dur: 2.16 },
      { type: "emoji", emoji: "🎉", x: 55, y: 60, size: 22, anim: "float", delay: 0.199, dur: 2.28 },
      { type: "emoji", emoji: "✨", x: 83, y: 71, size: 16, anim: "blink", delay: 1.686, dur: 1.75 },
      { type: "emoji", emoji: "⭐", x: 66, y: 36, size: 13, anim: "blink", delay: 0.578, dur: 1.95 }
    ],
  },
  crab_christmas_31_749: {
    v: 1,
    loop: 4.13,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#7986cb", opacity: 0.52, anim: "float", dur: 3.64, w: 108.86, h: 18.26 },
      { type: "emoji", emoji: "🦀", x: 44, y: 48, size: 42, anim: "float", dur: 3.59 },
      { type: "emoji", emoji: "🍩", x: 73, y: 45, size: 25, anim: "float", delay: 0.727, dur: 1.68 },
      { type: "emoji", emoji: "🌟", x: 67, y: 79, size: 17, anim: "pop", delay: 1.484, dur: 1.84 },
      { type: "emoji", emoji: "💫", x: 55, y: 19, size: 25, anim: "pop", delay: 0.108, dur: 1.91 },
      { type: "emoji", emoji: "💫", x: 68, y: 32, size: 21, anim: "blink", delay: 0.283, dur: 2.04 },
      { type: "emoji", emoji: "💖", x: 32, y: 15, size: 17, anim: "blink", delay: 1.94, dur: 1.81 },
      { type: "emoji", emoji: "💖", x: 74, y: 31, size: 12, anim: "blink", delay: 0.875, dur: 1.87 }
    ],
  },
  crab_coding_31_750: {
    v: 1,
    loop: 3.08,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f3e5f5", opacity: 0.48, anim: "float", dur: 2.78, r: 49.81 },
      { type: "emoji", emoji: "🦀", x: 41, y: 54, size: 33, anim: "float", dur: 2.85 },
      { type: "emoji", emoji: "🎊", x: 78, y: 19, size: 13, anim: "rise", delay: 0.082, dur: 2.08 },
      { type: "emoji", emoji: "💫", x: 74, y: 72, size: 24, anim: "wiggle", delay: 0.561, dur: 2.16 },
      { type: "emoji", emoji: "⭐", x: 19, y: 72, size: 16, anim: "blink", delay: 0.822, dur: 1.57 },
      { type: "emoji", emoji: "💖", x: 54, y: 21, size: 19, anim: "blink", delay: 0.68, dur: 1.14 }
    ],
  },
  crab_music_31_751: {
    v: 1,
    loop: 2.64,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#b3e5fc", opacity: 0.62, anim: "wave", dur: 1.57, w: 106.02, h: 18.15 },
      { type: "emoji", emoji: "🦀", x: 39, y: 51, size: 40, anim: "wave", dur: 1.81 },
      { type: "emoji", emoji: "👑", x: 48, y: 13, size: 32, anim: "bounce", delay: 0.688, dur: 1.63 },
      { type: "emoji", emoji: "💎", x: 72, y: 40, size: 25, anim: "pop", delay: 0.954, dur: 1.76 },
      { type: "emoji", emoji: "🌸", x: 82, y: 12, size: 14, anim: "float", delay: 1.403, dur: 1.69 },
      { type: "emoji", emoji: "🎊", x: 89, y: 50, size: 13, anim: "wiggle", delay: 0.728, dur: 1.23 },
      { type: "emoji", emoji: "🌸", x: 38, y: 15, size: 15, anim: "float", delay: 0.81, dur: 2.05 },
      { type: "emoji", emoji: "💫", x: 52, y: 70, size: 18, anim: "pop", delay: 0.151, dur: 1.32 },
      { type: "emoji", emoji: "🌟", x: 37, y: 57, size: 13, anim: "blink", delay: 0.816, dur: 1.66 },
      { type: "emoji", emoji: "✨", x: 79, y: 53, size: 10, anim: "blink", delay: 0.634, dur: 1.48 }
    ],
  },
  crab_sports_31_752: {
    v: 1,
    loop: 2.17,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fff3e0", opacity: 0.43, anim: "bounce", dur: 1.7, r: 47.81 },
      { type: "emoji", emoji: "🦀", x: 31, y: 51, size: 39, anim: "bounce", dur: 1.61 },
      { type: "emoji", emoji: "🧢", x: 50, y: 16, size: 30, anim: "bounce", delay: 0.627, dur: 1.98 },
      { type: "emoji", emoji: "💖", x: 64, y: 47, size: 25, anim: "wiggle", delay: 0.492, dur: 2.35 },
      { type: "emoji", emoji: "🌟", x: 66, y: 38, size: 18, anim: "float", delay: 1.039, dur: 2.37 },
      { type: "emoji", emoji: "🌸", x: 82, y: 29, size: 20, anim: "wiggle", delay: 1.393, dur: 1.36 },
      { type: "emoji", emoji: "💫", x: 63, y: 62, size: 12, anim: "blink", delay: 1.712, dur: 1.52 },
      { type: "emoji", emoji: "🌟", x: 35, y: 57, size: 10, anim: "blink", delay: 0.518, dur: 1.33 }
    ],
  },
  crab_food_31_753: {
    v: 1,
    loop: 2.01,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 48, y: 47, size: 32, anim: "wiggle", dur: 1.41 },
      { type: "emoji", emoji: "🎩", x: 51, y: 11, size: 30, anim: "bounce", delay: 0.407, dur: 1.65 },
      { type: "emoji", emoji: "🍰", x: 66, y: 42, size: 27, anim: "pop", delay: 0.597, dur: 1.45 },
      { type: "emoji", emoji: "❤️", x: 80, y: 79, size: 15, anim: "wiggle", delay: 0.366, dur: 2.18 },
      { type: "emoji", emoji: "🎉", x: 23, y: 39, size: 16, anim: "wiggle", delay: 0.451, dur: 1.56 },
      { type: "emoji", emoji: "🎈", x: 60, y: 31, size: 13, anim: "pop", delay: 1.1, dur: 1.33 },
      { type: "emoji", emoji: "🎈", x: 10, y: 26, size: 21, anim: "pop", delay: 0.82, dur: 1.24 },
      { type: "emoji", emoji: "💖", x: 39, y: 18, size: 16, anim: "blink", delay: 0.72, dur: 1.76 },
      { type: "emoji", emoji: "💖", x: 26, y: 79, size: 19, anim: "blink", delay: 1.713, dur: 1.5 }
    ],
  },
  crab_space_31_754: {
    v: 1,
    loop: 4.03,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 64, y: 56, size: 42, anim: "breathe", dur: 3.41 },
      { type: "emoji", emoji: "🍄", x: 68, y: 44, size: 24, anim: "rise", delay: 0.866, dur: 1.9 },
      { type: "emoji", emoji: "🎊", x: 51, y: 11, size: 21, anim: "blink", delay: 0.15, dur: 1.93 },
      { type: "emoji", emoji: "💫", x: 21, y: 81, size: 12, anim: "blink", delay: 1.216, dur: 1.89 },
      { type: "emoji", emoji: "💫", x: 68, y: 77, size: 11, anim: "blink", delay: 1.234, dur: 1.22 }
    ],
  },
  crab_fantasy_31_755: {
    v: 1,
    loop: 2.6,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ff7043", opacity: 0.46, anim: "pulse", dur: 2.14, w: 105.73, h: 19.1 },
      { type: "emoji", emoji: "🦀", x: 64, y: 52, size: 38, anim: "pulse", dur: 1.99 },
      { type: "emoji", emoji: "🍪", x: 75, y: 45, size: 24, anim: "float", delay: 0.48, dur: 1.79 },
      { type: "emoji", emoji: "✨", x: 44, y: 82, size: 19, anim: "wiggle", delay: 1.089, dur: 2.33 },
      { type: "emoji", emoji: "💫", x: 42, y: 22, size: 13, anim: "blink", delay: 0.801, dur: 1.69 },
      { type: "emoji", emoji: "💫", x: 51, y: 63, size: 11, anim: "blink", delay: 0.544, dur: 1.73 }
    ],
  },
  crab_office_31_756: {
    v: 1,
    loop: 2.35,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e91e63", opacity: 0.4, anim: "pulse", dur: 2.34, r: 43.47 },
      { type: "emoji", emoji: "🦀", x: 46, y: 54, size: 36, anim: "pulse", dur: 2.32 },
      { type: "emoji", emoji: "🍭", x: 71, y: 39, size: 24, anim: "rise", delay: 0.745, dur: 1.74 },
      { type: "emoji", emoji: "🌊", x: 30, y: 88, size: 15, anim: "blink", delay: 0.542, dur: 1.44 },
      { type: "emoji", emoji: "⭐", x: 88, y: 44, size: 14, anim: "pop", delay: 1.012, dur: 2.29 },
      { type: "emoji", emoji: "💫", x: 60, y: 16, size: 19, anim: "blink", delay: 0.836, dur: 1.7 },
      { type: "emoji", emoji: "🌟", x: 74, y: 23, size: 16, anim: "blink", delay: 1.471, dur: 1.2 }
    ],
  },
  crab_fitness_31_757: {
    v: 1,
    loop: 3.12,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ba68c8", opacity: 0.35, anim: "float", dur: 2.95, r: 43.23 },
      { type: "emoji", emoji: "🦀", x: 35, y: 55, size: 40, anim: "float", dur: 2.83 },
      { type: "emoji", emoji: "🧣", x: 50, y: 58, size: 25, anim: "bounce", delay: 0.419, dur: 1.81 },
      { type: "emoji", emoji: "🍀", x: 73, y: 45, size: 24, anim: "pop", delay: 0.975, dur: 1.49 },
      { type: "emoji", emoji: "🔥", x: 13, y: 34, size: 25, anim: "wiggle", delay: 1.451, dur: 2.06 },
      { type: "emoji", emoji: "❤️", x: 35, y: 21, size: 14, anim: "float", delay: 0.283, dur: 1.55 },
      { type: "emoji", emoji: "⭐", x: 43, y: 17, size: 16, anim: "blink", delay: 0.998, dur: 1.59 },
      { type: "emoji", emoji: "💖", x: 51, y: 82, size: 16, anim: "blink", delay: 1.631, dur: 1.36 }
    ],
  },
  crab_travel_31_758: {
    v: 1,
    loop: 3.7,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff59d", opacity: 0.46, anim: "settle", dur: 2.94, w: 103.93, h: 21.41 },
      { type: "emoji", emoji: "🦀", x: 67, y: 46, size: 33, anim: "settle", dur: 3.14 },
      { type: "emoji", emoji: "👒", x: 50, y: 16, size: 32, anim: "bounce", delay: 0.474, dur: 1.71 },
      { type: "emoji", emoji: "🍭", x: 72, y: 40, size: 25, anim: "blink", delay: 0.86, dur: 1.97 },
      { type: "emoji", emoji: "⭐", x: 85, y: 84, size: 17, anim: "blink", delay: 1.349, dur: 1.7 },
      { type: "emoji", emoji: "🎈", x: 73, y: 22, size: 16, anim: "pop", delay: 0.812, dur: 1.69 },
      { type: "emoji", emoji: "🎈", x: 30, y: 69, size: 25, anim: "rise", delay: 1.181, dur: 2.21 },
      { type: "emoji", emoji: "🎊", x: 46, y: 80, size: 25, anim: "pop", delay: 1.189, dur: 1.84 },
      { type: "emoji", emoji: "💫", x: 39, y: 69, size: 18, anim: "blink", delay: 1.975, dur: 1.95 },
      { type: "emoji", emoji: "⭐", x: 75, y: 25, size: 15, anim: "blink", delay: 0.605, dur: 1.47 }
    ],
  },
  crab_art_31_759: {
    v: 1,
    loop: 1.97,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#c5cae9", opacity: 0.45, anim: "bounce", dur: 1.52, r: 46.8 },
      { type: "emoji", emoji: "🦀", x: 51, y: 46, size: 34, anim: "bounce", dur: 1.44 },
      { type: "emoji", emoji: "🧣", x: 48, y: 56, size: 24, anim: "bounce", delay: 0.601, dur: 1.51 },
      { type: "emoji", emoji: "🍪", x: 74, y: 42, size: 25, anim: "float", delay: 0.946, dur: 1.44 },
      { type: "emoji", emoji: "🌟", x: 47, y: 14, size: 15, anim: "wiggle", delay: 1.317, dur: 1.35 },
      { type: "emoji", emoji: "🎉", x: 76, y: 59, size: 18, anim: "rise", delay: 0.733, dur: 2.14 },
      { type: "emoji", emoji: "🍂", x: 59, y: 87, size: 17, anim: "pop", delay: 0.857, dur: 2.3 },
      { type: "emoji", emoji: "🍂", x: 49, y: 75, size: 16, anim: "wiggle", delay: 0.227, dur: 1.37 },
      { type: "emoji", emoji: "✨", x: 29, y: 78, size: 17, anim: "blink", delay: 1.214, dur: 1.5 },
      { type: "emoji", emoji: "💫", x: 25, y: 78, size: 19, anim: "blink", delay: 1.297, dur: 1.65 }
    ],
  },
  crab_science_31_760: {
    v: 1,
    loop: 2.98,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 60, y: 52, size: 42, anim: "twinkle", dur: 2.39 },
      { type: "emoji", emoji: "👒", x: 50, y: 13, size: 34, anim: "bounce", delay: 0.64, dur: 2 },
      { type: "emoji", emoji: "🍫", x: 71, y: 44, size: 25, anim: "rise", delay: 0.436, dur: 1.81 },
      { type: "emoji", emoji: "🎈", x: 42, y: 86, size: 22, anim: "float", delay: 0.191, dur: 1.98 },
      { type: "emoji", emoji: "✨", x: 30, y: 73, size: 24, anim: "blink", delay: 0.016, dur: 1.23 },
      { type: "emoji", emoji: "🌿", x: 14, y: 36, size: 18, anim: "pop", delay: 0.5, dur: 1.92 },
      { type: "emoji", emoji: "❤️", x: 77, y: 34, size: 13, anim: "blink", delay: 1.188, dur: 1.63 },
      { type: "emoji", emoji: "🌸", x: 15, y: 46, size: 18, anim: "rise", delay: 1.403, dur: 2.14 },
      { type: "emoji", emoji: "💖", x: 61, y: 36, size: 12, anim: "blink", delay: 1.61, dur: 1.37 },
      { type: "emoji", emoji: "💫", x: 39, y: 77, size: 13, anim: "blink", delay: 0.6, dur: 1.91 }
    ],
  },
  crab_pets_31_761: {
    v: 1,
    loop: 3.19,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 67, y: 48, size: 41, anim: "float", dur: 3.08 },
      { type: "emoji", emoji: "🍄", x: 72, y: 44, size: 26, anim: "pop", delay: 0.677, dur: 1.62 },
      { type: "emoji", emoji: "🌊", x: 65, y: 10, size: 18, anim: "pop", delay: 0.079, dur: 1.85 },
      { type: "emoji", emoji: "🔥", x: 68, y: 59, size: 24, anim: "wiggle", delay: 0.37, dur: 1.59 },
      { type: "emoji", emoji: "💖", x: 12, y: 79, size: 16, anim: "blink", delay: 1.3, dur: 1.41 },
      { type: "emoji", emoji: "🌸", x: 67, y: 62, size: 22, anim: "float", delay: 0.275, dur: 1.51 },
      { type: "emoji", emoji: "💖", x: 17, y: 47, size: 22, anim: "float", delay: 0.558, dur: 2.39 },
      { type: "emoji", emoji: "💫", x: 22, y: 29, size: 12, anim: "blink", delay: 1.789, dur: 1.42 },
      { type: "emoji", emoji: "💫", x: 80, y: 81, size: 19, anim: "blink", delay: 0.564, dur: 1.05 }
    ],
  },
  crab_magic_31_762: {
    v: 1,
    loop: 2.15,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffcc80", opacity: 0.65, anim: "pop", dur: 1.39, w: 98.14, h: 22.37 },
      { type: "emoji", emoji: "🦀", x: 35, y: 52, size: 44, anim: "pop", dur: 1.5 },
      { type: "emoji", emoji: "💖", x: 15, y: 22, size: 25, anim: "wiggle", delay: 0.001, dur: 2.1 },
      { type: "emoji", emoji: "🌟", x: 64, y: 15, size: 20, anim: "blink", delay: 0.846, dur: 2.3 },
      { type: "emoji", emoji: "💫", x: 27, y: 44, size: 19, anim: "blink", delay: 1.632, dur: 1.15 },
      { type: "emoji", emoji: "💫", x: 43, y: 50, size: 14, anim: "blink", delay: 0.922, dur: 1.57 }
    ],
  },
  crab_retro_31_763: {
    v: 1,
    loop: 2.92,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 58, y: 55, size: 39, anim: "heartbeat", dur: 2.62 },
      { type: "emoji", emoji: "🎭", x: 49, y: 29, size: 28, anim: "bounce", delay: 0.502, dur: 1.75 },
      { type: "emoji", emoji: "✨", x: 87, y: 80, size: 19, anim: "float", delay: 0.31, dur: 1.38 },
      { type: "emoji", emoji: "🌿", x: 22, y: 39, size: 14, anim: "blink", delay: 1.283, dur: 2.01 },
      { type: "emoji", emoji: "🌟", x: 85, y: 44, size: 23, anim: "pop", delay: 0.466, dur: 2.07 },
      { type: "emoji", emoji: "💫", x: 55, y: 34, size: 14, anim: "blink", delay: 1.05, dur: 1.65 },
      { type: "emoji", emoji: "⭐", x: 51, y: 45, size: 13, anim: "blink", delay: 1.931, dur: 1.63 }
    ],
  },
  crab_cyber_31_764: {
    v: 1,
    loop: 3.78,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#b39ddb", opacity: 0.66, anim: "float", dur: 3.49, w: 101.68, h: 24.83 },
      { type: "emoji", emoji: "🦀", x: 39, y: 51, size: 33, anim: "float", dur: 3.47 },
      { type: "emoji", emoji: "💖", x: 44, y: 45, size: 15, anim: "wiggle", delay: 1.351, dur: 1.99 },
      { type: "emoji", emoji: "🌿", x: 43, y: 44, size: 22, anim: "wiggle", delay: 0.054, dur: 1.53 },
      { type: "emoji", emoji: "🍂", x: 89, y: 13, size: 23, anim: "pop", delay: 0.706, dur: 2.19 },
      { type: "emoji", emoji: "❄️", x: 87, y: 54, size: 15, anim: "pop", delay: 0.051, dur: 1.8 },
      { type: "emoji", emoji: "💫", x: 39, y: 67, size: 12, anim: "blink", delay: 1.69, dur: 1.68 },
      { type: "emoji", emoji: "⭐", x: 48, y: 49, size: 11, anim: "blink", delay: 0.843, dur: 1.86 }
    ],
  },
  crab_nature_31_765: {
    v: 1,
    loop: 3.17,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 57, y: 48, size: 38, anim: "float", dur: 2.98 },
      { type: "emoji", emoji: "🌹", x: 69, y: 44, size: 27, anim: "float", delay: 0.435, dur: 1.76 },
      { type: "emoji", emoji: "🎊", x: 89, y: 34, size: 16, anim: "float", delay: 1.437, dur: 1.68 },
      { type: "emoji", emoji: "🎈", x: 14, y: 18, size: 23, anim: "wiggle", delay: 0.165, dur: 2.4 },
      { type: "emoji", emoji: "💖", x: 54, y: 64, size: 19, anim: "blink", delay: 1.887, dur: 1.61 },
      { type: "emoji", emoji: "⭐", x: 18, y: 16, size: 13, anim: "blink", delay: 0.564, dur: 1.36 }
    ],
  },
  crab_underwater_31_766: {
    v: 1,
    loop: 2.35,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 66, y: 55, size: 36, anim: "wave", dur: 1.74 },
      { type: "emoji", emoji: "🍭", x: 68, y: 38, size: 24, anim: "blink", delay: 0.564, dur: 1.71 },
      { type: "emoji", emoji: "💫", x: 36, y: 75, size: 21, anim: "pop", delay: 0.425, dur: 1.34 },
      { type: "emoji", emoji: "💫", x: 23, y: 57, size: 17, anim: "pop", delay: 0.511, dur: 1.38 },
      { type: "emoji", emoji: "💖", x: 57, y: 25, size: 18, anim: "blink", delay: 0.836, dur: 1.19 },
      { type: "emoji", emoji: "🌟", x: 71, y: 68, size: 15, anim: "blink", delay: 0.694, dur: 1.84 }
    ],
  },
  crab_sky_31_767: {
    v: 1,
    loop: 1.92,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 57, y: 53, size: 33, anim: "bounce", dur: 1.65 },
      { type: "emoji", emoji: "🍰", x: 70, y: 41, size: 27, anim: "pop", delay: 0.666, dur: 1.45 },
      { type: "emoji", emoji: "🎈", x: 24, y: 45, size: 14, anim: "blink", delay: 0.357, dur: 1.65 },
      { type: "emoji", emoji: "🌟", x: 60, y: 33, size: 25, anim: "wiggle", delay: 1.23, dur: 1.24 },
      { type: "emoji", emoji: "💖", x: 82, y: 77, size: 14, anim: "blink", delay: 0.726, dur: 1.99 },
      { type: "emoji", emoji: "💫", x: 15, y: 72, size: 14, anim: "blink", delay: 0.584, dur: 1.8 },
      { type: "emoji", emoji: "💫", x: 56, y: 26, size: 16, anim: "blink", delay: 1.838, dur: 1.02 }
    ],
  },
  crab_party_32_768: {
    v: 1,
    loop: 2.27,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fdd835", opacity: 0.3, anim: "wiggle", dur: 1.18, r: 45.05 },
      { type: "emoji", emoji: "🦀", x: 45, y: 46, size: 42, anim: "wiggle", dur: 1.27 },
      { type: "emoji", emoji: "💝", x: 71, y: 43, size: 27, anim: "blink", delay: 0.988, dur: 1.91 },
      { type: "emoji", emoji: "🍂", x: 84, y: 44, size: 15, anim: "wiggle", delay: 0.532, dur: 1.27 },
      { type: "emoji", emoji: "✨", x: 16, y: 25, size: 10, anim: "blink", delay: 1.062, dur: 1.1 },
      { type: "emoji", emoji: "💖", x: 24, y: 40, size: 12, anim: "blink", delay: 0.53, dur: 1.88 }
    ],
  },
  crab_beach_32_769: {
    v: 1,
    loop: 3.95,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 39, y: 46, size: 43, anim: "breathe", dur: 3.59 },
      { type: "emoji", emoji: "🎓", x: 50, y: 15, size: 29, anim: "bounce", delay: 0.67, dur: 1.72 },
      { type: "emoji", emoji: "🍫", x: 69, y: 46, size: 25, anim: "blink", delay: 0.885, dur: 1.58 },
      { type: "emoji", emoji: "🌸", x: 80, y: 22, size: 20, anim: "rise", delay: 0.965, dur: 1.4 },
      { type: "emoji", emoji: "💫", x: 58, y: 85, size: 24, anim: "blink", delay: 1.023, dur: 2 },
      { type: "emoji", emoji: "✨", x: 25, y: 15, size: 17, anim: "blink", delay: 0.535, dur: 1.63 },
      { type: "emoji", emoji: "💫", x: 84, y: 39, size: 11, anim: "blink", delay: 0.737, dur: 1.31 }
    ],
  },
  crab_winter_32_770: {
    v: 1,
    loop: 2.6,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f3e5f5", opacity: 0.52, anim: "pulse", dur: 1.79, w: 93.65, h: 18.51 },
      { type: "emoji", emoji: "🦀", x: 54, y: 50, size: 35, anim: "pulse", dur: 1.98 },
      { type: "emoji", emoji: "❄️", x: 74, y: 11, size: 25, anim: "wiggle", delay: 0.477, dur: 2.07 },
      { type: "emoji", emoji: "💫", x: 16, y: 52, size: 24, anim: "rise", delay: 0.696, dur: 1.71 },
      { type: "emoji", emoji: "💫", x: 70, y: 48, size: 12, anim: "blink", delay: 0.085, dur: 1.6 },
      { type: "emoji", emoji: "✨", x: 33, y: 26, size: 17, anim: "blink", delay: 1.161, dur: 1.76 },
      { type: "emoji", emoji: "🌟", x: 29, y: 60, size: 13, anim: "blink", delay: 1.316, dur: 1.89 }
    ],
  },
  crab_spring_32_771: {
    v: 1,
    loop: 2.71,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 48, y: 48, size: 34, anim: "pulse", dur: 2.18 },
      { type: "emoji", emoji: "🍩", x: 68, y: 42, size: 24, anim: "rise", delay: 0.998, dur: 1.42 },
      { type: "emoji", emoji: "🔥", x: 86, y: 45, size: 14, anim: "blink", delay: 1.292, dur: 2.33 },
      { type: "emoji", emoji: "🌟", x: 43, y: 44, size: 15, anim: "wiggle", delay: 1.256, dur: 1.38 },
      { type: "emoji", emoji: "🍂", x: 38, y: 14, size: 21, anim: "blink", delay: 0.775, dur: 1.53 },
      { type: "emoji", emoji: "💫", x: 68, y: 89, size: 21, anim: "float", delay: 0.295, dur: 1.39 },
      { type: "emoji", emoji: "🎊", x: 41, y: 54, size: 14, anim: "wiggle", delay: 0.12, dur: 1.52 },
      { type: "emoji", emoji: "✨", x: 71, y: 58, size: 19, anim: "blink", delay: 0.745, dur: 1.48 },
      { type: "emoji", emoji: "✨", x: 27, y: 82, size: 18, anim: "blink", delay: 1.743, dur: 1.12 }
    ],
  },
  crab_halloween_32_772: {
    v: 1,
    loop: 2.95,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 58, y: 49, size: 34, anim: "float", dur: 2.75 },
      { type: "emoji", emoji: "🕶️", x: 50, y: 28, size: 28, anim: "bounce", delay: 0.699, dur: 1.51 },
      { type: "emoji", emoji: "💎", x: 69, y: 38, size: 22, anim: "float", delay: 0.705, dur: 1.8 },
      { type: "emoji", emoji: "🌊", x: 75, y: 63, size: 13, anim: "float", delay: 0.037, dur: 1.86 },
      { type: "emoji", emoji: "🍃", x: 32, y: 69, size: 14, anim: "rise", delay: 0.317, dur: 1.41 },
      { type: "emoji", emoji: "🌊", x: 77, y: 17, size: 12, anim: "pop", delay: 0.856, dur: 2.21 },
      { type: "emoji", emoji: "✨", x: 55, y: 39, size: 18, anim: "blink", delay: 1.822, dur: 1.92 },
      { type: "emoji", emoji: "⭐", x: 58, y: 18, size: 12, anim: "blink", delay: 1.663, dur: 1.66 }
    ],
  },
  crab_christmas_32_773: {
    v: 1,
    loop: 3.4,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#a5d6a7", opacity: 0.33, anim: "settle", dur: 3.16, w: 107.24, h: 20.54 },
      { type: "emoji", emoji: "🦀", x: 64, y: 46, size: 33, anim: "settle", dur: 3.14 },
      { type: "emoji", emoji: "🍳", x: 48, y: 16, size: 28, anim: "bounce", delay: 0.47, dur: 1.71 },
      { type: "emoji", emoji: "🍀", x: 72, y: 45, size: 23, anim: "rise", delay: 0.841, dur: 2 },
      { type: "emoji", emoji: "✨", x: 67, y: 55, size: 15, anim: "blink", delay: 0.522, dur: 2.16 },
      { type: "emoji", emoji: "✨", x: 38, y: 79, size: 21, anim: "blink", delay: 0.532, dur: 1.94 },
      { type: "emoji", emoji: "✨", x: 55, y: 38, size: 19, anim: "rise", delay: 0.242, dur: 1.29 },
      { type: "emoji", emoji: "🍂", x: 58, y: 10, size: 12, anim: "wiggle", delay: 1.244, dur: 2.02 },
      { type: "emoji", emoji: "🍃", x: 82, y: 20, size: 23, anim: "pop", delay: 0.862, dur: 2.39 },
      { type: "emoji", emoji: "💖", x: 48, y: 62, size: 15, anim: "blink", delay: 1.657, dur: 1.58 },
      { type: "emoji", emoji: "💫", x: 75, y: 61, size: 19, anim: "blink", delay: 1.068, dur: 1.44 }
    ],
  },
  crab_coding_32_774: {
    v: 1,
    loop: 1.97,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#d1c4e9", opacity: 0.6, anim: "bounce", dur: 1.5, r: 40.11 },
      { type: "emoji", emoji: "🦀", x: 41, y: 46, size: 33, anim: "bounce", dur: 1.34 },
      { type: "emoji", emoji: "🎓", x: 50, y: 15, size: 27, anim: "bounce", delay: 0.575, dur: 1.87 },
      { type: "emoji", emoji: "🌹", x: 72, y: 44, size: 27, anim: "float", delay: 0.818, dur: 1.76 },
      { type: "emoji", emoji: "🔥", x: 14, y: 52, size: 15, anim: "rise", delay: 0.14, dur: 1.98 },
      { type: "emoji", emoji: "🎈", x: 86, y: 43, size: 16, anim: "float", delay: 0.117, dur: 2.18 },
      { type: "emoji", emoji: "❤️", x: 80, y: 12, size: 24, anim: "rise", delay: 0.494, dur: 2.1 },
      { type: "emoji", emoji: "💫", x: 70, y: 30, size: 17, anim: "blink", delay: 0.973, dur: 1.58 },
      { type: "emoji", emoji: "✨", x: 75, y: 19, size: 12, anim: "blink", delay: 0.762, dur: 1.04 }
    ],
  },
  crab_music_32_775: {
    v: 1,
    loop: 2.77,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f4511e", opacity: 0.32, anim: "twinkle", dur: 2.55, w: 90.93, h: 27.81 },
      { type: "emoji", emoji: "🦀", x: 31, y: 46, size: 41, anim: "twinkle", dur: 2.57 },
      { type: "emoji", emoji: "🍩", x: 68, y: 43, size: 27, anim: "float", delay: 0.684, dur: 1.58 },
      { type: "emoji", emoji: "🍃", x: 55, y: 45, size: 21, anim: "wiggle", delay: 0.613, dur: 1.88 },
      { type: "emoji", emoji: "🌊", x: 82, y: 45, size: 18, anim: "blink", delay: 0.63, dur: 1.44 },
      { type: "emoji", emoji: "🎈", x: 81, y: 20, size: 20, anim: "rise", delay: 0.119, dur: 1.41 },
      { type: "emoji", emoji: "⭐", x: 16, y: 33, size: 18, anim: "blink", delay: 0.59, dur: 1.19 },
      { type: "emoji", emoji: "💖", x: 73, y: 23, size: 18, anim: "blink", delay: 1.033, dur: 1.41 }
    ],
  },
  crab_sports_32_776: {
    v: 1,
    loop: 3.32,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#e91e63", opacity: 0.32, anim: "float", dur: 2.88, w: 99.56, h: 27.36 },
      { type: "emoji", emoji: "🦀", x: 50, y: 48, size: 38, anim: "float", dur: 3.07 },
      { type: "emoji", emoji: "🎁", x: 71, y: 43, size: 24, anim: "float", delay: 0.938, dur: 1.44 },
      { type: "emoji", emoji: "🍃", x: 70, y: 87, size: 12, anim: "pop", delay: 0.094, dur: 2.3 },
      { type: "emoji", emoji: "🌸", x: 13, y: 55, size: 14, anim: "float", delay: 0.387, dur: 2.13 },
      { type: "emoji", emoji: "✨", x: 50, y: 21, size: 13, anim: "blink", delay: 0.83, dur: 1.38 },
      { type: "emoji", emoji: "✨", x: 42, y: 31, size: 13, anim: "blink", delay: 1.568, dur: 1.13 }
    ],
  },
  crab_food_32_777: {
    v: 1,
    loop: 2.11,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e1bee7", opacity: 0.53, anim: "pop", dur: 1.61, r: 43.16 },
      { type: "emoji", emoji: "🦀", x: 43, y: 47, size: 33, anim: "pop", dur: 1.59 },
      { type: "emoji", emoji: "🎩", x: 48, y: 10, size: 31, anim: "bounce", delay: 0.429, dur: 1.74 },
      { type: "emoji", emoji: "🍫", x: 69, y: 46, size: 26, anim: "pop", delay: 0.487, dur: 1.5 },
      { type: "emoji", emoji: "💫", x: 83, y: 62, size: 22, anim: "wiggle", delay: 0.576, dur: 1.8 },
      { type: "emoji", emoji: "✨", x: 37, y: 45, size: 18, anim: "rise", delay: 0.029, dur: 2.27 },
      { type: "emoji", emoji: "💫", x: 77, y: 24, size: 18, anim: "blink", delay: 0.968, dur: 1.68 },
      { type: "emoji", emoji: "✨", x: 54, y: 15, size: 13, anim: "blink", delay: 1.625, dur: 1.38 }
    ],
  },
  crab_space_32_778: {
    v: 1,
    loop: 2.9,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fff176", opacity: 0.53, anim: "heartbeat", dur: 2.67, r: 43.75 },
      { type: "emoji", emoji: "🦀", x: 37, y: 52, size: 33, anim: "heartbeat", dur: 2.63 },
      { type: "emoji", emoji: "💌", x: 70, y: 44, size: 25, anim: "rise", delay: 0.459, dur: 1.89 },
      { type: "emoji", emoji: "🌟", x: 43, y: 50, size: 24, anim: "blink", delay: 1.468, dur: 2.26 },
      { type: "emoji", emoji: "🎊", x: 49, y: 39, size: 25, anim: "float", delay: 0.949, dur: 1.94 },
      { type: "emoji", emoji: "💖", x: 48, y: 78, size: 12, anim: "blink", delay: 1.728, dur: 1.1 },
      { type: "emoji", emoji: "🌟", x: 67, y: 24, size: 17, anim: "blink", delay: 0.817, dur: 1.13 }
    ],
  },
  crab_fantasy_32_779: {
    v: 1,
    loop: 4.14,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#303f9f", opacity: 0.54, anim: "float", dur: 3.32, w: 104.67, h: 23.82 },
      { type: "emoji", emoji: "🦀", x: 64, y: 48, size: 32, anim: "float", dur: 3.39 },
      { type: "emoji", emoji: "🕶️", x: 51, y: 29, size: 30, anim: "bounce", delay: 0.662, dur: 1.92 },
      { type: "emoji", emoji: "🎊", x: 49, y: 59, size: 15, anim: "rise", delay: 0.729, dur: 1.52 },
      { type: "emoji", emoji: "⭐", x: 16, y: 68, size: 17, anim: "blink", delay: 1.193, dur: 1.62 },
      { type: "emoji", emoji: "💫", x: 39, y: 71, size: 16, anim: "blink", delay: 0.547, dur: 1.25 }
    ],
  },
  crab_office_32_780: {
    v: 1,
    loop: 2.8,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#f3e5f5", opacity: 0.7, anim: "float", dur: 2.83, w: 107.38, h: 22.41 },
      { type: "emoji", emoji: "🦀", x: 56, y: 52, size: 38, anim: "float", dur: 3.03 },
      { type: "emoji", emoji: "🕶️", x: 51, y: 26, size: 31, anim: "bounce", delay: 0.497, dur: 1.58 },
      { type: "emoji", emoji: "🍩", x: 70, y: 44, size: 26, anim: "rise", delay: 0.462, dur: 1.6 },
      { type: "emoji", emoji: "✨", x: 76, y: 16, size: 19, anim: "wiggle", delay: 0.545, dur: 2.04 },
      { type: "emoji", emoji: "❄️", x: 63, y: 74, size: 24, anim: "float", delay: 1.308, dur: 2.16 },
      { type: "emoji", emoji: "❄️", x: 24, y: 52, size: 24, anim: "rise", delay: 0.424, dur: 1.56 },
      { type: "emoji", emoji: "💫", x: 57, y: 83, size: 18, anim: "blink", delay: 1.794, dur: 1.97 },
      { type: "emoji", emoji: "✨", x: 20, y: 74, size: 17, anim: "blink", delay: 1.968, dur: 1.9 }
    ],
  },
  crab_fitness_32_781: {
    v: 1,
    loop: 2.27,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#039be5", opacity: 0.34, anim: "wave", dur: 2, w: 93.15, h: 19.74 },
      { type: "emoji", emoji: "🦀", x: 32, y: 51, size: 41, anim: "wave", dur: 1.81 },
      { type: "emoji", emoji: "👒", x: 50, y: 13, size: 35, anim: "bounce", delay: 0.418, dur: 1.64 },
      { type: "emoji", emoji: "💝", x: 69, y: 38, size: 24, anim: "blink", delay: 0.405, dur: 1.83 },
      { type: "emoji", emoji: "🎊", x: 66, y: 86, size: 13, anim: "pop", delay: 0.707, dur: 1.77 },
      { type: "emoji", emoji: "💖", x: 16, y: 38, size: 17, anim: "blink", delay: 1.446, dur: 1.3 },
      { type: "emoji", emoji: "🎊", x: 26, y: 43, size: 20, anim: "rise", delay: 1.214, dur: 1.31 },
      { type: "emoji", emoji: "🌸", x: 71, y: 79, size: 14, anim: "pop", delay: 1.01, dur: 2.33 },
      { type: "emoji", emoji: "❤️", x: 42, y: 17, size: 23, anim: "pop", delay: 1.338, dur: 2.12 },
      { type: "emoji", emoji: "⭐", x: 48, y: 49, size: 12, anim: "blink", delay: 1.383, dur: 1.38 },
      { type: "emoji", emoji: "💖", x: 40, y: 30, size: 17, anim: "blink", delay: 0.523, dur: 1.97 }
    ],
  },
  crab_travel_32_782: {
    v: 1,
    loop: 2.16,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffe0b2", opacity: 0.58, anim: "bounce", dur: 1.43, w: 108.78, h: 25.47 },
      { type: "emoji", emoji: "🦀", x: 65, y: 50, size: 43, anim: "bounce", dur: 1.57 },
      { type: "emoji", emoji: "🧢", x: 50, y: 15, size: 29, anim: "bounce", delay: 0.546, dur: 1.56 },
      { type: "emoji", emoji: "🍂", x: 25, y: 44, size: 25, anim: "rise", delay: 0.651, dur: 2.16 },
      { type: "emoji", emoji: "🌟", x: 52, y: 83, size: 23, anim: "wiggle", delay: 0.65, dur: 2.05 },
      { type: "emoji", emoji: "🍂", x: 78, y: 63, size: 18, anim: "rise", delay: 0.418, dur: 1.86 },
      { type: "emoji", emoji: "🔥", x: 37, y: 42, size: 14, anim: "blink", delay: 0.215, dur: 1.53 },
      { type: "emoji", emoji: "🔥", x: 38, y: 42, size: 24, anim: "rise", delay: 0.921, dur: 1.42 },
      { type: "emoji", emoji: "🌟", x: 69, y: 20, size: 11, anim: "blink", delay: 1.941, dur: 1.09 },
      { type: "emoji", emoji: "💫", x: 57, y: 67, size: 10, anim: "blink", delay: 1.567, dur: 1.94 }
    ],
  },
  crab_art_32_783: {
    v: 1,
    loop: 2.43,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 35, y: 53, size: 36, anim: "wiggle", dur: 1.33 },
      { type: "emoji", emoji: "🎁", x: 70, y: 42, size: 26, anim: "pop", delay: 0.437, dur: 1.88 },
      { type: "emoji", emoji: "🔥", x: 80, y: 71, size: 23, anim: "pop", delay: 1.266, dur: 1.26 },
      { type: "emoji", emoji: "🍂", x: 47, y: 44, size: 18, anim: "wiggle", delay: 1.434, dur: 1.56 },
      { type: "emoji", emoji: "🎊", x: 14, y: 63, size: 12, anim: "wiggle", delay: 0.575, dur: 1.57 },
      { type: "emoji", emoji: "⭐", x: 83, y: 62, size: 14, anim: "blink", delay: 0.603, dur: 1.31 },
      { type: "emoji", emoji: "⭐", x: 52, y: 43, size: 11, anim: "blink", delay: 1.261, dur: 1.49 }
    ],
  },
  crab_science_32_784: {
    v: 1,
    loop: 4.01,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#d1c4e9", opacity: 0.35, anim: "breathe", dur: 3.54, w: 92.25, h: 20.45 },
      { type: "emoji", emoji: "🦀", x: 38, y: 48, size: 34, anim: "breathe", dur: 3.5 },
      { type: "emoji", emoji: "🎭", x: 50, y: 28, size: 28, anim: "bounce", delay: 0.486, dur: 1.52 },
      { type: "emoji", emoji: "🔥", x: 59, y: 18, size: 22, anim: "blink", delay: 0.995, dur: 1.99 },
      { type: "emoji", emoji: "⭐", x: 78, y: 26, size: 21, anim: "float", delay: 0.249, dur: 1.52 },
      { type: "emoji", emoji: "💖", x: 26, y: 77, size: 25, anim: "float", delay: 0.183, dur: 1.54 },
      { type: "emoji", emoji: "🌟", x: 22, y: 27, size: 14, anim: "blink", delay: 1.072, dur: 1.47 },
      { type: "emoji", emoji: "💫", x: 69, y: 46, size: 19, anim: "blink", delay: 1.914, dur: 1.32 }
    ],
  },
  crab_pets_32_785: {
    v: 1,
    loop: 2.64,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e64a19", opacity: 0.34, anim: "pulse", dur: 1.87, r: 47.92 },
      { type: "emoji", emoji: "🦀", x: 62, y: 50, size: 34, anim: "pulse", dur: 2.06 },
      { type: "emoji", emoji: "🍪", x: 69, y: 44, size: 24, anim: "pop", delay: 0.464, dur: 1.52 },
      { type: "emoji", emoji: "🌸", x: 32, y: 28, size: 23, anim: "pop", delay: 0.898, dur: 1.99 },
      { type: "emoji", emoji: "🍂", x: 35, y: 82, size: 15, anim: "blink", delay: 1.266, dur: 1.61 },
      { type: "emoji", emoji: "💖", x: 85, y: 45, size: 13, anim: "pop", delay: 0.546, dur: 2.34 },
      { type: "emoji", emoji: "🍃", x: 26, y: 65, size: 13, anim: "wiggle", delay: 1.063, dur: 1.94 },
      { type: "emoji", emoji: "🌸", x: 71, y: 38, size: 23, anim: "rise", delay: 0.266, dur: 1.94 },
      { type: "emoji", emoji: "✨", x: 68, y: 51, size: 11, anim: "blink", delay: 1.63, dur: 1.01 },
      { type: "emoji", emoji: "💫", x: 67, y: 65, size: 18, anim: "blink", delay: 1.869, dur: 1.94 }
    ],
  },
  crab_magic_32_786: {
    v: 1,
    loop: 2.4,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f06292", opacity: 0.41, anim: "pulse", dur: 2.37, w: 96.64, h: 18.76 },
      { type: "emoji", emoji: "🦀", x: 32, y: 51, size: 38, anim: "pulse", dur: 2.12 },
      { type: "emoji", emoji: "🎭", x: 52, y: 27, size: 28, anim: "bounce", delay: 0.623, dur: 1.62 },
      { type: "emoji", emoji: "❄️", x: 33, y: 49, size: 25, anim: "blink", delay: 1.07, dur: 1.75 },
      { type: "emoji", emoji: "💖", x: 28, y: 35, size: 12, anim: "wiggle", delay: 0.037, dur: 1.97 },
      { type: "emoji", emoji: "🎈", x: 35, y: 29, size: 15, anim: "float", delay: 1.288, dur: 1.83 },
      { type: "emoji", emoji: "⭐", x: 19, y: 19, size: 14, anim: "blink", delay: 0.672, dur: 1.05 },
      { type: "emoji", emoji: "💫", x: 59, y: 55, size: 18, anim: "blink", delay: 1.089, dur: 1.37 }
    ],
  },
  crab_retro_32_787: {
    v: 1,
    loop: 2.91,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#8e24aa", opacity: 0.52, anim: "float", dur: 2.86, r: 40.63 },
      { type: "emoji", emoji: "🦀", x: 60, y: 44, size: 39, anim: "float", dur: 2.95 },
      { type: "emoji", emoji: "🍫", x: 70, y: 45, size: 26, anim: "float", delay: 0.446, dur: 1.48 },
      { type: "emoji", emoji: "🎉", x: 57, y: 59, size: 24, anim: "pop", delay: 1.237, dur: 2.37 },
      { type: "emoji", emoji: "💫", x: 53, y: 26, size: 16, anim: "blink", delay: 0.011, dur: 1.59 },
      { type: "emoji", emoji: "✨", x: 42, y: 84, size: 11, anim: "blink", delay: 1.821, dur: 1.93 },
      { type: "emoji", emoji: "⭐", x: 38, y: 17, size: 12, anim: "blink", delay: 1.041, dur: 1.85 }
    ],
  },
  crab_cyber_32_788: {
    v: 1,
    loop: 3.7,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff9c4", opacity: 0.64, anim: "settle", dur: 3.02, w: 94.12, h: 23.4 },
      { type: "emoji", emoji: "🦀", x: 42, y: 50, size: 44, anim: "settle", dur: 2.88 },
      { type: "emoji", emoji: "💝", x: 68, y: 40, size: 25, anim: "float", delay: 0.517, dur: 1.59 },
      { type: "emoji", emoji: "❤️", x: 67, y: 31, size: 24, anim: "blink", delay: 1.355, dur: 1.88 },
      { type: "emoji", emoji: "🌊", x: 41, y: 82, size: 12, anim: "wiggle", delay: 0.835, dur: 1.34 },
      { type: "emoji", emoji: "🔥", x: 32, y: 69, size: 22, anim: "pop", delay: 0.674, dur: 2.36 },
      { type: "emoji", emoji: "✨", x: 34, y: 35, size: 15, anim: "blink", delay: 1.011, dur: 1.42 },
      { type: "emoji", emoji: "💖", x: 47, y: 44, size: 10, anim: "blink", delay: 0.715, dur: 1.46 }
    ],
  },
  crab_nature_32_789: {
    v: 1,
    loop: 1.85,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#3949ab", opacity: 0.4, anim: "bounce", dur: 1.32, r: 43.02 },
      { type: "emoji", emoji: "🦀", x: 68, y: 52, size: 34, anim: "bounce", dur: 1.34 },
      { type: "emoji", emoji: "🎓", x: 52, y: 14, size: 26, anim: "bounce", delay: 0.639, dur: 1.69 },
      { type: "emoji", emoji: "⭐", x: 34, y: 14, size: 14, anim: "blink", delay: 0.302, dur: 1.5 },
      { type: "emoji", emoji: "🌸", x: 74, y: 38, size: 17, anim: "pop", delay: 0.594, dur: 1.79 },
      { type: "emoji", emoji: "🌟", x: 24, y: 75, size: 16, anim: "blink", delay: 1.604, dur: 1.56 },
      { type: "emoji", emoji: "💫", x: 37, y: 39, size: 16, anim: "blink", delay: 1.896, dur: 1.28 }
    ],
  },
  crab_underwater_32_790: {
    v: 1,
    loop: 2.76,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 30, y: 54, size: 32, anim: "twinkle", dur: 2.59 },
      { type: "emoji", emoji: "⭐", x: 72, y: 30, size: 22, anim: "rise", delay: 0.92, dur: 1.65 },
      { type: "emoji", emoji: "🔥", x: 58, y: 87, size: 16, anim: "rise", delay: 1.001, dur: 2.34 },
      { type: "emoji", emoji: "🍂", x: 52, y: 85, size: 22, anim: "float", delay: 0.996, dur: 1.31 },
      { type: "emoji", emoji: "💖", x: 88, y: 43, size: 24, anim: "blink", delay: 0.525, dur: 1.9 },
      { type: "emoji", emoji: "🎉", x: 64, y: 46, size: 18, anim: "pop", delay: 0.266, dur: 1.68 },
      { type: "emoji", emoji: "💖", x: 29, y: 60, size: 16, anim: "blink", delay: 0.784, dur: 1.66 },
      { type: "emoji", emoji: "✨", x: 25, y: 37, size: 12, anim: "blink", delay: 1.441, dur: 1.16 }
    ],
  },
  crab_sky_32_791: {
    v: 1,
    loop: 3.21,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#81d4fa", opacity: 0.54, anim: "float", dur: 2.77, r: 46.8 },
      { type: "emoji", emoji: "🦀", x: 49, y: 53, size: 37, anim: "float", dur: 3.08 },
      { type: "emoji", emoji: "💌", x: 71, y: 40, size: 24, anim: "pop", delay: 0.489, dur: 1.81 },
      { type: "emoji", emoji: "🌸", x: 64, y: 48, size: 24, anim: "float", delay: 0.891, dur: 1.79 },
      { type: "emoji", emoji: "🌟", x: 61, y: 84, size: 14, anim: "rise", delay: 0.004, dur: 2.38 },
      { type: "emoji", emoji: "🍃", x: 70, y: 82, size: 25, anim: "wiggle", delay: 0.695, dur: 2.06 },
      { type: "emoji", emoji: "✨", x: 46, y: 69, size: 17, anim: "rise", delay: 0.979, dur: 1.44 },
      { type: "emoji", emoji: "❤️", x: 26, y: 65, size: 20, anim: "wiggle", delay: 0.099, dur: 1.27 },
      { type: "emoji", emoji: "⭐", x: 48, y: 30, size: 11, anim: "blink", delay: 1.539, dur: 1.46 },
      { type: "emoji", emoji: "✨", x: 48, y: 82, size: 19, anim: "blink", delay: 0.621, dur: 1.56 }
    ],
  },
  crab_party_33_792: {
    v: 1,
    loop: 2.4,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f57c00", opacity: 0.7, anim: "pop", dur: 1.48, w: 94.82, h: 19.55 },
      { type: "emoji", emoji: "🦀", x: 33, y: 45, size: 39, anim: "pop", dur: 1.64 },
      { type: "emoji", emoji: "👒", x: 49, y: 14, size: 35, anim: "bounce", delay: 0.693, dur: 1.75 },
      { type: "emoji", emoji: "🌟", x: 57, y: 36, size: 16, anim: "blink", delay: 0.859, dur: 1.45 },
      { type: "emoji", emoji: "✨", x: 69, y: 52, size: 24, anim: "rise", delay: 0.783, dur: 1.26 },
      { type: "emoji", emoji: "🍃", x: 20, y: 71, size: 23, anim: "pop", delay: 0.611, dur: 1.81 },
      { type: "emoji", emoji: "💫", x: 51, y: 22, size: 14, anim: "blink", delay: 1.207, dur: 1.68 },
      { type: "emoji", emoji: "⭐", x: 17, y: 66, size: 13, anim: "blink", delay: 0.619, dur: 1.73 }
    ],
  },
  crab_beach_33_793: {
    v: 1,
    loop: 3.09,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#81c784", opacity: 0.64, anim: "heartbeat", dur: 2.51, w: 103, h: 20.52 },
      { type: "emoji", emoji: "🦀", x: 70, y: 51, size: 40, anim: "heartbeat", dur: 2.59 },
      { type: "emoji", emoji: "👮", x: 50, y: 18, size: 29, anim: "bounce", delay: 0.451, dur: 1.84 },
      { type: "emoji", emoji: "⭐", x: 72, y: 29, size: 23, anim: "rise", delay: 0.557, dur: 1.6 },
      { type: "emoji", emoji: "🌟", x: 22, y: 56, size: 21, anim: "rise", delay: 0.715, dur: 2.2 },
      { type: "emoji", emoji: "🎊", x: 20, y: 56, size: 14, anim: "rise", delay: 0.591, dur: 1.55 },
      { type: "emoji", emoji: "💫", x: 40, y: 54, size: 16, anim: "blink", delay: 1.796, dur: 1.63 },
      { type: "emoji", emoji: "⭐", x: 50, y: 16, size: 15, anim: "blink", delay: 1.388, dur: 1.58 }
    ],
  },
  crab_winter_33_794: {
    v: 1,
    loop: 4.23,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 48, y: 44, size: 38, anim: "float", dur: 3.49 },
      { type: "emoji", emoji: "👮", x: 51, y: 16, size: 31, anim: "bounce", delay: 0.574, dur: 1.53 },
      { type: "emoji", emoji: "💎", x: 69, y: 38, size: 22, anim: "float", delay: 0.665, dur: 1.92 },
      { type: "emoji", emoji: "🍂", x: 67, y: 68, size: 20, anim: "rise", delay: 1.394, dur: 2.39 },
      { type: "emoji", emoji: "🌿", x: 81, y: 61, size: 24, anim: "blink", delay: 0.191, dur: 1.27 },
      { type: "emoji", emoji: "💫", x: 58, y: 19, size: 16, anim: "blink", delay: 0.666, dur: 1.06 },
      { type: "emoji", emoji: "✨", x: 80, y: 66, size: 10, anim: "blink", delay: 0.892, dur: 1.13 }
    ],
  },
  crab_spring_33_795: {
    v: 1,
    loop: 2.76,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ffccbc", opacity: 0.36, anim: "float", dur: 2.79, w: 104.77, h: 25.78 },
      { type: "emoji", emoji: "🦀", x: 63, y: 44, size: 43, anim: "float", dur: 3.13 },
      { type: "emoji", emoji: "🔥", x: 23, y: 47, size: 25, anim: "float", delay: 1.185, dur: 1.42 },
      { type: "emoji", emoji: "💖", x: 31, y: 78, size: 11, anim: "blink", delay: 1.87, dur: 1.96 },
      { type: "emoji", emoji: "🌟", x: 64, y: 22, size: 13, anim: "blink", delay: 0.956, dur: 1.54 }
    ],
  },
  crab_halloween_33_796: {
    v: 1,
    loop: 2.53,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 51, y: 50, size: 37, anim: "wave", dur: 1.69 },
      { type: "emoji", emoji: "🎩", x: 52, y: 12, size: 32, anim: "bounce", delay: 0.635, dur: 1.57 },
      { type: "emoji", emoji: "🍃", x: 82, y: 39, size: 18, anim: "pop", delay: 0.198, dur: 1.87 },
      { type: "emoji", emoji: "🎈", x: 82, y: 83, size: 23, anim: "pop", delay: 0.566, dur: 2.22 },
      { type: "emoji", emoji: "🌊", x: 63, y: 88, size: 23, anim: "rise", delay: 0.027, dur: 2.06 },
      { type: "emoji", emoji: "🌟", x: 34, y: 71, size: 18, anim: "blink", delay: 1.915, dur: 1.15 },
      { type: "emoji", emoji: "💫", x: 21, y: 76, size: 11, anim: "blink", delay: 0.602, dur: 1.56 }
    ],
  },
  crab_christmas_33_797: {
    v: 1,
    loop: 2.2,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ab47bc", opacity: 0.54, anim: "bounce", dur: 1.74, r: 40.31 },
      { type: "emoji", emoji: "🦀", x: 65, y: 48, size: 34, anim: "bounce", dur: 1.57 },
      { type: "emoji", emoji: "🍳", x: 52, y: 16, size: 26, anim: "bounce", delay: 0.365, dur: 1.76 },
      { type: "emoji", emoji: "🍀", x: 70, y: 41, size: 25, anim: "pop", delay: 0.86, dur: 1.86 },
      { type: "emoji", emoji: "⭐", x: 58, y: 26, size: 19, anim: "wiggle", delay: 0.564, dur: 1.66 },
      { type: "emoji", emoji: "🍃", x: 41, y: 12, size: 23, anim: "wiggle", delay: 0.366, dur: 1.58 },
      { type: "emoji", emoji: "✨", x: 70, y: 49, size: 18, anim: "blink", delay: 1.27, dur: 1.14 },
      { type: "emoji", emoji: "✨", x: 41, y: 58, size: 11, anim: "blink", delay: 1.858, dur: 1.72 }
    ],
  },
  crab_coding_33_798: {
    v: 1,
    loop: 2.41,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 58, y: 45, size: 36, anim: "wiggle", dur: 1.49 },
      { type: "emoji", emoji: "🌸", x: 70, y: 45, size: 24, anim: "float", delay: 0.734, dur: 1.41 },
      { type: "emoji", emoji: "🌸", x: 84, y: 61, size: 13, anim: "float", delay: 0.816, dur: 1.86 },
      { type: "emoji", emoji: "🎈", x: 44, y: 32, size: 13, anim: "pop", delay: 0.932, dur: 1.32 },
      { type: "emoji", emoji: "💫", x: 16, y: 42, size: 17, anim: "blink", delay: 1.854, dur: 1.03 },
      { type: "emoji", emoji: "💖", x: 39, y: 52, size: 13, anim: "blink", delay: 1.866, dur: 1.87 }
    ],
  },
  crab_music_33_799: {
    v: 1,
    loop: 3.89,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 68, y: 52, size: 38, anim: "breathe", dur: 3.38 },
      { type: "emoji", emoji: "🌻", x: 71, y: 45, size: 28, anim: "rise", delay: 0.425, dur: 1.5 },
      { type: "emoji", emoji: "🎊", x: 18, y: 54, size: 12, anim: "rise", delay: 1.296, dur: 1.86 },
      { type: "emoji", emoji: "🎉", x: 13, y: 64, size: 18, anim: "pop", delay: 0.094, dur: 1.8 },
      { type: "emoji", emoji: "❤️", x: 34, y: 70, size: 18, anim: "float", delay: 1.173, dur: 1.43 },
      { type: "emoji", emoji: "🌊", x: 37, y: 28, size: 18, anim: "float", delay: 1.387, dur: 2.09 },
      { type: "emoji", emoji: "🌟", x: 61, y: 11, size: 18, anim: "float", delay: 1.29, dur: 1.44 },
      { type: "emoji", emoji: "🌟", x: 25, y: 29, size: 14, anim: "blink", delay: 1.596, dur: 1.09 },
      { type: "emoji", emoji: "🌟", x: 51, y: 54, size: 14, anim: "blink", delay: 1.213, dur: 1.99 }
    ],
  },
  crab_sports_33_800: {
    v: 1,
    loop: 2.96,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffe6e6", opacity: 0.65, anim: "pulse", dur: 1.81, r: 49.28 },
      { type: "emoji", emoji: "🦀", x: 38, y: 56, size: 36, anim: "pulse", dur: 1.89 },
      { type: "emoji", emoji: "🍳", x: 52, y: 17, size: 29, anim: "bounce", delay: 0.34, dur: 1.56 },
      { type: "emoji", emoji: "✨", x: 85, y: 31, size: 25, anim: "pop", delay: 1.17, dur: 1.22 },
      { type: "emoji", emoji: "🍃", x: 16, y: 62, size: 24, anim: "float", delay: 0.568, dur: 1.43 },
      { type: "emoji", emoji: "💖", x: 52, y: 26, size: 15, anim: "blink", delay: 1.887, dur: 1.38 },
      { type: "emoji", emoji: "✨", x: 53, y: 28, size: 15, anim: "blink", delay: 1.856, dur: 1.33 }
    ],
  },
  crab_food_33_801: {
    v: 1,
    loop: 2.74,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e1f5fe", opacity: 0.37, anim: "pulse", dur: 2.2, r: 40.93 },
      { type: "emoji", emoji: "🦀", x: 68, y: 54, size: 37, anim: "pulse", dur: 2.28 },
      { type: "emoji", emoji: "🪖", x: 52, y: 18, size: 29, anim: "bounce", delay: 0.497, dur: 1.62 },
      { type: "emoji", emoji: "🎁", x: 70, y: 38, size: 25, anim: "blink", delay: 0.856, dur: 1.94 },
      { type: "emoji", emoji: "🍂", x: 12, y: 50, size: 23, anim: "wiggle", delay: 0.219, dur: 1.31 },
      { type: "emoji", emoji: "🎊", x: 39, y: 68, size: 12, anim: "wiggle", delay: 0.288, dur: 1.55 },
      { type: "emoji", emoji: "❤️", x: 63, y: 67, size: 18, anim: "wiggle", delay: 0.249, dur: 2.22 },
      { type: "emoji", emoji: "⭐", x: 16, y: 28, size: 19, anim: "blink", delay: 1.581, dur: 1.31 },
      { type: "emoji", emoji: "✨", x: 84, y: 74, size: 13, anim: "blink", delay: 0.58, dur: 1.59 }
    ],
  },
  crab_space_33_802: {
    v: 1,
    loop: 2.87,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffcc80", opacity: 0.31, anim: "float", dur: 2.9, r: 46.48 },
      { type: "emoji", emoji: "🦀", x: 42, y: 54, size: 35, anim: "float", dur: 2.74 },
      { type: "emoji", emoji: "🌹", x: 71, y: 41, size: 29, anim: "float", delay: 0.613, dur: 1.98 },
      { type: "emoji", emoji: "❄️", x: 32, y: 19, size: 16, anim: "float", delay: 0.706, dur: 2.08 },
      { type: "emoji", emoji: "✨", x: 38, y: 49, size: 16, anim: "float", delay: 0.983, dur: 2.34 },
      { type: "emoji", emoji: "🍃", x: 48, y: 70, size: 24, anim: "wiggle", delay: 0.667, dur: 1.37 },
      { type: "emoji", emoji: "🔥", x: 79, y: 14, size: 21, anim: "rise", delay: 0.417, dur: 2.04 },
      { type: "emoji", emoji: "💖", x: 39, y: 41, size: 17, anim: "blink", delay: 0.581, dur: 1.6 },
      { type: "emoji", emoji: "💖", x: 24, y: 56, size: 19, anim: "blink", delay: 1.562, dur: 1.76 }
    ],
  },
  crab_fantasy_33_803: {
    v: 1,
    loop: 3.37,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#388e3c", opacity: 0.65, anim: "settle", dur: 3, r: 43.44 },
      { type: "emoji", emoji: "🦀", x: 30, y: 51, size: 37, anim: "settle", dur: 3 },
      { type: "emoji", emoji: "🪖", x: 52, y: 18, size: 28, anim: "bounce", delay: 0.667, dur: 2 },
      { type: "emoji", emoji: "🌸", x: 69, y: 39, size: 27, anim: "pop", delay: 0.564, dur: 1.99 },
      { type: "emoji", emoji: "💫", x: 19, y: 50, size: 25, anim: "pop", delay: 0.236, dur: 1.52 },
      { type: "emoji", emoji: "🎊", x: 55, y: 21, size: 22, anim: "float", delay: 1.147, dur: 1.45 },
      { type: "emoji", emoji: "✨", x: 84, y: 87, size: 19, anim: "wiggle", delay: 1.189, dur: 2.02 },
      { type: "emoji", emoji: "💖", x: 42, y: 26, size: 10, anim: "blink", delay: 1.004, dur: 1.56 },
      { type: "emoji", emoji: "💫", x: 60, y: 25, size: 14, anim: "blink", delay: 1.328, dur: 1.18 }
    ],
  },
  crab_office_33_804: {
    v: 1,
    loop: 2.13,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 35, y: 44, size: 40, anim: "bounce", dur: 1.4 },
      { type: "emoji", emoji: "💎", x: 71, y: 35, size: 25, anim: "rise", delay: 0.42, dur: 1.66 },
      { type: "emoji", emoji: "🍃", x: 39, y: 83, size: 19, anim: "pop", delay: 1.185, dur: 1.34 },
      { type: "emoji", emoji: "✨", x: 88, y: 44, size: 20, anim: "blink", delay: 0.51, dur: 2.22 },
      { type: "emoji", emoji: "🌟", x: 10, y: 17, size: 12, anim: "rise", delay: 0.308, dur: 2.03 },
      { type: "emoji", emoji: "💖", x: 41, y: 69, size: 16, anim: "blink", delay: 1.092, dur: 1.44 },
      { type: "emoji", emoji: "⭐", x: 70, y: 58, size: 13, anim: "blink", delay: 1.616, dur: 1.81 }
    ],
  },
  crab_fitness_33_805: {
    v: 1,
    loop: 3.1,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ff7043", opacity: 0.54, anim: "twinkle", dur: 2.3, r: 40.9 },
      { type: "emoji", emoji: "🦀", x: 64, y: 46, size: 44, anim: "twinkle", dur: 2.58 },
      { type: "emoji", emoji: "🧣", x: 49, y: 58, size: 24, anim: "bounce", delay: 0.382, dur: 1.69 },
      { type: "emoji", emoji: "🍬", x: 74, y: 44, size: 21, anim: "float", delay: 0.706, dur: 1.6 },
      { type: "emoji", emoji: "🌿", x: 65, y: 32, size: 18, anim: "wiggle", delay: 1.096, dur: 1.39 },
      { type: "emoji", emoji: "⭐", x: 35, y: 16, size: 19, anim: "pop", delay: 0.636, dur: 1.99 },
      { type: "emoji", emoji: "🌟", x: 37, y: 20, size: 24, anim: "rise", delay: 0.771, dur: 2.22 },
      { type: "emoji", emoji: "✨", x: 43, y: 76, size: 18, anim: "blink", delay: 1.886, dur: 1.13 },
      { type: "emoji", emoji: "✨", x: 39, y: 22, size: 15, anim: "blink", delay: 1.466, dur: 1.39 }
    ],
  },
  crab_travel_33_806: {
    v: 1,
    loop: 2.95,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#f48fb1", opacity: 0.36, anim: "float", dur: 3.06, r: 44.77 },
      { type: "emoji", emoji: "🦀", x: 56, y: 48, size: 39, anim: "float", dur: 2.96 },
      { type: "emoji", emoji: "🍃", x: 57, y: 56, size: 23, anim: "rise", delay: 1.345, dur: 1.73 },
      { type: "emoji", emoji: "❤️", x: 89, y: 50, size: 14, anim: "blink", delay: 1.476, dur: 1.62 },
      { type: "emoji", emoji: "💖", x: 35, y: 84, size: 14, anim: "blink", delay: 1.008, dur: 1.56 },
      { type: "emoji", emoji: "💖", x: 24, y: 48, size: 12, anim: "blink", delay: 1.129, dur: 1.62 }
    ],
  },
  crab_art_33_807: {
    v: 1,
    loop: 2.07,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 61, y: 52, size: 35, anim: "pop", dur: 1.46 },
      { type: "emoji", emoji: "👮", x: 51, y: 15, size: 29, anim: "bounce", delay: 0.445, dur: 1.9 },
      { type: "emoji", emoji: "💌", x: 67, y: 43, size: 26, anim: "blink", delay: 0.809, dur: 1.49 },
      { type: "emoji", emoji: "🌸", x: 12, y: 72, size: 21, anim: "wiggle", delay: 1.304, dur: 2.28 },
      { type: "emoji", emoji: "🔥", x: 38, y: 51, size: 19, anim: "blink", delay: 1.334, dur: 1.81 },
      { type: "emoji", emoji: "🔥", x: 21, y: 46, size: 12, anim: "rise", delay: 1.331, dur: 2.07 },
      { type: "emoji", emoji: "🌟", x: 19, y: 33, size: 12, anim: "blink", delay: 1.423, dur: 1.73 },
      { type: "emoji", emoji: "⭐", x: 79, y: 43, size: 11, anim: "blink", delay: 1.767, dur: 1.84 }
    ],
  },
  crab_science_33_808: {
    v: 1,
    loop: 2.78,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fff176", opacity: 0.32, anim: "heartbeat", dur: 2.68, w: 103.07, h: 18.03 },
      { type: "emoji", emoji: "🦀", x: 30, y: 47, size: 42, anim: "heartbeat", dur: 2.59 },
      { type: "emoji", emoji: "🧢", x: 52, y: 16, size: 28, anim: "bounce", delay: 0.404, dur: 1.92 },
      { type: "emoji", emoji: "🎁", x: 72, y: 42, size: 26, anim: "blink", delay: 0.479, dur: 1.85 },
      { type: "emoji", emoji: "🌊", x: 69, y: 33, size: 22, anim: "wiggle", delay: 0.516, dur: 2.19 },
      { type: "emoji", emoji: "❤️", x: 39, y: 83, size: 14, anim: "blink", delay: 0.651, dur: 2.39 },
      { type: "emoji", emoji: "🎉", x: 55, y: 66, size: 16, anim: "wiggle", delay: 0.089, dur: 1.63 },
      { type: "emoji", emoji: "✨", x: 39, y: 63, size: 11, anim: "blink", delay: 1.231, dur: 1.24 },
      { type: "emoji", emoji: "💖", x: 17, y: 44, size: 16, anim: "blink", delay: 1.762, dur: 1.92 }
    ],
  },
  crab_pets_33_809: {
    v: 1,
    loop: 4.25,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#303f9f", opacity: 0.66, anim: "float", dur: 3.54, w: 95.57, h: 21.66 },
      { type: "emoji", emoji: "🦀", x: 57, y: 47, size: 40, anim: "float", dur: 3.37 },
      { type: "emoji", emoji: "🤠", x: 50, y: 16, size: 31, anim: "bounce", delay: 0.657, dur: 1.65 },
      { type: "emoji", emoji: "💝", x: 71, y: 40, size: 27, anim: "pop", delay: 0.506, dur: 1.47 },
      { type: "emoji", emoji: "🎊", x: 55, y: 14, size: 20, anim: "blink", delay: 0.053, dur: 1.68 },
      { type: "emoji", emoji: "🌟", x: 35, y: 14, size: 13, anim: "float", delay: 1.355, dur: 2.22 },
      { type: "emoji", emoji: "🌟", x: 56, y: 41, size: 19, anim: "blink", delay: 0.848, dur: 1.87 },
      { type: "emoji", emoji: "🌟", x: 32, y: 46, size: 15, anim: "blink", delay: 0.548, dur: 1.4 }
    ],
  },
  crab_magic_33_810: {
    v: 1,
    loop: 2.95,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ffe6e6", opacity: 0.47, anim: "float", dur: 3.18, r: 47.08 },
      { type: "emoji", emoji: "🦀", x: 43, y: 50, size: 37, anim: "float", dur: 3.05 },
      { type: "emoji", emoji: "💫", x: 22, y: 67, size: 18, anim: "blink", delay: 0.699, dur: 2.1 },
      { type: "emoji", emoji: "🎊", x: 54, y: 50, size: 21, anim: "rise", delay: 0.133, dur: 1.42 },
      { type: "emoji", emoji: "❄️", x: 41, y: 33, size: 25, anim: "wiggle", delay: 0.703, dur: 1.96 },
      { type: "emoji", emoji: "⭐", x: 44, y: 73, size: 13, anim: "blink", delay: 0.688, dur: 1.36 },
      { type: "emoji", emoji: "✨", x: 23, y: 47, size: 14, anim: "blink", delay: 1.705, dur: 1.16 }
    ],
  },
  crab_retro_33_811: {
    v: 1,
    loop: 2.46,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#0277bd", opacity: 0.51, anim: "wave", dur: 1.61, r: 47.65 },
      { type: "emoji", emoji: "🦀", x: 36, y: 56, size: 38, anim: "wave", dur: 1.94 },
      { type: "emoji", emoji: "🎭", x: 51, y: 29, size: 26, anim: "bounce", delay: 0.534, dur: 1.97 },
      { type: "emoji", emoji: "🍦", x: 72, y: 41, size: 29, anim: "blink", delay: 0.733, dur: 1.62 },
      { type: "emoji", emoji: "🎊", x: 45, y: 78, size: 15, anim: "wiggle", delay: 1.473, dur: 2.35 },
      { type: "emoji", emoji: "🌿", x: 74, y: 89, size: 14, anim: "blink", delay: 1.281, dur: 1.58 },
      { type: "emoji", emoji: "✨", x: 27, y: 67, size: 20, anim: "wiggle", delay: 1.083, dur: 1.9 },
      { type: "emoji", emoji: "✨", x: 42, y: 13, size: 12, anim: "wiggle", delay: 0.987, dur: 1.64 },
      { type: "emoji", emoji: "⭐", x: 61, y: 68, size: 18, anim: "blink", delay: 1.863, dur: 1.25 },
      { type: "emoji", emoji: "💫", x: 35, y: 82, size: 15, anim: "blink", delay: 0.734, dur: 1.95 }
    ],
  },
  crab_cyber_33_812: {
    v: 1,
    loop: 2.04,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fb8c00", opacity: 0.36, anim: "bounce", dur: 1.7, w: 94.01, h: 18.23 },
      { type: "emoji", emoji: "🦀", x: 34, y: 56, size: 35, anim: "bounce", dur: 1.37 },
      { type: "emoji", emoji: "🍳", x: 50, y: 15, size: 29, anim: "bounce", delay: 0.341, dur: 1.57 },
      { type: "emoji", emoji: "⭐", x: 55, y: 67, size: 17, anim: "blink", delay: 0.617, dur: 1.31 },
      { type: "emoji", emoji: "🍃", x: 39, y: 38, size: 15, anim: "blink", delay: 0.316, dur: 2.12 },
      { type: "emoji", emoji: "🔥", x: 78, y: 40, size: 12, anim: "pop", delay: 0.27, dur: 1.86 },
      { type: "emoji", emoji: "🌊", x: 73, y: 78, size: 24, anim: "rise", delay: 0.274, dur: 2.07 },
      { type: "emoji", emoji: "💖", x: 31, y: 24, size: 13, anim: "blink", delay: 0.949, dur: 1.23 },
      { type: "emoji", emoji: "💖", x: 83, y: 23, size: 16, anim: "blink", delay: 1.07, dur: 1.23 },
      { type: "emoji", emoji: "🌟", x: 83, y: 25, size: 18, anim: "blink", delay: 1.236, dur: 1.17 }
    ],
  },
  crab_nature_33_813: {
    v: 1,
    loop: 2.18,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#81c784", opacity: 0.68, anim: "wiggle", dur: 1.45, w: 103.12, h: 22.6 },
      { type: "emoji", emoji: "🦀", x: 42, y: 48, size: 43, anim: "wiggle", dur: 1.53 },
      { type: "emoji", emoji: "🎓", x: 49, y: 15, size: 28, anim: "bounce", delay: 0.462, dur: 1.76 },
      { type: "emoji", emoji: "🍰", x: 66, y: 40, size: 29, anim: "float", delay: 0.761, dur: 1.47 },
      { type: "emoji", emoji: "🌸", x: 22, y: 65, size: 22, anim: "wiggle", delay: 0.468, dur: 2.02 },
      { type: "emoji", emoji: "🎊", x: 89, y: 13, size: 15, anim: "rise", delay: 0.198, dur: 1.72 },
      { type: "emoji", emoji: "⭐", x: 68, y: 51, size: 17, anim: "blink", delay: 1.793, dur: 1.22 },
      { type: "emoji", emoji: "🌟", x: 32, y: 34, size: 10, anim: "blink", delay: 1.473, dur: 1.93 }
    ],
  },
  crab_underwater_33_814: {
    v: 1,
    loop: 3.95,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ede7f6", opacity: 0.54, anim: "breathe", dur: 3.73, r: 48.35 },
      { type: "emoji", emoji: "🦀", x: 37, y: 46, size: 33, anim: "breathe", dur: 3.63 },
      { type: "emoji", emoji: "🎩", x: 50, y: 11, size: 30, anim: "bounce", delay: 0.526, dur: 2 },
      { type: "emoji", emoji: "🌟", x: 74, y: 25, size: 24, anim: "pop", delay: 0.565, dur: 1.85 },
      { type: "emoji", emoji: "🌟", x: 79, y: 71, size: 14, anim: "pop", delay: 0.935, dur: 2.09 },
      { type: "emoji", emoji: "🌊", x: 86, y: 84, size: 13, anim: "rise", delay: 0.828, dur: 1.21 },
      { type: "emoji", emoji: "⭐", x: 23, y: 82, size: 18, anim: "blink", delay: 1.483, dur: 1.49 },
      { type: "emoji", emoji: "⭐", x: 50, y: 80, size: 13, anim: "blink", delay: 1.161, dur: 1.88 }
    ],
  },
  crab_sky_33_815: {
    v: 1,
    loop: 2.62,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fbe9e7", opacity: 0.33, anim: "pulse", dur: 2.12, r: 41.82 },
      { type: "emoji", emoji: "🦀", x: 70, y: 50, size: 43, anim: "pulse", dur: 1.91 },
      { type: "emoji", emoji: "🍳", x: 50, y: 16, size: 26, anim: "bounce", delay: 0.377, dur: 1.82 },
      { type: "emoji", emoji: "🍬", x: 71, y: 42, size: 21, anim: "blink", delay: 0.874, dur: 1.9 },
      { type: "emoji", emoji: "🍃", x: 63, y: 59, size: 21, anim: "wiggle", delay: 0.544, dur: 2.34 },
      { type: "emoji", emoji: "❤️", x: 73, y: 16, size: 25, anim: "pop", delay: 1.135, dur: 1.84 },
      { type: "emoji", emoji: "💫", x: 70, y: 28, size: 17, anim: "blink", delay: 1.338, dur: 1.33 },
      { type: "emoji", emoji: "✨", x: 47, y: 60, size: 10, anim: "blink", delay: 0.54, dur: 1.6 }
    ],
  },
  crab_party_34_816: {
    v: 1,
    loop: 2.32,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f48fb1", opacity: 0.42, anim: "pulse", dur: 2.38, w: 91.39, h: 22.26 },
      { type: "emoji", emoji: "🦀", x: 51, y: 45, size: 43, anim: "pulse", dur: 2.22 },
      { type: "emoji", emoji: "🌻", x: 72, y: 44, size: 27, anim: "rise", delay: 0.99, dur: 1.64 },
      { type: "emoji", emoji: "🌊", x: 62, y: 36, size: 22, anim: "float", delay: 0.826, dur: 2.05 },
      { type: "emoji", emoji: "🎉", x: 81, y: 70, size: 12, anim: "blink", delay: 0.071, dur: 1.94 },
      { type: "emoji", emoji: "🔥", x: 51, y: 18, size: 15, anim: "blink", delay: 0.596, dur: 1.89 },
      { type: "emoji", emoji: "⭐", x: 19, y: 29, size: 18, anim: "blink", delay: 1.637, dur: 1.77 },
      { type: "emoji", emoji: "🌟", x: 31, y: 80, size: 11, anim: "blink", delay: 1.239, dur: 1.38 }
    ],
  },
  crab_beach_34_817: {
    v: 1,
    loop: 3.21,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f3e5f5", opacity: 0.69, anim: "float", dur: 2.63, w: 93.36, h: 18.55 },
      { type: "emoji", emoji: "🦀", x: 40, y: 45, size: 33, anim: "float", dur: 2.68 },
      { type: "emoji", emoji: "🌸", x: 67, y: 44, size: 25, anim: "blink", delay: 0.422, dur: 1.88 },
      { type: "emoji", emoji: "✨", x: 46, y: 66, size: 17, anim: "blink", delay: 0.624, dur: 2.4 },
      { type: "emoji", emoji: "⭐", x: 42, y: 14, size: 16, anim: "pop", delay: 1.04, dur: 2.2 },
      { type: "emoji", emoji: "✨", x: 48, y: 46, size: 19, anim: "pop", delay: 0.722, dur: 1.24 },
      { type: "emoji", emoji: "🍃", x: 12, y: 11, size: 15, anim: "blink", delay: 0.314, dur: 2.17 },
      { type: "emoji", emoji: "💖", x: 78, y: 58, size: 15, anim: "blink", delay: 0.554, dur: 1.32 },
      { type: "emoji", emoji: "💫", x: 43, y: 79, size: 14, anim: "blink", delay: 0.945, dur: 1.48 }
    ],
  },
  crab_winter_34_818: {
    v: 1,
    loop: 3.71,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fbc02d", opacity: 0.69, anim: "settle", dur: 3.22, r: 40.31 },
      { type: "emoji", emoji: "🦀", x: 32, y: 52, size: 44, anim: "settle", dur: 2.94 },
      { type: "emoji", emoji: "🔥", x: 47, y: 33, size: 20, anim: "float", delay: 0.233, dur: 1.5 },
      { type: "emoji", emoji: "🔥", x: 60, y: 39, size: 12, anim: "pop", delay: 1.3, dur: 2.18 },
      { type: "emoji", emoji: "🌸", x: 35, y: 37, size: 24, anim: "blink", delay: 1.104, dur: 1.34 },
      { type: "emoji", emoji: "✨", x: 31, y: 15, size: 15, anim: "blink", delay: 1.935, dur: 1.91 },
      { type: "emoji", emoji: "💫", x: 21, y: 36, size: 19, anim: "blink", delay: 1.806, dur: 1.01 }
    ],
  },
  crab_spring_34_819: {
    v: 1,
    loop: 1.91,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#c5cae9", opacity: 0.63, anim: "bounce", dur: 1.43, r: 42.99 },
      { type: "emoji", emoji: "🦀", x: 62, y: 44, size: 36, anim: "bounce", dur: 1.4 },
      { type: "emoji", emoji: "🍀", x: 75, y: 44, size: 25, anim: "rise", delay: 0.971, dur: 1.86 },
      { type: "emoji", emoji: "🎈", x: 54, y: 50, size: 13, anim: "rise", delay: 1.167, dur: 1.65 },
      { type: "emoji", emoji: "🎊", x: 53, y: 80, size: 21, anim: "rise", delay: 0.723, dur: 1.26 },
      { type: "emoji", emoji: "🌟", x: 27, y: 64, size: 15, anim: "blink", delay: 0.987, dur: 1.02 },
      { type: "emoji", emoji: "🌟", x: 57, y: 48, size: 13, anim: "blink", delay: 1.828, dur: 1.63 }
    ],
  },
  crab_halloween_34_820: {
    v: 1,
    loop: 2.83,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff0f6", opacity: 0.62, anim: "twinkle", dur: 2.53, w: 104.82, h: 20.12 },
      { type: "emoji", emoji: "🦀", x: 37, y: 56, size: 38, anim: "twinkle", dur: 2.63 },
      { type: "emoji", emoji: "🌸", x: 14, y: 49, size: 18, anim: "pop", delay: 0.171, dur: 1.53 },
      { type: "emoji", emoji: "🎈", x: 80, y: 53, size: 15, anim: "wiggle", delay: 0.106, dur: 1.57 },
      { type: "emoji", emoji: "🍃", x: 89, y: 50, size: 24, anim: "wiggle", delay: 1.074, dur: 2.09 },
      { type: "emoji", emoji: "❤️", x: 86, y: 23, size: 14, anim: "float", delay: 0.519, dur: 1.91 },
      { type: "emoji", emoji: "💫", x: 72, y: 27, size: 12, anim: "blink", delay: 1.266, dur: 1.39 },
      { type: "emoji", emoji: "💖", x: 21, y: 74, size: 16, anim: "blink", delay: 0.873, dur: 1.08 }
    ],
  },
  crab_christmas_34_821: {
    v: 1,
    loop: 3.11,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 31, y: 50, size: 43, anim: "float", dur: 2.85 },
      { type: "emoji", emoji: "🎭", x: 48, y: 29, size: 26, anim: "bounce", delay: 0.536, dur: 1.84 },
      { type: "emoji", emoji: "🌸", x: 67, y: 45, size: 25, anim: "blink", delay: 0.857, dur: 1.41 },
      { type: "emoji", emoji: "💖", x: 10, y: 20, size: 15, anim: "float", delay: 0.798, dur: 2.37 },
      { type: "emoji", emoji: "🎉", x: 64, y: 12, size: 17, anim: "blink", delay: 0.166, dur: 1.65 },
      { type: "emoji", emoji: "🎊", x: 45, y: 16, size: 25, anim: "rise", delay: 1.057, dur: 1.54 },
      { type: "emoji", emoji: "✨", x: 31, y: 72, size: 17, anim: "blink", delay: 1.958, dur: 1.17 },
      { type: "emoji", emoji: "💖", x: 37, y: 65, size: 18, anim: "blink", delay: 1.46, dur: 1.54 }
    ],
  },
  crab_coding_34_822: {
    v: 1,
    loop: 2.08,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ffcc80", opacity: 0.64, anim: "pop", dur: 1.69, w: 92.73, h: 19.97 },
      { type: "emoji", emoji: "🦀", x: 44, y: 52, size: 33, anim: "pop", dur: 1.6 },
      { type: "emoji", emoji: "💌", x: 73, y: 44, size: 27, anim: "rise", delay: 0.836, dur: 1.75 },
      { type: "emoji", emoji: "🌿", x: 88, y: 63, size: 18, anim: "rise", delay: 1.315, dur: 1.67 },
      { type: "emoji", emoji: "🌟", x: 51, y: 49, size: 18, anim: "wiggle", delay: 0.998, dur: 2.38 },
      { type: "emoji", emoji: "✨", x: 36, y: 17, size: 19, anim: "blink", delay: 1.322, dur: 1.27 },
      { type: "emoji", emoji: "💖", x: 77, y: 76, size: 14, anim: "blink", delay: 0.773, dur: 1.31 }
    ],
  },
  crab_music_34_823: {
    v: 1,
    loop: 2.93,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 34, y: 55, size: 42, anim: "heartbeat", dur: 2.65 },
      { type: "emoji", emoji: "👑", x: 49, y: 14, size: 31, anim: "bounce", delay: 0.442, dur: 1.73 },
      { type: "emoji", emoji: "⭐", x: 69, y: 31, size: 23, anim: "pop", delay: 0.448, dur: 1.85 },
      { type: "emoji", emoji: "💖", x: 58, y: 47, size: 16, anim: "float", delay: 0.068, dur: 1.86 },
      { type: "emoji", emoji: "💫", x: 17, y: 59, size: 21, anim: "rise", delay: 1.076, dur: 2.22 },
      { type: "emoji", emoji: "🌟", x: 26, y: 50, size: 15, anim: "blink", delay: 0.875, dur: 1.64 },
      { type: "emoji", emoji: "⭐", x: 34, y: 72, size: 19, anim: "blink", delay: 1.209, dur: 1.78 }
    ],
  },
  crab_sports_34_824: {
    v: 1,
    loop: 4.24,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#b39ddb", opacity: 0.68, anim: "float", dur: 3.64, w: 108.66, h: 21.03 },
      { type: "emoji", emoji: "🦀", x: 36, y: 46, size: 37, anim: "float", dur: 3.38 },
      { type: "emoji", emoji: "👷", x: 52, y: 17, size: 30, anim: "bounce", delay: 0.391, dur: 1.67 },
      { type: "emoji", emoji: "🍬", x: 71, y: 46, size: 21, anim: "pop", delay: 0.66, dur: 1.69 },
      { type: "emoji", emoji: "🎊", x: 19, y: 68, size: 16, anim: "rise", delay: 1.162, dur: 2.2 },
      { type: "emoji", emoji: "🌟", x: 45, y: 26, size: 15, anim: "pop", delay: 1.136, dur: 2.23 },
      { type: "emoji", emoji: "🌟", x: 56, y: 83, size: 14, anim: "wiggle", delay: 0.246, dur: 1.74 },
      { type: "emoji", emoji: "🎈", x: 72, y: 21, size: 23, anim: "pop", delay: 0.554, dur: 1.66 },
      { type: "emoji", emoji: "✨", x: 35, y: 56, size: 18, anim: "blink", delay: 0.764, dur: 1.18 },
      { type: "emoji", emoji: "⭐", x: 61, y: 55, size: 16, anim: "blink", delay: 1.43, dur: 1.26 }
    ],
  },
  crab_food_34_825: {
    v: 1,
    loop: 3.17,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fbe9e7", opacity: 0.54, anim: "float", dur: 3.19, r: 41.14 },
      { type: "emoji", emoji: "🦀", x: 35, y: 51, size: 36, anim: "float", dur: 3.01 },
      { type: "emoji", emoji: "❤️", x: 23, y: 89, size: 21, anim: "blink", delay: 0.133, dur: 1.41 },
      { type: "emoji", emoji: "❄️", x: 83, y: 84, size: 14, anim: "pop", delay: 0.013, dur: 2.4 },
      { type: "emoji", emoji: "🌊", x: 80, y: 47, size: 14, anim: "float", delay: 0.786, dur: 1.43 },
      { type: "emoji", emoji: "🌟", x: 28, y: 39, size: 18, anim: "blink", delay: 1.1, dur: 1.47 },
      { type: "emoji", emoji: "💫", x: 67, y: 45, size: 15, anim: "blink", delay: 1.986, dur: 1.03 }
    ],
  },
  crab_space_34_826: {
    v: 1,
    loop: 2.52,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fce4ec", opacity: 0.47, anim: "wave", dur: 1.86, r: 45.35 },
      { type: "emoji", emoji: "🦀", x: 64, y: 51, size: 33, anim: "wave", dur: 1.8 },
      { type: "emoji", emoji: "⭐", x: 52, y: 27, size: 13, anim: "blink", delay: 1.324, dur: 1.7 },
      { type: "emoji", emoji: "🌊", x: 70, y: 72, size: 24, anim: "wiggle", delay: 0.437, dur: 1.54 },
      { type: "emoji", emoji: "🌟", x: 23, y: 38, size: 18, anim: "pop", delay: 1.444, dur: 2.37 },
      { type: "emoji", emoji: "⭐", x: 44, y: 36, size: 15, anim: "rise", delay: 0.721, dur: 1.58 },
      { type: "emoji", emoji: "💖", x: 13, y: 41, size: 18, anim: "float", delay: 0.449, dur: 2.37 },
      { type: "emoji", emoji: "💫", x: 18, y: 65, size: 12, anim: "blink", delay: 1.779, dur: 1.67 },
      { type: "emoji", emoji: "💫", x: 30, y: 61, size: 14, anim: "blink", delay: 1.896, dur: 1.27 }
    ],
  },
  crab_fantasy_34_827: {
    v: 1,
    loop: 1.9,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 65, y: 51, size: 44, anim: "bounce", dur: 1.49 },
      { type: "emoji", emoji: "🌊", x: 80, y: 41, size: 18, anim: "rise", delay: 1.092, dur: 1.93 },
      { type: "emoji", emoji: "🎈", x: 20, y: 65, size: 24, anim: "blink", delay: 0.802, dur: 1.64 },
      { type: "emoji", emoji: "🌟", x: 22, y: 49, size: 12, anim: "blink", delay: 1.129, dur: 1.22 },
      { type: "emoji", emoji: "💖", x: 22, y: 21, size: 17, anim: "blink", delay: 1.927, dur: 1.15 }
    ],
  },
  crab_office_34_828: {
    v: 1,
    loop: 2.05,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffee58", opacity: 0.3, anim: "wiggle", dur: 1.16, r: 46.69 },
      { type: "emoji", emoji: "🦀", x: 66, y: 51, size: 40, anim: "wiggle", dur: 1.47 },
      { type: "emoji", emoji: "🍳", x: 49, y: 15, size: 27, anim: "bounce", delay: 0.689, dur: 1.63 },
      { type: "emoji", emoji: "🍩", x: 68, y: 44, size: 25, anim: "float", delay: 0.807, dur: 1.61 },
      { type: "emoji", emoji: "🍃", x: 69, y: 40, size: 23, anim: "rise", delay: 0.022, dur: 1.7 },
      { type: "emoji", emoji: "🎊", x: 15, y: 41, size: 13, anim: "float", delay: 0.207, dur: 1.46 },
      { type: "emoji", emoji: "⭐", x: 29, y: 84, size: 14, anim: "blink", delay: 0.757, dur: 1.39 },
      { type: "emoji", emoji: "💖", x: 44, y: 49, size: 12, anim: "blink", delay: 1.528, dur: 1.42 }
    ],
  },
  crab_fitness_34_829: {
    v: 1,
    loop: 4.02,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#3f51b5", opacity: 0.59, anim: "breathe", dur: 3.55, r: 44.47 },
      { type: "emoji", emoji: "🦀", x: 48, y: 53, size: 39, anim: "breathe", dur: 3.64 },
      { type: "emoji", emoji: "👑", x: 49, y: 16, size: 31, anim: "bounce", delay: 0.555, dur: 1.54 },
      { type: "emoji", emoji: "🌸", x: 68, y: 45, size: 26, anim: "float", delay: 0.453, dur: 1.6 },
      { type: "emoji", emoji: "🌊", x: 12, y: 16, size: 20, anim: "blink", delay: 0.725, dur: 2.37 },
      { type: "emoji", emoji: "🎊", x: 45, y: 77, size: 18, anim: "pop", delay: 0.066, dur: 1.69 },
      { type: "emoji", emoji: "💫", x: 68, y: 76, size: 14, anim: "blink", delay: 1.071, dur: 1.79 },
      { type: "emoji", emoji: "💖", x: 47, y: 74, size: 18, anim: "blink", delay: 0.849, dur: 1.85 }
    ],
  },
  crab_travel_34_830: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff0f6", opacity: 0.52, anim: "pulse", dur: 1.97, w: 99.55, h: 18.94 },
      { type: "emoji", emoji: "🦀", x: 33, y: 52, size: 34, anim: "pulse", dur: 1.98 },
      { type: "emoji", emoji: "👒", x: 50, y: 13, size: 33, anim: "bounce", delay: 0.417, dur: 1.93 },
      { type: "emoji", emoji: "🎊", x: 21, y: 63, size: 17, anim: "wiggle", delay: 0.581, dur: 1.47 },
      { type: "emoji", emoji: "❄️", x: 35, y: 38, size: 22, anim: "wiggle", delay: 0.547, dur: 1.24 },
      { type: "emoji", emoji: "🍃", x: 54, y: 78, size: 18, anim: "rise", delay: 1.208, dur: 2.13 },
      { type: "emoji", emoji: "💖", x: 74, y: 54, size: 16, anim: "blink", delay: 1.624, dur: 1.54 },
      { type: "emoji", emoji: "🌟", x: 41, y: 67, size: 13, anim: "blink", delay: 0.847, dur: 1.87 }
    ],
  },
  crab_art_34_831: {
    v: 1,
    loop: 2.55,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#0277bd", opacity: 0.41, anim: "pulse", dur: 2.08, w: 104.32, h: 20.17 },
      { type: "emoji", emoji: "🦀", x: 59, y: 50, size: 38, anim: "pulse", dur: 2.32 },
      { type: "emoji", emoji: "🍪", x: 73, y: 44, size: 23, anim: "pop", delay: 0.678, dur: 1.41 },
      { type: "emoji", emoji: "🌊", x: 33, y: 65, size: 21, anim: "float", delay: 0.619, dur: 1.85 },
      { type: "emoji", emoji: "❤️", x: 68, y: 70, size: 17, anim: "wiggle", delay: 0.689, dur: 1.28 },
      { type: "emoji", emoji: "🔥", x: 36, y: 83, size: 23, anim: "float", delay: 1.196, dur: 2.17 },
      { type: "emoji", emoji: "💖", x: 61, y: 82, size: 11, anim: "blink", delay: 0.639, dur: 1.34 },
      { type: "emoji", emoji: "💫", x: 57, y: 59, size: 12, anim: "blink", delay: 0.675, dur: 1.34 }
    ],
  },
  crab_science_34_832: {
    v: 1,
    loop: 2.88,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 60, y: 54, size: 39, anim: "float", dur: 2.95 },
      { type: "emoji", emoji: "👮", x: 49, y: 16, size: 28, anim: "bounce", delay: 0.406, dur: 1.63 },
      { type: "emoji", emoji: "🍀", x: 74, y: 47, size: 25, anim: "pop", delay: 0.889, dur: 1.69 },
      { type: "emoji", emoji: "🌿", x: 48, y: 61, size: 22, anim: "wiggle", delay: 0.46, dur: 1.3 },
      { type: "emoji", emoji: "❤️", x: 85, y: 34, size: 19, anim: "rise", delay: 0.466, dur: 1.27 },
      { type: "emoji", emoji: "🌟", x: 48, y: 23, size: 13, anim: "blink", delay: 1.92, dur: 1.14 },
      { type: "emoji", emoji: "💫", x: 47, y: 66, size: 13, anim: "blink", delay: 1.231, dur: 1.53 }
    ],
  },
  crab_pets_34_833: {
    v: 1,
    loop: 3.69,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#66bb6a", opacity: 0.37, anim: "settle", dur: 2.82, w: 92.33, h: 18.65 },
      { type: "emoji", emoji: "🦀", x: 46, y: 52, size: 41, anim: "settle", dur: 3.07 },
      { type: "emoji", emoji: "👮", x: 51, y: 17, size: 28, anim: "bounce", delay: 0.336, dur: 1.8 },
      { type: "emoji", emoji: "🍩", x: 70, y: 40, size: 27, anim: "pop", delay: 0.668, dur: 1.44 },
      { type: "emoji", emoji: "❄️", x: 73, y: 89, size: 22, anim: "pop", delay: 1.243, dur: 1.62 },
      { type: "emoji", emoji: "❄️", x: 30, y: 25, size: 17, anim: "rise", delay: 0.285, dur: 1.79 },
      { type: "emoji", emoji: "🌊", x: 84, y: 65, size: 13, anim: "rise", delay: 0.714, dur: 1.41 },
      { type: "emoji", emoji: "🎈", x: 19, y: 44, size: 24, anim: "blink", delay: 0.013, dur: 1.46 },
      { type: "emoji", emoji: "✨", x: 83, y: 22, size: 10, anim: "blink", delay: 1.807, dur: 1.21 },
      { type: "emoji", emoji: "💫", x: 56, y: 43, size: 15, anim: "blink", delay: 0.569, dur: 1.29 }
    ],
  },
  crab_magic_34_834: {
    v: 1,
    loop: 1.94,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#7e57c2", opacity: 0.43, anim: "bounce", dur: 1.41, r: 48.57 },
      { type: "emoji", emoji: "🦀", x: 32, y: 52, size: 43, anim: "bounce", dur: 1.4 },
      { type: "emoji", emoji: "🍬", x: 69, y: 43, size: 20, anim: "pop", delay: 0.834, dur: 1.49 },
      { type: "emoji", emoji: "🌿", x: 17, y: 62, size: 15, anim: "wiggle", delay: 0.061, dur: 1.49 },
      { type: "emoji", emoji: "❤️", x: 71, y: 79, size: 18, anim: "blink", delay: 1.34, dur: 1.69 },
      { type: "emoji", emoji: "❤️", x: 68, y: 16, size: 15, anim: "wiggle", delay: 0.181, dur: 1.3 },
      { type: "emoji", emoji: "✨", x: 65, y: 54, size: 16, anim: "blink", delay: 1.994, dur: 1.6 },
      { type: "emoji", emoji: "💖", x: 34, y: 60, size: 17, anim: "blink", delay: 0.649, dur: 1.89 }
    ],
  },
  crab_retro_34_835: {
    v: 1,
    loop: 2.79,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ff7043", opacity: 0.5, anim: "twinkle", dur: 2.57, w: 90.12, h: 19.68 },
      { type: "emoji", emoji: "🦀", x: 52, y: 47, size: 43, anim: "twinkle", dur: 2.37 },
      { type: "emoji", emoji: "🧙", x: 52, y: 13, size: 33, anim: "bounce", delay: 0.592, dur: 1.8 },
      { type: "emoji", emoji: "💌", x: 69, y: 40, size: 24, anim: "float", delay: 0.443, dur: 1.42 },
      { type: "emoji", emoji: "🎈", x: 20, y: 68, size: 25, anim: "wiggle", delay: 1.004, dur: 2.1 },
      { type: "emoji", emoji: "💖", x: 40, y: 34, size: 23, anim: "wiggle", delay: 0.342, dur: 1.3 },
      { type: "emoji", emoji: "🎈", x: 57, y: 32, size: 17, anim: "wiggle", delay: 1.408, dur: 1.53 },
      { type: "emoji", emoji: "⭐", x: 76, y: 19, size: 13, anim: "blink", delay: 0.797, dur: 1.16 },
      { type: "emoji", emoji: "💖", x: 40, y: 84, size: 18, anim: "blink", delay: 1.341, dur: 1.48 }
    ],
  },
  crab_cyber_34_836: {
    v: 1,
    loop: 3.24,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#c2185b", opacity: 0.31, anim: "float", dur: 2.85, r: 48.76 },
      { type: "emoji", emoji: "🦀", x: 46, y: 55, size: 34, anim: "float", dur: 3.04 },
      { type: "emoji", emoji: "🍳", x: 51, y: 14, size: 27, anim: "bounce", delay: 0.635, dur: 1.98 },
      { type: "emoji", emoji: "🍬", x: 72, y: 47, size: 21, anim: "float", delay: 0.675, dur: 1.7 },
      { type: "emoji", emoji: "🍃", x: 43, y: 80, size: 20, anim: "float", delay: 1.447, dur: 1.21 },
      { type: "emoji", emoji: "❤️", x: 51, y: 34, size: 19, anim: "wiggle", delay: 1.4, dur: 2.32 },
      { type: "emoji", emoji: "❄️", x: 43, y: 36, size: 20, anim: "float", delay: 1.449, dur: 2.05 },
      { type: "emoji", emoji: "❤️", x: 15, y: 52, size: 15, anim: "wiggle", delay: 0.306, dur: 1.3 },
      { type: "emoji", emoji: "🌟", x: 81, y: 78, size: 16, anim: "blink", delay: 1.346, dur: 1.54 },
      { type: "emoji", emoji: "⭐", x: 59, y: 19, size: 13, anim: "blink", delay: 0.873, dur: 1.49 }
    ],
  },
  crab_nature_34_837: {
    v: 1,
    loop: 2.24,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#8e24aa", opacity: 0.41, anim: "pop", dur: 1.85, w: 109.5, h: 21.72 },
      { type: "emoji", emoji: "🦀", x: 54, y: 48, size: 44, anim: "pop", dur: 1.74 },
      { type: "emoji", emoji: "🍭", x: 69, y: 38, size: 24, anim: "blink", delay: 0.567, dur: 1.64 },
      { type: "emoji", emoji: "🍂", x: 77, y: 28, size: 14, anim: "wiggle", delay: 1.311, dur: 2.23 },
      { type: "emoji", emoji: "🌸", x: 87, y: 36, size: 20, anim: "pop", delay: 0.838, dur: 1.75 },
      { type: "emoji", emoji: "✨", x: 55, y: 82, size: 24, anim: "blink", delay: 1.118, dur: 1.68 },
      { type: "emoji", emoji: "⭐", x: 45, y: 38, size: 19, anim: "blink", delay: 1.11, dur: 1.08 },
      { type: "emoji", emoji: "⭐", x: 15, y: 72, size: 13, anim: "blink", delay: 0.62, dur: 1.77 }
    ],
  },
  crab_underwater_34_838: {
    v: 1,
    loop: 3.08,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 58, y: 50, size: 42, anim: "heartbeat", dur: 2.62 },
      { type: "emoji", emoji: "👑", x: 48, y: 15, size: 32, anim: "bounce", delay: 0.627, dur: 1.84 },
      { type: "emoji", emoji: "💖", x: 27, y: 46, size: 16, anim: "rise", delay: 0.482, dur: 2.3 },
      { type: "emoji", emoji: "🌊", x: 54, y: 32, size: 16, anim: "pop", delay: 0.384, dur: 2.08 },
      { type: "emoji", emoji: "❄️", x: 85, y: 17, size: 20, anim: "float", delay: 1.242, dur: 1.96 },
      { type: "emoji", emoji: "💫", x: 75, y: 37, size: 17, anim: "blink", delay: 0.589, dur: 1.66 },
      { type: "emoji", emoji: "💖", x: 40, y: 23, size: 13, anim: "blink", delay: 1.418, dur: 1.84 }
    ],
  },
  crab_sky_34_839: {
    v: 1,
    loop: 4.04,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#c5cae9", opacity: 0.35, anim: "float", dur: 3.59, r: 42.34 },
      { type: "emoji", emoji: "🦀", x: 60, y: 54, size: 40, anim: "float", dur: 3.45 },
      { type: "emoji", emoji: "🧙", x: 51, y: 11, size: 33, anim: "bounce", delay: 0.559, dur: 1.79 },
      { type: "emoji", emoji: "🌸", x: 73, y: 39, size: 25, anim: "float", delay: 0.671, dur: 1.59 },
      { type: "emoji", emoji: "💫", x: 20, y: 55, size: 15, anim: "pop", delay: 0.624, dur: 1.62 },
      { type: "emoji", emoji: "🎉", x: 33, y: 69, size: 22, anim: "pop", delay: 0.748, dur: 1.85 },
      { type: "emoji", emoji: "🍂", x: 21, y: 86, size: 22, anim: "rise", delay: 1.472, dur: 1.57 },
      { type: "emoji", emoji: "⭐", x: 57, y: 50, size: 14, anim: "blink", delay: 0.985, dur: 1.72 },
      { type: "emoji", emoji: "💖", x: 76, y: 77, size: 18, anim: "blink", delay: 1.026, dur: 1.24 }
    ],
  },
  crab_party_35_840: {
    v: 1,
    loop: 2.87,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#e8f5e9", opacity: 0.59, anim: "float", dur: 2.89, w: 109.07, h: 27.21 },
      { type: "emoji", emoji: "🦀", x: 49, y: 50, size: 36, anim: "float", dur: 2.97 },
      { type: "emoji", emoji: "🍃", x: 89, y: 38, size: 22, anim: "float", delay: 0.777, dur: 2.18 },
      { type: "emoji", emoji: "🍃", x: 15, y: 22, size: 12, anim: "rise", delay: 0.521, dur: 2.16 },
      { type: "emoji", emoji: "⭐", x: 55, y: 35, size: 14, anim: "pop", delay: 0.709, dur: 2.36 },
      { type: "emoji", emoji: "💫", x: 75, y: 60, size: 19, anim: "blink", delay: 1.119, dur: 1.49 },
      { type: "emoji", emoji: "💫", x: 49, y: 79, size: 17, anim: "blink", delay: 1.745, dur: 1.42 }
    ],
  },
  crab_beach_35_841: {
    v: 1,
    loop: 2.28,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 39, y: 44, size: 36, anim: "wave", dur: 1.73 },
      { type: "emoji", emoji: "👷", x: 49, y: 15, size: 29, anim: "bounce", delay: 0.343, dur: 1.7 },
      { type: "emoji", emoji: "🍪", x: 74, y: 46, size: 23, anim: "pop", delay: 0.847, dur: 1.88 },
      { type: "emoji", emoji: "🎈", x: 26, y: 28, size: 13, anim: "blink", delay: 1.262, dur: 2.14 },
      { type: "emoji", emoji: "⭐", x: 62, y: 67, size: 25, anim: "wiggle", delay: 0.586, dur: 2.24 },
      { type: "emoji", emoji: "🌿", x: 21, y: 41, size: 16, anim: "wiggle", delay: 0.948, dur: 1.45 },
      { type: "emoji", emoji: "⭐", x: 79, y: 35, size: 17, anim: "blink", delay: 1.753, dur: 1.69 },
      { type: "emoji", emoji: "💖", x: 58, y: 40, size: 10, anim: "blink", delay: 1.869, dur: 1.36 }
    ],
  },
  crab_winter_35_842: {
    v: 1,
    loop: 1.85,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff3e0", opacity: 0.44, anim: "bounce", dur: 1.32, w: 101.1, h: 21.31 },
      { type: "emoji", emoji: "🦀", x: 65, y: 55, size: 33, anim: "bounce", dur: 1.57 },
      { type: "emoji", emoji: "💫", x: 64, y: 48, size: 14, anim: "rise", delay: 1.296, dur: 1.6 },
      { type: "emoji", emoji: "❄️", x: 64, y: 34, size: 21, anim: "blink", delay: 0.392, dur: 1.25 },
      { type: "emoji", emoji: "✨", x: 22, y: 34, size: 18, anim: "blink", delay: 1.005, dur: 1.07 },
      { type: "emoji", emoji: "🌟", x: 40, y: 83, size: 15, anim: "blink", delay: 0.599, dur: 1.27 }
    ],
  },
  crab_spring_35_843: {
    v: 1,
    loop: 2.29,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#43a047", opacity: 0.54, anim: "wiggle", dur: 1.51, r: 40.38 },
      { type: "emoji", emoji: "🦀", x: 40, y: 45, size: 38, anim: "wiggle", dur: 1.48 },
      { type: "emoji", emoji: "🎈", x: 73, y: 28, size: 26, anim: "blink", delay: 0.806, dur: 1.88 },
      { type: "emoji", emoji: "❤️", x: 43, y: 50, size: 25, anim: "wiggle", delay: 0.245, dur: 1.4 },
      { type: "emoji", emoji: "🌊", x: 80, y: 72, size: 20, anim: "float", delay: 0.308, dur: 1.62 },
      { type: "emoji", emoji: "💖", x: 29, y: 68, size: 10, anim: "blink", delay: 0.531, dur: 1.39 },
      { type: "emoji", emoji: "⭐", x: 24, y: 68, size: 12, anim: "blink", delay: 0.625, dur: 1.04 }
    ],
  },
  crab_halloween_35_844: {
    v: 1,
    loop: 3.9,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#d1c4e9", opacity: 0.47, anim: "breathe", dur: 3.59, w: 95.22, h: 18.37 },
      { type: "emoji", emoji: "🦀", x: 36, y: 47, size: 41, anim: "breathe", dur: 3.62 },
      { type: "emoji", emoji: "🎈", x: 74, y: 26, size: 28, anim: "rise", delay: 0.632, dur: 1.75 },
      { type: "emoji", emoji: "🎉", x: 34, y: 74, size: 22, anim: "rise", delay: 0.055, dur: 1.21 },
      { type: "emoji", emoji: "🎉", x: 14, y: 20, size: 22, anim: "float", delay: 1.233, dur: 1.74 },
      { type: "emoji", emoji: "✨", x: 40, y: 48, size: 10, anim: "blink", delay: 0.932, dur: 1.55 },
      { type: "emoji", emoji: "🌟", x: 83, y: 18, size: 14, anim: "blink", delay: 1.84, dur: 1.41 }
    ],
  },
  crab_christmas_35_845: {
    v: 1,
    loop: 2.71,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 55, y: 44, size: 35, anim: "pulse", dur: 1.98 },
      { type: "emoji", emoji: "👒", x: 50, y: 13, size: 33, anim: "bounce", delay: 0.494, dur: 1.88 },
      { type: "emoji", emoji: "🍀", x: 70, y: 47, size: 22, anim: "pop", delay: 0.475, dur: 1.61 },
      { type: "emoji", emoji: "💖", x: 10, y: 82, size: 21, anim: "rise", delay: 1.286, dur: 1.31 },
      { type: "emoji", emoji: "🌸", x: 67, y: 87, size: 15, anim: "rise", delay: 0.593, dur: 2.28 },
      { type: "emoji", emoji: "🌟", x: 84, y: 55, size: 15, anim: "blink", delay: 1.752, dur: 1.82 },
      { type: "emoji", emoji: "💫", x: 41, y: 23, size: 16, anim: "blink", delay: 1.211, dur: 1.43 }
    ],
  },
  crab_coding_35_846: {
    v: 1,
    loop: 2.7,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 33, y: 45, size: 39, anim: "pulse", dur: 2.05 },
      { type: "emoji", emoji: "👷", x: 51, y: 17, size: 31, anim: "bounce", delay: 0.681, dur: 1.75 },
      { type: "emoji", emoji: "✨", x: 55, y: 63, size: 17, anim: "pop", delay: 0.629, dur: 2.03 },
      { type: "emoji", emoji: "🎊", x: 74, y: 62, size: 23, anim: "wiggle", delay: 1.192, dur: 1.92 },
      { type: "emoji", emoji: "❄️", x: 28, y: 81, size: 13, anim: "pop", delay: 0.4, dur: 2 },
      { type: "emoji", emoji: "💫", x: 33, y: 34, size: 16, anim: "blink", delay: 1.127, dur: 1.24 },
      { type: "emoji", emoji: "⭐", x: 62, y: 22, size: 11, anim: "blink", delay: 1.421, dur: 1.18 }
    ],
  },
  crab_music_35_847: {
    v: 1,
    loop: 2.97,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ab47bc", opacity: 0.67, anim: "float", dur: 2.71, r: 49.44 },
      { type: "emoji", emoji: "🦀", x: 54, y: 54, size: 33, anim: "float", dur: 2.84 },
      { type: "emoji", emoji: "👮", x: 49, y: 17, size: 29, anim: "bounce", delay: 0.59, dur: 1.94 },
      { type: "emoji", emoji: "🌸", x: 72, y: 40, size: 26, anim: "rise", delay: 0.845, dur: 1.47 },
      { type: "emoji", emoji: "💫", x: 64, y: 26, size: 19, anim: "pop", delay: 0.748, dur: 1.68 },
      { type: "emoji", emoji: "⭐", x: 74, y: 43, size: 20, anim: "rise", delay: 0.093, dur: 2.12 },
      { type: "emoji", emoji: "🍂", x: 46, y: 69, size: 21, anim: "rise", delay: 1.125, dur: 1.83 },
      { type: "emoji", emoji: "🌟", x: 52, y: 64, size: 10, anim: "blink", delay: 0.687, dur: 1.85 },
      { type: "emoji", emoji: "💖", x: 49, y: 67, size: 17, anim: "blink", delay: 1.596, dur: 1.56 }
    ],
  },
  crab_sports_35_848: {
    v: 1,
    loop: 3.47,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fbc02d", opacity: 0.42, anim: "settle", dur: 3.1, r: 42.08 },
      { type: "emoji", emoji: "🦀", x: 66, y: 51, size: 43, anim: "settle", dur: 2.96 },
      { type: "emoji", emoji: "🎩", x: 49, y: 12, size: 33, anim: "bounce", delay: 0.529, dur: 1.54 },
      { type: "emoji", emoji: "🍀", x: 69, y: 47, size: 24, anim: "rise", delay: 0.607, dur: 1.62 },
      { type: "emoji", emoji: "🌸", x: 54, y: 66, size: 13, anim: "float", delay: 0.19, dur: 1.85 },
      { type: "emoji", emoji: "✨", x: 65, y: 35, size: 13, anim: "wiggle", delay: 1.2, dur: 1.58 },
      { type: "emoji", emoji: "🔥", x: 48, y: 78, size: 22, anim: "blink", delay: 0.412, dur: 2.34 },
      { type: "emoji", emoji: "⭐", x: 67, y: 18, size: 14, anim: "blink", delay: 1.874, dur: 1.82 },
      { type: "emoji", emoji: "✨", x: 43, y: 74, size: 18, anim: "blink", delay: 1.024, dur: 1.6 }
    ],
  },
  crab_food_35_849: {
    v: 1,
    loop: 1.94,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 34, y: 47, size: 34, anim: "bounce", dur: 1.34 },
      { type: "emoji", emoji: "💌", x: 69, y: 40, size: 24, anim: "blink", delay: 0.874, dur: 1.99 },
      { type: "emoji", emoji: "🍂", x: 25, y: 36, size: 13, anim: "pop", delay: 0.552, dur: 2.35 },
      { type: "emoji", emoji: "⭐", x: 75, y: 54, size: 17, anim: "blink", delay: 1.461, dur: 1.88 },
      { type: "emoji", emoji: "⭐", x: 67, y: 34, size: 15, anim: "blink", delay: 0.691, dur: 1.85 }
    ],
  },
  crab_space_35_850: {
    v: 1,
    loop: 2.83,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffe6e6", opacity: 0.31, anim: "twinkle", dur: 2.54, r: 40.64 },
      { type: "emoji", emoji: "🦀", x: 66, y: 52, size: 41, anim: "twinkle", dur: 2.6 },
      { type: "emoji", emoji: "🤠", x: 50, y: 14, size: 32, anim: "bounce", delay: 0.608, dur: 1.76 },
      { type: "emoji", emoji: "🎈", x: 74, y: 26, size: 28, anim: "rise", delay: 0.749, dur: 1.43 },
      { type: "emoji", emoji: "🍂", x: 66, y: 41, size: 25, anim: "pop", delay: 1.364, dur: 1.99 },
      { type: "emoji", emoji: "🎉", x: 37, y: 55, size: 17, anim: "wiggle", delay: 1.401, dur: 1.57 },
      { type: "emoji", emoji: "❤️", x: 66, y: 31, size: 13, anim: "rise", delay: 0.291, dur: 1.61 },
      { type: "emoji", emoji: "⭐", x: 40, y: 29, size: 10, anim: "blink", delay: 0.725, dur: 1.6 },
      { type: "emoji", emoji: "💖", x: 31, y: 73, size: 10, anim: "blink", delay: 1.929, dur: 1.08 }
    ],
  },
  crab_fantasy_35_851: {
    v: 1,
    loop: 2.98,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#0277bd", opacity: 0.31, anim: "float", dur: 3.03, r: 41.48 },
      { type: "emoji", emoji: "🦀", x: 38, y: 49, size: 39, anim: "float", dur: 2.92 },
      { type: "emoji", emoji: "👮", x: 52, y: 16, size: 30, anim: "bounce", delay: 0.554, dur: 1.62 },
      { type: "emoji", emoji: "⭐", x: 25, y: 71, size: 25, anim: "wiggle", delay: 0.932, dur: 1.33 },
      { type: "emoji", emoji: "❄️", x: 81, y: 43, size: 13, anim: "blink", delay: 1.323, dur: 2.24 },
      { type: "emoji", emoji: "🎊", x: 49, y: 39, size: 24, anim: "blink", delay: 0.55, dur: 1.31 },
      { type: "emoji", emoji: "🍃", x: 26, y: 20, size: 23, anim: "blink", delay: 0.435, dur: 2.39 },
      { type: "emoji", emoji: "🔥", x: 56, y: 57, size: 23, anim: "blink", delay: 0.783, dur: 1.75 },
      { type: "emoji", emoji: "✨", x: 17, y: 63, size: 14, anim: "blink", delay: 1.855, dur: 1.68 },
      { type: "emoji", emoji: "💫", x: 71, y: 43, size: 16, anim: "blink", delay: 1.26, dur: 1.94 }
    ],
  },
  crab_office_35_852: {
    v: 1,
    loop: 2.43,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#f57c00", opacity: 0.5, anim: "pop", dur: 1.82, w: 100.28, h: 20.96 },
      { type: "emoji", emoji: "🦀", x: 68, y: 44, size: 42, anim: "pop", dur: 1.7 },
      { type: "emoji", emoji: "🎓", x: 50, y: 14, size: 27, anim: "bounce", delay: 0.627, dur: 1.6 },
      { type: "emoji", emoji: "💖", x: 45, y: 60, size: 12, anim: "float", delay: 0.822, dur: 1.71 },
      { type: "emoji", emoji: "🌊", x: 40, y: 10, size: 13, anim: "blink", delay: 1.21, dur: 2.39 },
      { type: "emoji", emoji: "🌸", x: 54, y: 40, size: 21, anim: "rise", delay: 0.483, dur: 2.12 },
      { type: "emoji", emoji: "⭐", x: 75, y: 76, size: 12, anim: "float", delay: 1.313, dur: 2.35 },
      { type: "emoji", emoji: "💫", x: 30, y: 31, size: 15, anim: "blink", delay: 0.676, dur: 1.91 },
      { type: "emoji", emoji: "💫", x: 15, y: 53, size: 19, anim: "blink", delay: 0.858, dur: 1.74 }
    ],
  },
  crab_fitness_35_853: {
    v: 1,
    loop: 3.2,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 54, y: 52, size: 38, anim: "heartbeat", dur: 2.53 },
      { type: "emoji", emoji: "🎭", x: 52, y: 27, size: 27, anim: "bounce", delay: 0.629, dur: 1.94 },
      { type: "emoji", emoji: "💌", x: 71, y: 44, size: 26, anim: "blink", delay: 0.465, dur: 1.48 },
      { type: "emoji", emoji: "🎉", x: 15, y: 56, size: 22, anim: "pop", delay: 0.173, dur: 2.18 },
      { type: "emoji", emoji: "💖", x: 61, y: 17, size: 16, anim: "rise", delay: 0.169, dur: 2.18 },
      { type: "emoji", emoji: "💫", x: 21, y: 74, size: 16, anim: "blink", delay: 1.556, dur: 1.47 },
      { type: "emoji", emoji: "✨", x: 68, y: 73, size: 13, anim: "blink", delay: 1.367, dur: 1.26 }
    ],
  },
  crab_travel_35_854: {
    v: 1,
    loop: 3.8,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#b39ddb", opacity: 0.37, anim: "float", dur: 3.39, r: 40.59 },
      { type: "emoji", emoji: "🦀", x: 58, y: 46, size: 41, anim: "float", dur: 3.38 },
      { type: "emoji", emoji: "👷", x: 49, y: 16, size: 31, anim: "bounce", delay: 0.59, dur: 1.86 },
      { type: "emoji", emoji: "🍀", x: 74, y: 44, size: 25, anim: "blink", delay: 0.662, dur: 1.68 },
      { type: "emoji", emoji: "🌟", x: 17, y: 87, size: 20, anim: "float", delay: 1.311, dur: 2.33 },
      { type: "emoji", emoji: "⭐", x: 45, y: 14, size: 16, anim: "blink", delay: 1.141, dur: 2.33 },
      { type: "emoji", emoji: "✨", x: 51, y: 68, size: 20, anim: "blink", delay: 1.185, dur: 2.29 },
      { type: "emoji", emoji: "🌟", x: 63, y: 24, size: 23, anim: "pop", delay: 0.341, dur: 1.44 },
      { type: "emoji", emoji: "🔥", x: 21, y: 33, size: 24, anim: "pop", delay: 0.357, dur: 1.25 },
      { type: "emoji", emoji: "⭐", x: 52, y: 55, size: 14, anim: "blink", delay: 1.827, dur: 1.76 },
      { type: "emoji", emoji: "✨", x: 50, y: 36, size: 14, anim: "blink", delay: 0.714, dur: 1.49 }
    ],
  },
  crab_art_35_855: {
    v: 1,
    loop: 2.96,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ff8a65", opacity: 0.4, anim: "float", dur: 2.84, r: 44.73 },
      { type: "emoji", emoji: "🦀", x: 43, y: 47, size: 42, anim: "float", dur: 3.04 },
      { type: "emoji", emoji: "🎀", x: 68, y: 30, size: 16, anim: "pop", delay: 0.996, dur: 1.44 },
      { type: "emoji", emoji: "⭐", x: 73, y: 39, size: 14, anim: "wiggle", delay: 0.94, dur: 1.45 },
      { type: "emoji", emoji: "💫", x: 36, y: 75, size: 10, anim: "blink", delay: 1.634, dur: 1.41 },
      { type: "emoji", emoji: "✨", x: 31, y: 64, size: 16, anim: "blink", delay: 1.551, dur: 1.36 }
    ],
  },
  crab_science_35_856: {
    v: 1,
    loop: 2.67,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#fce4ec", opacity: 0.51, anim: "wave", dur: 1.6, w: 102.81, h: 26.31 },
      { type: "emoji", emoji: "🦀", x: 50, y: 52, size: 41, anim: "wave", dur: 1.91 },
      { type: "emoji", emoji: "🕶️", x: 50, y: 28, size: 29, anim: "bounce", delay: 0.578, dur: 1.98 },
      { type: "emoji", emoji: "🎀", x: 70, y: 28, size: 18, anim: "rise", delay: 0.402, dur: 1.49 },
      { type: "emoji", emoji: "🎈", x: 43, y: 69, size: 21, anim: "pop", delay: 0.605, dur: 2.27 },
      { type: "emoji", emoji: "🍂", x: 75, y: 12, size: 24, anim: "wiggle", delay: 0.281, dur: 2.05 },
      { type: "emoji", emoji: "🎈", x: 76, y: 18, size: 24, anim: "float", delay: 1.331, dur: 1.71 },
      { type: "emoji", emoji: "⭐", x: 24, y: 30, size: 10, anim: "blink", delay: 1.797, dur: 1 },
      { type: "emoji", emoji: "💫", x: 80, y: 66, size: 13, anim: "blink", delay: 1.897, dur: 1.59 }
    ],
  },
  crab_pets_35_857: {
    v: 1,
    loop: 2.08,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#9c27b0", opacity: 0.63, anim: "bounce", dur: 1.6, r: 47.7 },
      { type: "emoji", emoji: "🦀", x: 47, y: 45, size: 41, anim: "bounce", dur: 1.55 },
      { type: "emoji", emoji: "🍰", x: 71, y: 39, size: 28, anim: "blink", delay: 0.686, dur: 1.63 },
      { type: "emoji", emoji: "💖", x: 62, y: 49, size: 14, anim: "rise", delay: 0.738, dur: 1.54 },
      { type: "emoji", emoji: "💫", x: 57, y: 71, size: 14, anim: "pop", delay: 0.545, dur: 1.69 },
      { type: "emoji", emoji: "✨", x: 62, y: 72, size: 13, anim: "blink", delay: 0.932, dur: 1.53 },
      { type: "emoji", emoji: "✨", x: 32, y: 20, size: 11, anim: "blink", delay: 0.669, dur: 1.89 }
    ],
  },
  crab_magic_35_858: {
    v: 1,
    loop: 1.97,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ffee58", opacity: 0.57, anim: "wiggle", dur: 1.37, r: 41.65 },
      { type: "emoji", emoji: "🦀", x: 58, y: 50, size: 39, anim: "wiggle", dur: 1.46 },
      { type: "emoji", emoji: "🧢", x: 48, y: 16, size: 31, anim: "bounce", delay: 0.33, dur: 1.69 },
      { type: "emoji", emoji: "🎀", x: 68, y: 31, size: 18, anim: "rise", delay: 0.79, dur: 1.99 },
      { type: "emoji", emoji: "✨", x: 75, y: 25, size: 12, anim: "rise", delay: 0.727, dur: 1.75 },
      { type: "emoji", emoji: "⭐", x: 30, y: 45, size: 17, anim: "blink", delay: 1.555, dur: 1.34 },
      { type: "emoji", emoji: "⭐", x: 62, y: 73, size: 19, anim: "blink", delay: 1.241, dur: 1.63 }
    ],
  },
  crab_retro_35_859: {
    v: 1,
    loop: 4,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#5c6bc0", opacity: 0.56, anim: "breathe", dur: 3.47, w: 92.61, h: 20.61 },
      { type: "emoji", emoji: "🦀", x: 55, y: 45, size: 39, anim: "breathe", dur: 3.53 },
      { type: "emoji", emoji: "🤠", x: 49, y: 16, size: 33, anim: "bounce", delay: 0.562, dur: 1.54 },
      { type: "emoji", emoji: "🍄", x: 68, y: 47, size: 26, anim: "pop", delay: 0.715, dur: 1.43 },
      { type: "emoji", emoji: "🎉", x: 62, y: 31, size: 21, anim: "rise", delay: 0.053, dur: 1.5 },
      { type: "emoji", emoji: "🎉", x: 75, y: 20, size: 18, anim: "rise", delay: 1.084, dur: 1.53 },
      { type: "emoji", emoji: "🌸", x: 83, y: 62, size: 17, anim: "wiggle", delay: 1.181, dur: 2.08 },
      { type: "emoji", emoji: "🍂", x: 51, y: 62, size: 16, anim: "wiggle", delay: 1.155, dur: 2.02 },
      { type: "emoji", emoji: "✨", x: 27, y: 57, size: 18, anim: "rise", delay: 0.051, dur: 1.94 },
      { type: "emoji", emoji: "💫", x: 61, y: 41, size: 13, anim: "blink", delay: 0.899, dur: 1.67 },
      { type: "emoji", emoji: "✨", x: 28, y: 56, size: 10, anim: "blink", delay: 0.986, dur: 1.61 }
    ],
  },
  crab_cyber_35_860: {
    v: 1,
    loop: 2.63,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 47, y: 53, size: 34, anim: "pulse", dur: 2.1 },
      { type: "emoji", emoji: "🤠", x: 49, y: 15, size: 31, anim: "bounce", delay: 0.453, dur: 1.98 },
      { type: "emoji", emoji: "💫", x: 80, y: 55, size: 25, anim: "rise", delay: 1.09, dur: 1.75 },
      { type: "emoji", emoji: "💖", x: 84, y: 26, size: 11, anim: "blink", delay: 1.43, dur: 1.3 },
      { type: "emoji", emoji: "💖", x: 50, y: 78, size: 12, anim: "blink", delay: 1.512, dur: 1.91 }
    ],
  },
  crab_nature_35_861: {
    v: 1,
    loop: 2.48,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e1f5fe", opacity: 0.66, anim: "pulse", dur: 2.15, r: 48.06 },
      { type: "emoji", emoji: "🦀", x: 68, y: 47, size: 41, anim: "pulse", dur: 2.18 },
      { type: "emoji", emoji: "🎩", x: 51, y: 11, size: 30, anim: "bounce", delay: 0.339, dur: 1.76 },
      { type: "emoji", emoji: "🌟", x: 81, y: 73, size: 25, anim: "rise", delay: 0.746, dur: 1.33 },
      { type: "emoji", emoji: "🔥", x: 40, y: 66, size: 18, anim: "rise", delay: 1.304, dur: 2.08 },
      { type: "emoji", emoji: "🍃", x: 77, y: 85, size: 17, anim: "pop", delay: 1.213, dur: 1.22 },
      { type: "emoji", emoji: "🌟", x: 79, y: 20, size: 15, anim: "blink", delay: 1.937, dur: 1.53 },
      { type: "emoji", emoji: "💫", x: 78, y: 21, size: 15, anim: "blink", delay: 1.954, dur: 1.89 }
    ],
  },
  crab_underwater_35_862: {
    v: 1,
    loop: 2.9,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ffe0b2", opacity: 0.58, anim: "float", dur: 2.73, r: 46.24 },
      { type: "emoji", emoji: "🦀", x: 55, y: 55, size: 34, anim: "float", dur: 2.86 },
      { type: "emoji", emoji: "🍳", x: 52, y: 18, size: 29, anim: "bounce", delay: 0.601, dur: 1.91 },
      { type: "emoji", emoji: "💌", x: 70, y: 41, size: 27, anim: "pop", delay: 0.418, dur: 1.82 },
      { type: "emoji", emoji: "🌊", x: 19, y: 29, size: 13, anim: "blink", delay: 1.359, dur: 2.03 },
      { type: "emoji", emoji: "🍃", x: 72, y: 76, size: 24, anim: "float", delay: 0.893, dur: 1.79 },
      { type: "emoji", emoji: "⭐", x: 40, y: 17, size: 11, anim: "blink", delay: 0.548, dur: 1.3 },
      { type: "emoji", emoji: "🌟", x: 22, y: 41, size: 18, anim: "blink", delay: 0.614, dur: 1.45 }
    ],
  },
  crab_sky_35_863: {
    v: 1,
    loop: 3.3,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#66bb6a", opacity: 0.38, anim: "settle", dur: 3.13, w: 108.32, h: 25.45 },
      { type: "emoji", emoji: "🦀", x: 50, y: 55, size: 33, anim: "settle", dur: 3.13 },
      { type: "emoji", emoji: "🧢", x: 49, y: 15, size: 31, anim: "bounce", delay: 0.507, dur: 1.55 },
      { type: "emoji", emoji: "✨", x: 73, y: 51, size: 12, anim: "wiggle", delay: 0.336, dur: 2.1 },
      { type: "emoji", emoji: "✨", x: 68, y: 69, size: 19, anim: "blink", delay: 1.561, dur: 1.99 },
      { type: "emoji", emoji: "✨", x: 26, y: 21, size: 13, anim: "blink", delay: 0.51, dur: 1.33 }
    ],
  },
  crab_party_36_864: {
    v: 1,
    loop: 1.77,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#b39ddb", opacity: 0.36, anim: "bounce", dur: 1.05, w: 103.32, h: 18.22 },
      { type: "emoji", emoji: "🦀", x: 48, y: 48, size: 40, anim: "bounce", dur: 1.19 },
      { type: "emoji", emoji: "🧙", x: 48, y: 12, size: 34, anim: "bounce", delay: 0.541, dur: 1.72 },
      { type: "emoji", emoji: "🍪", x: 75, y: 44, size: 24, anim: "blink", delay: 0.78, dur: 1.74 },
      { type: "emoji", emoji: "🌿", x: 44, y: 36, size: 16, anim: "wiggle", delay: 0.744, dur: 2.3 },
      { type: "emoji", emoji: "🌟", x: 81, y: 81, size: 13, anim: "blink", delay: 0.887, dur: 1.73 },
      { type: "emoji", emoji: "🍃", x: 12, y: 64, size: 22, anim: "pop", delay: 0.405, dur: 1.27 },
      { type: "emoji", emoji: "🎉", x: 53, y: 60, size: 17, anim: "blink", delay: 1.254, dur: 1.63 },
      { type: "emoji", emoji: "⭐", x: 69, y: 74, size: 15, anim: "blink", delay: 1.34, dur: 2.07 },
      { type: "emoji", emoji: "💫", x: 44, y: 76, size: 18, anim: "blink", delay: 1.401, dur: 1.42 },
      { type: "emoji", emoji: "💫", x: 64, y: 65, size: 16, anim: "blink", delay: 0.965, dur: 1.93 }
    ],
  },
  crab_beach_36_865: {
    v: 1,
    loop: 2.79,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 36, y: 49, size: 38, anim: "twinkle", dur: 2.58 },
      { type: "emoji", emoji: "🌟", x: 72, y: 29, size: 24, anim: "rise", delay: 0.764, dur: 1.44 },
      { type: "emoji", emoji: "⭐", x: 61, y: 47, size: 14, anim: "rise", delay: 0.754, dur: 2.14 },
      { type: "emoji", emoji: "❤️", x: 35, y: 39, size: 23, anim: "wiggle", delay: 1.116, dur: 2.25 },
      { type: "emoji", emoji: "🍂", x: 72, y: 52, size: 17, anim: "pop", delay: 0.284, dur: 1.67 },
      { type: "emoji", emoji: "🍂", x: 70, y: 17, size: 24, anim: "blink", delay: 0.03, dur: 2.33 },
      { type: "emoji", emoji: "❤️", x: 71, y: 53, size: 21, anim: "wiggle", delay: 0.421, dur: 2.36 },
      { type: "emoji", emoji: "⭐", x: 75, y: 47, size: 13, anim: "blink", delay: 1.869, dur: 1.7 },
      { type: "emoji", emoji: "💖", x: 42, y: 15, size: 15, anim: "blink", delay: 1.263, dur: 1.16 }
    ],
  },
  crab_winter_36_866: {
    v: 1,
    loop: 3.13,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fce4ec", opacity: 0.61, anim: "float", dur: 3, r: 44.28 },
      { type: "emoji", emoji: "🦀", x: 38, y: 47, size: 43, anim: "float", dur: 3.06 },
      { type: "emoji", emoji: "🔥", x: 86, y: 86, size: 20, anim: "blink", delay: 0.692, dur: 2.37 },
      { type: "emoji", emoji: "🎊", x: 79, y: 29, size: 12, anim: "float", delay: 0.508, dur: 1.85 },
      { type: "emoji", emoji: "✨", x: 69, y: 69, size: 12, anim: "blink", delay: 0.946, dur: 1.53 },
      { type: "emoji", emoji: "🌟", x: 63, y: 73, size: 16, anim: "blink", delay: 0.675, dur: 1.66 }
    ],
  },
  crab_spring_36_867: {
    v: 1,
    loop: 2.1,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 56, y: 54, size: 42, anim: "pop", dur: 1.69 },
      { type: "emoji", emoji: "👷", x: 48, y: 17, size: 28, anim: "bounce", delay: 0.523, dur: 1.81 },
      { type: "emoji", emoji: "🍦", x: 73, y: 41, size: 28, anim: "float", delay: 0.403, dur: 1.67 },
      { type: "emoji", emoji: "🌊", x: 64, y: 54, size: 16, anim: "float", delay: 0.101, dur: 1.32 },
      { type: "emoji", emoji: "✨", x: 34, y: 57, size: 16, anim: "float", delay: 0.815, dur: 1.82 },
      { type: "emoji", emoji: "✨", x: 35, y: 16, size: 22, anim: "blink", delay: 0.362, dur: 1.29 },
      { type: "emoji", emoji: "💖", x: 84, y: 73, size: 15, anim: "blink", delay: 1.631, dur: 1.44 },
      { type: "emoji", emoji: "⭐", x: 26, y: 67, size: 11, anim: "blink", delay: 0.988, dur: 1.68 }
    ],
  },
  crab_halloween_36_868: {
    v: 1,
    loop: 3.2,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fffde7", opacity: 0.62, anim: "heartbeat", dur: 2.26, w: 100.94, h: 27.96 },
      { type: "emoji", emoji: "🦀", x: 38, y: 49, size: 34, anim: "heartbeat", dur: 2.51 },
      { type: "emoji", emoji: "🎩", x: 50, y: 12, size: 31, anim: "bounce", delay: 0.306, dur: 1.7 },
      { type: "emoji", emoji: "🍩", x: 72, y: 41, size: 26, anim: "pop", delay: 0.479, dur: 1.5 },
      { type: "emoji", emoji: "💖", x: 38, y: 21, size: 22, anim: "blink", delay: 1.413, dur: 1.97 },
      { type: "emoji", emoji: "💖", x: 45, y: 25, size: 16, anim: "blink", delay: 1.485, dur: 1.31 },
      { type: "emoji", emoji: "🌟", x: 27, y: 55, size: 19, anim: "blink", delay: 1.016, dur: 1.2 }
    ],
  },
  crab_christmas_36_869: {
    v: 1,
    loop: 3.9,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 56, y: 45, size: 33, anim: "float", dur: 3.49 },
      { type: "emoji", emoji: "🧙", x: 51, y: 12, size: 32, anim: "bounce", delay: 0.499, dur: 1.67 },
      { type: "emoji", emoji: "💎", x: 69, y: 41, size: 23, anim: "blink", delay: 0.929, dur: 1.63 },
      { type: "emoji", emoji: "⭐", x: 80, y: 74, size: 15, anim: "wiggle", delay: 0.884, dur: 1.91 },
      { type: "emoji", emoji: "✨", x: 53, y: 22, size: 13, anim: "blink", delay: 1.14, dur: 1.74 },
      { type: "emoji", emoji: "💫", x: 38, y: 69, size: 13, anim: "blink", delay: 0.608, dur: 1.1 }
    ],
  },
  crab_coding_36_870: {
    v: 1,
    loop: 2.85,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#e8f5e9", opacity: 0.68, anim: "float", dur: 2.96, w: 98.53, h: 24.19 },
      { type: "emoji", emoji: "🦀", x: 34, y: 50, size: 37, anim: "float", dur: 3.02 },
      { type: "emoji", emoji: "🧢", x: 49, y: 17, size: 29, anim: "bounce", delay: 0.549, dur: 1.78 },
      { type: "emoji", emoji: "🍩", x: 69, y: 42, size: 27, anim: "float", delay: 0.484, dur: 1.63 },
      { type: "emoji", emoji: "🌿", x: 47, y: 20, size: 17, anim: "wiggle", delay: 0.479, dur: 2.03 },
      { type: "emoji", emoji: "🌟", x: 33, y: 40, size: 17, anim: "wiggle", delay: 1.011, dur: 1.27 },
      { type: "emoji", emoji: "🌿", x: 13, y: 16, size: 13, anim: "blink", delay: 0.161, dur: 1.61 },
      { type: "emoji", emoji: "✨", x: 23, y: 37, size: 14, anim: "blink", delay: 1.416, dur: 1.4 },
      { type: "emoji", emoji: "🌟", x: 49, y: 71, size: 19, anim: "blink", delay: 0.858, dur: 1.43 }
    ],
  },
  crab_music_36_871: {
    v: 1,
    loop: 2.73,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 50, y: 53, size: 34, anim: "wave", dur: 1.9 },
      { type: "emoji", emoji: "🤠", x: 49, y: 13, size: 32, anim: "bounce", delay: 0.589, dur: 1.5 },
      { type: "emoji", emoji: "🎀", x: 66, y: 29, size: 18, anim: "rise", delay: 0.434, dur: 1.56 },
      { type: "emoji", emoji: "💫", x: 67, y: 42, size: 23, anim: "float", delay: 0.075, dur: 1.99 },
      { type: "emoji", emoji: "❄️", x: 34, y: 14, size: 22, anim: "rise", delay: 0.626, dur: 2.07 },
      { type: "emoji", emoji: "🌸", x: 43, y: 71, size: 20, anim: "rise", delay: 1.222, dur: 1.36 },
      { type: "emoji", emoji: "💫", x: 29, y: 16, size: 11, anim: "blink", delay: 1.85, dur: 1.79 },
      { type: "emoji", emoji: "💫", x: 45, y: 50, size: 11, anim: "blink", delay: 1.115, dur: 1.91 }
    ],
  },
  crab_sports_36_872: {
    v: 1,
    loop: 1.81,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 65, y: 46, size: 35, anim: "bounce", dur: 1.44 },
      { type: "emoji", emoji: "👷", x: 51, y: 17, size: 29, anim: "bounce", delay: 0.636, dur: 1.62 },
      { type: "emoji", emoji: "🌸", x: 12, y: 33, size: 21, anim: "pop", delay: 0.452, dur: 2.22 },
      { type: "emoji", emoji: "🌸", x: 25, y: 42, size: 14, anim: "pop", delay: 0.274, dur: 1.54 },
      { type: "emoji", emoji: "❄️", x: 31, y: 30, size: 23, anim: "blink", delay: 0.686, dur: 2.17 },
      { type: "emoji", emoji: "✨", x: 83, y: 84, size: 16, anim: "blink", delay: 0.727, dur: 1.61 },
      { type: "emoji", emoji: "⭐", x: 30, y: 28, size: 19, anim: "blink", delay: 1.193, dur: 1.45 }
    ],
  },
  crab_food_36_873: {
    v: 1,
    loop: 2.09,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 30, y: 54, size: 35, anim: "wiggle", dur: 1.53 },
      { type: "emoji", emoji: "🎓", x: 49, y: 15, size: 29, anim: "bounce", delay: 0.633, dur: 1.95 },
      { type: "emoji", emoji: "🌟", x: 72, y: 30, size: 24, anim: "rise", delay: 0.419, dur: 1.91 },
      { type: "emoji", emoji: "🎈", x: 28, y: 32, size: 12, anim: "float", delay: 0.64, dur: 1.97 },
      { type: "emoji", emoji: "🔥", x: 62, y: 77, size: 20, anim: "rise", delay: 0.754, dur: 1.43 },
      { type: "emoji", emoji: "🔥", x: 17, y: 39, size: 25, anim: "rise", delay: 1.072, dur: 1.54 },
      { type: "emoji", emoji: "💫", x: 79, y: 52, size: 24, anim: "blink", delay: 0.033, dur: 2.08 },
      { type: "emoji", emoji: "💫", x: 72, y: 35, size: 16, anim: "blink", delay: 0.824, dur: 1.73 },
      { type: "emoji", emoji: "⭐", x: 71, y: 50, size: 11, anim: "blink", delay: 1.083, dur: 1.67 }
    ],
  },
  crab_space_36_874: {
    v: 1,
    loop: 4.24,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#512da8", opacity: 0.39, anim: "breathe", dur: 3.66, w: 100.57, h: 21.76 },
      { type: "emoji", emoji: "🦀", x: 48, y: 52, size: 41, anim: "breathe", dur: 3.38 },
      { type: "emoji", emoji: "💝", x: 72, y: 38, size: 27, anim: "pop", delay: 0.957, dur: 1.71 },
      { type: "emoji", emoji: "💖", x: 43, y: 87, size: 14, anim: "float", delay: 0.655, dur: 2 },
      { type: "emoji", emoji: "🎉", x: 64, y: 20, size: 18, anim: "rise", delay: 0.455, dur: 2.35 },
      { type: "emoji", emoji: "✨", x: 73, y: 41, size: 14, anim: "blink", delay: 0.839, dur: 2.21 },
      { type: "emoji", emoji: "🌟", x: 71, y: 66, size: 17, anim: "blink", delay: 0.688, dur: 1.67 },
      { type: "emoji", emoji: "🌟", x: 65, y: 62, size: 15, anim: "blink", delay: 1.394, dur: 1.71 }
    ],
  },
  crab_fantasy_36_875: {
    v: 1,
    loop: 2.61,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 60, y: 49, size: 42, anim: "pulse", dur: 1.92 },
      { type: "emoji", emoji: "🧢", x: 50, y: 15, size: 29, anim: "bounce", delay: 0.496, dur: 1.99 },
      { type: "emoji", emoji: "💎", x: 67, y: 35, size: 22, anim: "rise", delay: 0.829, dur: 1.63 },
      { type: "emoji", emoji: "🎈", x: 23, y: 39, size: 14, anim: "wiggle", delay: 1.34, dur: 1.29 },
      { type: "emoji", emoji: "🌿", x: 49, y: 66, size: 21, anim: "wiggle", delay: 1.218, dur: 1.83 },
      { type: "emoji", emoji: "🎈", x: 57, y: 60, size: 22, anim: "blink", delay: 0.051, dur: 1.54 },
      { type: "emoji", emoji: "🌟", x: 46, y: 66, size: 15, anim: "blink", delay: 1.93, dur: 1.25 },
      { type: "emoji", emoji: "✨", x: 61, y: 83, size: 16, anim: "blink", delay: 1.651, dur: 1.62 }
    ],
  },
  crab_office_36_876: {
    v: 1,
    loop: 2.6,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#c2185b", opacity: 0.56, anim: "pulse", dur: 2.07, r: 45.43 },
      { type: "emoji", emoji: "🦀", x: 43, y: 56, size: 40, anim: "pulse", dur: 2.08 },
      { type: "emoji", emoji: "🎩", x: 51, y: 11, size: 32, anim: "bounce", delay: 0.538, dur: 1.77 },
      { type: "emoji", emoji: "🔥", x: 61, y: 35, size: 16, anim: "rise", delay: 0.855, dur: 2.34 },
      { type: "emoji", emoji: "❄️", x: 13, y: 82, size: 22, anim: "float", delay: 0.447, dur: 1.47 },
      { type: "emoji", emoji: "⭐", x: 15, y: 68, size: 17, anim: "blink", delay: 1.197, dur: 1.67 },
      { type: "emoji", emoji: "✨", x: 34, y: 49, size: 22, anim: "wiggle", delay: 1.461, dur: 1.93 },
      { type: "emoji", emoji: "⭐", x: 81, y: 49, size: 19, anim: "blink", delay: 1.181, dur: 1.62 },
      { type: "emoji", emoji: "✨", x: 75, y: 16, size: 12, anim: "blink", delay: 1.905, dur: 1.12 }
    ],
  },
  crab_fitness_36_877: {
    v: 1,
    loop: 3.18,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#7b1fa2", opacity: 0.41, anim: "float", dur: 2.72, w: 109.98, h: 19.96 },
      { type: "emoji", emoji: "🦀", x: 40, y: 52, size: 33, anim: "float", dur: 2.9 },
      { type: "emoji", emoji: "🎩", x: 51, y: 12, size: 32, anim: "bounce", delay: 0.526, dur: 1.73 },
      { type: "emoji", emoji: "❄️", x: 75, y: 65, size: 21, anim: "rise", delay: 0.922, dur: 2.34 },
      { type: "emoji", emoji: "❤️", x: 56, y: 71, size: 13, anim: "pop", delay: 1.348, dur: 2.08 },
      { type: "emoji", emoji: "🎈", x: 83, y: 50, size: 16, anim: "rise", delay: 1.238, dur: 2.14 },
      { type: "emoji", emoji: "🌟", x: 24, y: 34, size: 19, anim: "blink", delay: 1.726, dur: 1.49 },
      { type: "emoji", emoji: "💖", x: 29, y: 77, size: 19, anim: "blink", delay: 1.962, dur: 1.79 }
    ],
  },
  crab_travel_36_878: {
    v: 1,
    loop: 3.39,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ffee58", opacity: 0.57, anim: "settle", dur: 3.22, r: 42.11 },
      { type: "emoji", emoji: "🦀", x: 66, y: 48, size: 43, anim: "settle", dur: 3.1 },
      { type: "emoji", emoji: "🍰", x: 71, y: 38, size: 28, anim: "float", delay: 0.71, dur: 1.86 },
      { type: "emoji", emoji: "❄️", x: 54, y: 12, size: 18, anim: "float", delay: 0.713, dur: 1.9 },
      { type: "emoji", emoji: "🎊", x: 38, y: 80, size: 13, anim: "wiggle", delay: 0.611, dur: 2.38 },
      { type: "emoji", emoji: "🎈", x: 14, y: 51, size: 22, anim: "pop", delay: 1.181, dur: 1.5 },
      { type: "emoji", emoji: "🌿", x: 63, y: 45, size: 20, anim: "pop", delay: 0.851, dur: 1.65 },
      { type: "emoji", emoji: "🌟", x: 47, y: 41, size: 19, anim: "blink", delay: 0.743, dur: 1.7 },
      { type: "emoji", emoji: "💫", x: 15, y: 20, size: 12, anim: "blink", delay: 1.54, dur: 1.92 }
    ],
  },
  crab_art_36_879: {
    v: 1,
    loop: 1.96,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 47, y: 46, size: 35, anim: "bounce", dur: 1.26 },
      { type: "emoji", emoji: "🌹", x: 71, y: 39, size: 26, anim: "rise", delay: 0.734, dur: 1.6 },
      { type: "emoji", emoji: "❄️", x: 79, y: 84, size: 13, anim: "pop", delay: 0.093, dur: 1.51 },
      { type: "emoji", emoji: "❤️", x: 79, y: 41, size: 19, anim: "rise", delay: 0.153, dur: 2.1 },
      { type: "emoji", emoji: "❤️", x: 59, y: 43, size: 15, anim: "wiggle", delay: 0.38, dur: 2.21 },
      { type: "emoji", emoji: "💖", x: 18, y: 56, size: 25, anim: "pop", delay: 0.686, dur: 1.54 },
      { type: "emoji", emoji: "⭐", x: 24, y: 32, size: 15, anim: "blink", delay: 0.661, dur: 1.67 },
      { type: "emoji", emoji: "💖", x: 30, y: 33, size: 11, anim: "blink", delay: 1.451, dur: 1.02 }
    ],
  },
  crab_science_36_880: {
    v: 1,
    loop: 3.22,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#f3e5f5", opacity: 0.49, anim: "twinkle", dur: 2.44, w: 99.46, h: 19.9 },
      { type: "emoji", emoji: "🦀", x: 63, y: 49, size: 39, anim: "twinkle", dur: 2.56 },
      { type: "emoji", emoji: "🎭", x: 48, y: 26, size: 26, anim: "bounce", delay: 0.595, dur: 1.57 },
      { type: "emoji", emoji: "💌", x: 69, y: 40, size: 24, anim: "float", delay: 0.723, dur: 1.89 },
      { type: "emoji", emoji: "💖", x: 78, y: 44, size: 18, anim: "wiggle", delay: 1.163, dur: 1.9 },
      { type: "emoji", emoji: "🎊", x: 45, y: 64, size: 16, anim: "pop", delay: 0.598, dur: 1.52 },
      { type: "emoji", emoji: "💫", x: 22, y: 61, size: 11, anim: "blink", delay: 0.528, dur: 1.32 },
      { type: "emoji", emoji: "✨", x: 57, y: 61, size: 11, anim: "blink", delay: 1.9, dur: 1.78 }
    ],
  },
  crab_pets_36_881: {
    v: 1,
    loop: 3.45,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e1f5fe", opacity: 0.35, anim: "float", dur: 3, r: 42.18 },
      { type: "emoji", emoji: "🦀", x: 40, y: 55, size: 41, anim: "float", dur: 2.86 },
      { type: "emoji", emoji: "🎭", x: 50, y: 30, size: 29, anim: "bounce", delay: 0.572, dur: 1.84 },
      { type: "emoji", emoji: "🌟", x: 70, y: 27, size: 27, anim: "blink", delay: 0.84, dur: 1.86 },
      { type: "emoji", emoji: "🎊", x: 79, y: 42, size: 12, anim: "wiggle", delay: 0.92, dur: 2.33 },
      { type: "emoji", emoji: "🍃", x: 52, y: 44, size: 13, anim: "float", delay: 0.05, dur: 1.91 },
      { type: "emoji", emoji: "❄️", x: 16, y: 88, size: 14, anim: "float", delay: 0.987, dur: 1.5 },
      { type: "emoji", emoji: "💫", x: 17, y: 34, size: 14, anim: "blink", delay: 1.714, dur: 1.8 },
      { type: "emoji", emoji: "✨", x: 16, y: 37, size: 11, anim: "blink", delay: 0.69, dur: 1.14 }
    ],
  },
  crab_magic_36_882: {
    v: 1,
    loop: 1.96,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffa726", opacity: 0.49, anim: "pop", dur: 1.77, w: 105.09, h: 23.93 },
      { type: "emoji", emoji: "🦀", x: 63, y: 46, size: 42, anim: "pop", dur: 1.66 },
      { type: "emoji", emoji: "🧙", x: 51, y: 13, size: 32, anim: "bounce", delay: 0.482, dur: 1.7 },
      { type: "emoji", emoji: "🌟", x: 72, y: 31, size: 26, anim: "rise", delay: 0.948, dur: 1.85 },
      { type: "emoji", emoji: "⭐", x: 13, y: 30, size: 23, anim: "wiggle", delay: 0.486, dur: 2.08 },
      { type: "emoji", emoji: "🎊", x: 13, y: 62, size: 12, anim: "blink", delay: 0.576, dur: 1.97 },
      { type: "emoji", emoji: "🎊", x: 47, y: 51, size: 25, anim: "rise", delay: 0.746, dur: 1.67 },
      { type: "emoji", emoji: "💖", x: 61, y: 54, size: 10, anim: "blink", delay: 1.074, dur: 1.65 },
      { type: "emoji", emoji: "💫", x: 35, y: 16, size: 12, anim: "blink", delay: 1.993, dur: 1.1 }
    ],
  },
  crab_retro_36_883: {
    v: 1,
    loop: 3.16,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 58, y: 50, size: 43, anim: "heartbeat", dur: 2.35 },
      { type: "emoji", emoji: "🍳", x: 48, y: 17, size: 28, anim: "bounce", delay: 0.698, dur: 1.75 },
      { type: "emoji", emoji: "🍰", x: 65, y: 39, size: 26, anim: "float", delay: 0.563, dur: 1.7 },
      { type: "emoji", emoji: "🌟", x: 66, y: 39, size: 22, anim: "rise", delay: 1.483, dur: 1.5 },
      { type: "emoji", emoji: "⭐", x: 58, y: 42, size: 15, anim: "blink", delay: 1.923, dur: 1.09 },
      { type: "emoji", emoji: "🌟", x: 34, y: 70, size: 12, anim: "blink", delay: 1.8, dur: 1.47 }
    ],
  },
  crab_cyber_36_884: {
    v: 1,
    loop: 3.91,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#673ab7", opacity: 0.53, anim: "float", dur: 3.29, w: 109.01, h: 18.84 },
      { type: "emoji", emoji: "🦀", x: 53, y: 55, size: 34, anim: "float", dur: 3.55 },
      { type: "emoji", emoji: "👑", x: 50, y: 15, size: 29, anim: "bounce", delay: 0.547, dur: 1.9 },
      { type: "emoji", emoji: "🎁", x: 73, y: 39, size: 24, anim: "pop", delay: 0.784, dur: 1.49 },
      { type: "emoji", emoji: "🌸", x: 73, y: 57, size: 20, anim: "rise", delay: 1.026, dur: 2.36 },
      { type: "emoji", emoji: "✨", x: 49, y: 37, size: 19, anim: "float", delay: 0.767, dur: 1.32 },
      { type: "emoji", emoji: "❤️", x: 39, y: 59, size: 21, anim: "blink", delay: 0.99, dur: 2.02 },
      { type: "emoji", emoji: "🎈", x: 20, y: 84, size: 24, anim: "blink", delay: 0.475, dur: 1.85 },
      { type: "emoji", emoji: "❤️", x: 27, y: 40, size: 15, anim: "pop", delay: 0.92, dur: 1.84 },
      { type: "emoji", emoji: "⭐", x: 56, y: 65, size: 16, anim: "blink", delay: 1.871, dur: 1.25 },
      { type: "emoji", emoji: "💖", x: 67, y: 36, size: 11, anim: "blink", delay: 1.635, dur: 1.05 }
    ],
  },
  crab_nature_36_885: {
    v: 1,
    loop: 2.83,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 65, y: 53, size: 42, anim: "float", dur: 3.04 },
      { type: "emoji", emoji: "👑", x: 49, y: 16, size: 33, anim: "bounce", delay: 0.696, dur: 1.98 },
      { type: "emoji", emoji: "🍩", x: 72, y: 40, size: 25, anim: "blink", delay: 0.836, dur: 1.74 },
      { type: "emoji", emoji: "✨", x: 22, y: 21, size: 22, anim: "pop", delay: 0.1, dur: 1.91 },
      { type: "emoji", emoji: "🌊", x: 81, y: 42, size: 17, anim: "pop", delay: 1.409, dur: 2.11 },
      { type: "emoji", emoji: "🍂", x: 88, y: 65, size: 22, anim: "pop", delay: 0.968, dur: 2.14 },
      { type: "emoji", emoji: "💖", x: 56, y: 74, size: 19, anim: "blink", delay: 1.217, dur: 1.96 },
      { type: "emoji", emoji: "🌟", x: 35, y: 72, size: 16, anim: "blink", delay: 1.62, dur: 1.08 }
    ],
  },
  crab_underwater_36_886: {
    v: 1,
    loop: 2.35,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#c2185b", opacity: 0.54, anim: "wave", dur: 1.86, w: 91.19, h: 18.95 },
      { type: "emoji", emoji: "🦀", x: 36, y: 47, size: 44, anim: "wave", dur: 1.85 },
      { type: "emoji", emoji: "👒", x: 52, y: 13, size: 34, anim: "bounce", delay: 0.513, dur: 1.71 },
      { type: "emoji", emoji: "🍬", x: 71, y: 46, size: 22, anim: "float", delay: 0.692, dur: 1.43 },
      { type: "emoji", emoji: "✨", x: 29, y: 16, size: 20, anim: "rise", delay: 0.245, dur: 1.9 },
      { type: "emoji", emoji: "💫", x: 11, y: 74, size: 20, anim: "wiggle", delay: 1.189, dur: 1.99 },
      { type: "emoji", emoji: "🎉", x: 16, y: 65, size: 23, anim: "wiggle", delay: 0.512, dur: 2.07 },
      { type: "emoji", emoji: "💫", x: 16, y: 17, size: 13, anim: "blink", delay: 0.973, dur: 1.06 },
      { type: "emoji", emoji: "💫", x: 39, y: 81, size: 16, anim: "blink", delay: 1.93, dur: 1.15 }
    ],
  },
  crab_sky_36_887: {
    v: 1,
    loop: 2.1,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#e1bee7", opacity: 0.32, anim: "bounce", dur: 1.45, w: 98.28, h: 18.41 },
      { type: "emoji", emoji: "🦀", x: 44, y: 50, size: 33, anim: "bounce", dur: 1.56 },
      { type: "emoji", emoji: "🍳", x: 52, y: 17, size: 28, anim: "bounce", delay: 0.396, dur: 1.97 },
      { type: "emoji", emoji: "💎", x: 72, y: 41, size: 24, anim: "blink", delay: 0.616, dur: 1.61 },
      { type: "emoji", emoji: "✨", x: 78, y: 53, size: 14, anim: "pop", delay: 1.056, dur: 2.3 },
      { type: "emoji", emoji: "🎊", x: 56, y: 26, size: 12, anim: "wiggle", delay: 1.295, dur: 2.34 },
      { type: "emoji", emoji: "🌟", x: 37, y: 63, size: 10, anim: "blink", delay: 1.139, dur: 1.06 },
      { type: "emoji", emoji: "⭐", x: 71, y: 73, size: 13, anim: "blink", delay: 1.526, dur: 1.07 }
    ],
  },
  crab_party_37_888: {
    v: 1,
    loop: 2.43,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fff9c4", opacity: 0.6, anim: "wiggle", dur: 1.38, r: 41.65 },
      { type: "emoji", emoji: "🦀", x: 34, y: 50, size: 41, anim: "wiggle", dur: 1.47 },
      { type: "emoji", emoji: "🧢", x: 50, y: 15, size: 31, anim: "bounce", delay: 0.644, dur: 1.56 },
      { type: "emoji", emoji: "💎", x: 69, y: 38, size: 23, anim: "float", delay: 0.604, dur: 1.74 },
      { type: "emoji", emoji: "🎈", x: 39, y: 16, size: 23, anim: "pop", delay: 0.609, dur: 1.4 },
      { type: "emoji", emoji: "🌟", x: 76, y: 53, size: 16, anim: "wiggle", delay: 0.444, dur: 2.24 },
      { type: "emoji", emoji: "🔥", x: 52, y: 18, size: 12, anim: "wiggle", delay: 0.832, dur: 2.22 },
      { type: "emoji", emoji: "🎉", x: 43, y: 80, size: 25, anim: "rise", delay: 0.214, dur: 2.05 },
      { type: "emoji", emoji: "💖", x: 70, y: 87, size: 13, anim: "float", delay: 1.419, dur: 1.23 },
      { type: "emoji", emoji: "💫", x: 39, y: 38, size: 17, anim: "blink", delay: 0.578, dur: 1.7 },
      { type: "emoji", emoji: "⭐", x: 27, y: 30, size: 19, anim: "blink", delay: 1.326, dur: 1.68 }
    ],
  },
  crab_beach_37_889: {
    v: 1,
    loop: 3.81,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#303f9f", opacity: 0.54, anim: "breathe", dur: 3.27, r: 40.34 },
      { type: "emoji", emoji: "🦀", x: 57, y: 45, size: 40, anim: "breathe", dur: 3.59 },
      { type: "emoji", emoji: "🤠", x: 48, y: 13, size: 33, anim: "bounce", delay: 0.684, dur: 1.77 },
      { type: "emoji", emoji: "🎈", x: 82, y: 34, size: 18, anim: "float", delay: 0.68, dur: 1.62 },
      { type: "emoji", emoji: "💫", x: 71, y: 45, size: 13, anim: "blink", delay: 0.804, dur: 1.1 },
      { type: "emoji", emoji: "✨", x: 80, y: 68, size: 13, anim: "blink", delay: 0.789, dur: 1.79 }
    ],
  },
  crab_winter_37_890: {
    v: 1,
    loop: 2.63,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#e8f5e9", opacity: 0.65, anim: "pulse", dur: 1.91, w: 93.65, h: 21.51 },
      { type: "emoji", emoji: "🦀", x: 47, y: 53, size: 36, anim: "pulse", dur: 2.07 },
      { type: "emoji", emoji: "🍬", x: 70, y: 43, size: 21, anim: "pop", delay: 0.793, dur: 1.97 },
      { type: "emoji", emoji: "✨", x: 89, y: 27, size: 20, anim: "pop", delay: 0.602, dur: 2.31 },
      { type: "emoji", emoji: "🎈", x: 41, y: 20, size: 14, anim: "blink", delay: 0.374, dur: 1.94 },
      { type: "emoji", emoji: "🌟", x: 38, y: 35, size: 13, anim: "blink", delay: 0.595, dur: 1.56 },
      { type: "emoji", emoji: "💖", x: 81, y: 50, size: 19, anim: "blink", delay: 1.111, dur: 1.87 }
    ],
  },
  crab_spring_37_891: {
    v: 1,
    loop: 2.63,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#0288d1", opacity: 0.63, anim: "pulse", dur: 1.98, r: 43.08 },
      { type: "emoji", emoji: "🦀", x: 55, y: 46, size: 40, anim: "pulse", dur: 2.31 },
      { type: "emoji", emoji: "👑", x: 51, y: 14, size: 33, anim: "bounce", delay: 0.452, dur: 1.73 },
      { type: "emoji", emoji: "🍫", x: 67, y: 46, size: 26, anim: "rise", delay: 0.698, dur: 1.64 },
      { type: "emoji", emoji: "🎈", x: 24, y: 37, size: 21, anim: "pop", delay: 0.58, dur: 1.51 },
      { type: "emoji", emoji: "🎈", x: 83, y: 32, size: 20, anim: "pop", delay: 1.227, dur: 2.31 },
      { type: "emoji", emoji: "💖", x: 55, y: 72, size: 12, anim: "blink", delay: 1.986, dur: 1.16 },
      { type: "emoji", emoji: "💖", x: 75, y: 27, size: 13, anim: "blink", delay: 0.757, dur: 1.79 }
    ],
  },
  crab_halloween_37_892: {
    v: 1,
    loop: 3.22,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fb8c00", opacity: 0.65, anim: "float", dur: 2.71, w: 105.18, h: 22.36 },
      { type: "emoji", emoji: "🦀", x: 50, y: 45, size: 32, anim: "float", dur: 2.81 },
      { type: "emoji", emoji: "🤠", x: 52, y: 12, size: 32, anim: "bounce", delay: 0.383, dur: 1.9 },
      { type: "emoji", emoji: "🍀", x: 72, y: 44, size: 22, anim: "rise", delay: 0.559, dur: 1.69 },
      { type: "emoji", emoji: "🌊", x: 12, y: 74, size: 20, anim: "pop", delay: 0.707, dur: 1.55 },
      { type: "emoji", emoji: "🎊", x: 61, y: 57, size: 20, anim: "rise", delay: 0.826, dur: 2.25 },
      { type: "emoji", emoji: "⭐", x: 37, y: 30, size: 10, anim: "blink", delay: 0.562, dur: 1.33 },
      { type: "emoji", emoji: "💖", x: 83, y: 32, size: 16, anim: "blink", delay: 0.549, dur: 1.73 }
    ],
  },
  crab_christmas_37_893: {
    v: 1,
    loop: 3.7,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#43a047", opacity: 0.46, anim: "settle", dur: 2.85, r: 44.29 },
      { type: "emoji", emoji: "🦀", x: 49, y: 45, size: 40, anim: "settle", dur: 2.95 },
      { type: "emoji", emoji: "🍩", x: 71, y: 43, size: 27, anim: "pop", delay: 0.516, dur: 1.6 },
      { type: "emoji", emoji: "🔥", x: 73, y: 77, size: 19, anim: "wiggle", delay: 0.394, dur: 2.31 },
      { type: "emoji", emoji: "⭐", x: 11, y: 14, size: 20, anim: "pop", delay: 0.113, dur: 1.37 },
      { type: "emoji", emoji: "🎉", x: 83, y: 49, size: 13, anim: "blink", delay: 1.015, dur: 1.9 },
      { type: "emoji", emoji: "🌟", x: 26, y: 34, size: 11, anim: "blink", delay: 1.837, dur: 1.63 },
      { type: "emoji", emoji: "✨", x: 82, y: 54, size: 15, anim: "blink", delay: 1.254, dur: 1.29 }
    ],
  },
  crab_coding_37_894: {
    v: 1,
    loop: 2.23,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#d1c4e9", opacity: 0.32, anim: "bounce", dur: 1.13, r: 45.74 },
      { type: "emoji", emoji: "🦀", x: 70, y: 51, size: 37, anim: "bounce", dur: 1.27 },
      { type: "emoji", emoji: "🧣", x: 50, y: 58, size: 24, anim: "bounce", delay: 0.652, dur: 1.58 },
      { type: "emoji", emoji: "🍩", x: 72, y: 42, size: 25, anim: "pop", delay: 0.585, dur: 1.61 },
      { type: "emoji", emoji: "🌸", x: 57, y: 50, size: 15, anim: "float", delay: 0.069, dur: 1.34 },
      { type: "emoji", emoji: "⭐", x: 83, y: 14, size: 13, anim: "wiggle", delay: 0.926, dur: 2.26 },
      { type: "emoji", emoji: "✨", x: 71, y: 68, size: 17, anim: "blink", delay: 1.888, dur: 1.46 },
      { type: "emoji", emoji: "💖", x: 33, y: 70, size: 12, anim: "blink", delay: 1.259, dur: 1.73 }
    ],
  },
  crab_music_37_895: {
    v: 1,
    loop: 3.1,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ff5722", opacity: 0.56, anim: "twinkle", dur: 2.45, w: 94.52, h: 22.84 },
      { type: "emoji", emoji: "🦀", x: 31, y: 53, size: 37, anim: "twinkle", dur: 2.59 },
      { type: "emoji", emoji: "🧙", x: 50, y: 13, size: 32, anim: "bounce", delay: 0.394, dur: 1.98 },
      { type: "emoji", emoji: "🍃", x: 49, y: 12, size: 19, anim: "rise", delay: 1.227, dur: 2.02 },
      { type: "emoji", emoji: "💖", x: 41, y: 31, size: 14, anim: "pop", delay: 0.045, dur: 1.73 },
      { type: "emoji", emoji: "⭐", x: 69, y: 80, size: 10, anim: "blink", delay: 1.148, dur: 1.01 },
      { type: "emoji", emoji: "💖", x: 56, y: 46, size: 19, anim: "blink", delay: 0.624, dur: 1.11 }
    ],
  },
  crab_sports_37_896: {
    v: 1,
    loop: 3.23,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#c2185b", opacity: 0.58, anim: "float", dur: 3.24, r: 42.5 },
      { type: "emoji", emoji: "🦀", x: 68, y: 55, size: 44, anim: "float", dur: 3.15 },
      { type: "emoji", emoji: "🍄", x: 73, y: 45, size: 26, anim: "float", delay: 0.699, dur: 1.94 },
      { type: "emoji", emoji: "🌸", x: 28, y: 21, size: 22, anim: "float", delay: 1.467, dur: 1.71 },
      { type: "emoji", emoji: "🌟", x: 75, y: 21, size: 15, anim: "wiggle", delay: 0.758, dur: 2.09 },
      { type: "emoji", emoji: "🌟", x: 12, y: 21, size: 25, anim: "rise", delay: 0.217, dur: 1.82 },
      { type: "emoji", emoji: "💖", x: 60, y: 67, size: 11, anim: "blink", delay: 1.785, dur: 1.81 },
      { type: "emoji", emoji: "✨", x: 40, y: 50, size: 17, anim: "blink", delay: 0.982, dur: 1.79 }
    ],
  },
  crab_food_37_897: {
    v: 1,
    loop: 2.43,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 41, y: 53, size: 43, anim: "pop", dur: 1.74 },
      { type: "emoji", emoji: "🧣", x: 50, y: 56, size: 27, anim: "bounce", delay: 0.616, dur: 1.56 },
      { type: "emoji", emoji: "🍫", x: 72, y: 42, size: 25, anim: "float", delay: 0.96, dur: 1.41 },
      { type: "emoji", emoji: "✨", x: 57, y: 40, size: 12, anim: "rise", delay: 1.278, dur: 1.72 },
      { type: "emoji", emoji: "🍂", x: 77, y: 33, size: 17, anim: "wiggle", delay: 0.177, dur: 1.84 },
      { type: "emoji", emoji: "✨", x: 68, y: 88, size: 12, anim: "rise", delay: 0.278, dur: 2.23 },
      { type: "emoji", emoji: "💫", x: 53, y: 89, size: 21, anim: "float", delay: 0.992, dur: 1.94 },
      { type: "emoji", emoji: "🌟", x: 69, y: 41, size: 11, anim: "blink", delay: 1.041, dur: 1.95 },
      { type: "emoji", emoji: "✨", x: 69, y: 15, size: 11, anim: "blink", delay: 1.762, dur: 1.52 }
    ],
  },
  crab_space_37_898: {
    v: 1,
    loop: 2.78,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffeb3b", opacity: 0.35, anim: "heartbeat", dur: 2.52, r: 49.85 },
      { type: "emoji", emoji: "🦀", x: 31, y: 47, size: 36, anim: "heartbeat", dur: 2.36 },
      { type: "emoji", emoji: "🎈", x: 74, y: 77, size: 12, anim: "pop", delay: 1.373, dur: 2.23 },
      { type: "emoji", emoji: "💖", x: 35, y: 80, size: 22, anim: "pop", delay: 0.153, dur: 2.09 },
      { type: "emoji", emoji: "⭐", x: 22, y: 45, size: 11, anim: "blink", delay: 1.604, dur: 1.74 },
      { type: "emoji", emoji: "💫", x: 57, y: 64, size: 10, anim: "blink", delay: 0.929, dur: 1.73 }
    ],
  },
  crab_fantasy_37_899: {
    v: 1,
    loop: 4.08,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#3f51b5", opacity: 0.61, anim: "float", dur: 3.65, w: 96.13, h: 18.33 },
      { type: "emoji", emoji: "🦀", x: 41, y: 46, size: 36, anim: "float", dur: 3.48 },
      { type: "emoji", emoji: "🎉", x: 36, y: 41, size: 17, anim: "rise", delay: 0.418, dur: 1.86 },
      { type: "emoji", emoji: "💖", x: 17, y: 25, size: 19, anim: "float", delay: 1.056, dur: 1.52 },
      { type: "emoji", emoji: "🎉", x: 21, y: 22, size: 13, anim: "pop", delay: 1.214, dur: 1.73 },
      { type: "emoji", emoji: "🔥", x: 58, y: 27, size: 19, anim: "float", delay: 0.86, dur: 1.21 },
      { type: "emoji", emoji: "🌿", x: 77, y: 22, size: 18, anim: "wiggle", delay: 0.668, dur: 1.34 },
      { type: "emoji", emoji: "💖", x: 50, y: 28, size: 13, anim: "blink", delay: 1.733, dur: 1.51 },
      { type: "emoji", emoji: "💖", x: 30, y: 54, size: 19, anim: "blink", delay: 1.856, dur: 1.82 }
    ],
  },
  crab_office_37_900: {
    v: 1,
    loop: 3.17,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffe6e6", opacity: 0.66, anim: "float", dur: 2.85, w: 93.09, h: 18.4 },
      { type: "emoji", emoji: "🦀", x: 33, y: 47, size: 33, anim: "float", dur: 3 },
      { type: "emoji", emoji: "🍬", x: 74, y: 47, size: 22, anim: "float", delay: 0.811, dur: 1.68 },
      { type: "emoji", emoji: "💖", x: 49, y: 35, size: 23, anim: "blink", delay: 1.076, dur: 1.3 },
      { type: "emoji", emoji: "🍂", x: 81, y: 54, size: 16, anim: "pop", delay: 1.271, dur: 1.69 },
      { type: "emoji", emoji: "🍂", x: 16, y: 56, size: 22, anim: "float", delay: 0.742, dur: 1.27 },
      { type: "emoji", emoji: "⭐", x: 41, y: 50, size: 25, anim: "float", delay: 0.86, dur: 1.71 },
      { type: "emoji", emoji: "🌟", x: 47, y: 76, size: 19, anim: "blink", delay: 1.261, dur: 1.04 },
      { type: "emoji", emoji: "⭐", x: 55, y: 71, size: 10, anim: "blink", delay: 1.551, dur: 1.6 }
    ],
  },
  crab_fitness_37_901: {
    v: 1,
    loop: 2.62,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 60, y: 56, size: 33, anim: "wave", dur: 1.7 },
      { type: "emoji", emoji: "🪖", x: 50, y: 18, size: 30, anim: "bounce", delay: 0.667, dur: 1.66 },
      { type: "emoji", emoji: "🌻", x: 68, y: 42, size: 27, anim: "blink", delay: 0.422, dur: 1.59 },
      { type: "emoji", emoji: "✨", x: 57, y: 24, size: 18, anim: "blink", delay: 0.302, dur: 2.22 },
      { type: "emoji", emoji: "🍃", x: 25, y: 22, size: 18, anim: "rise", delay: 1.035, dur: 2.32 },
      { type: "emoji", emoji: "⭐", x: 30, y: 86, size: 24, anim: "pop", delay: 1.345, dur: 1.69 },
      { type: "emoji", emoji: "🎈", x: 58, y: 72, size: 21, anim: "wiggle", delay: 0.987, dur: 2.27 },
      { type: "emoji", emoji: "🌟", x: 18, y: 34, size: 19, anim: "blink", delay: 0.877, dur: 1.4 },
      { type: "emoji", emoji: "🌟", x: 72, y: 75, size: 18, anim: "blink", delay: 0.875, dur: 1.7 }
    ],
  },
  crab_travel_37_902: {
    v: 1,
    loop: 1.84,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 51, y: 48, size: 44, anim: "bounce", dur: 1.36 },
      { type: "emoji", emoji: "🎓", x: 48, y: 15, size: 27, anim: "bounce", delay: 0.413, dur: 1.82 },
      { type: "emoji", emoji: "🎈", x: 72, y: 29, size: 27, anim: "pop", delay: 0.562, dur: 1.45 },
      { type: "emoji", emoji: "⭐", x: 82, y: 19, size: 13, anim: "wiggle", delay: 0.372, dur: 1.24 },
      { type: "emoji", emoji: "🎊", x: 29, y: 39, size: 19, anim: "float", delay: 0.744, dur: 1.78 },
      { type: "emoji", emoji: "💖", x: 22, y: 12, size: 24, anim: "rise", delay: 0.236, dur: 1.38 },
      { type: "emoji", emoji: "💖", x: 70, y: 48, size: 15, anim: "blink", delay: 0.58, dur: 1.17 },
      { type: "emoji", emoji: "✨", x: 34, y: 30, size: 10, anim: "blink", delay: 0.515, dur: 1.42 }
    ],
  },
  crab_art_37_903: {
    v: 1,
    loop: 2.36,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#4caf50", opacity: 0.42, anim: "wiggle", dur: 1.65, r: 45.11 },
      { type: "emoji", emoji: "🦀", x: 59, y: 46, size: 34, anim: "wiggle", dur: 1.39 },
      { type: "emoji", emoji: "🤠", x: 49, y: 15, size: 30, anim: "bounce", delay: 0.329, dur: 1.58 },
      { type: "emoji", emoji: "💫", x: 14, y: 62, size: 24, anim: "blink", delay: 0.837, dur: 1.41 },
      { type: "emoji", emoji: "🌊", x: 28, y: 15, size: 23, anim: "blink", delay: 1.122, dur: 1.63 },
      { type: "emoji", emoji: "⭐", x: 88, y: 33, size: 22, anim: "wiggle", delay: 0.514, dur: 1.33 },
      { type: "emoji", emoji: "🌿", x: 34, y: 32, size: 15, anim: "blink", delay: 0.748, dur: 1.56 },
      { type: "emoji", emoji: "🌟", x: 42, y: 63, size: 11, anim: "blink", delay: 1.457, dur: 1.46 },
      { type: "emoji", emoji: "💫", x: 42, y: 77, size: 12, anim: "blink", delay: 0.669, dur: 1.14 }
    ],
  },
  crab_science_37_904: {
    v: 1,
    loop: 3.99,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#5e35b1", opacity: 0.6, anim: "breathe", dur: 3.29, w: 91.26, h: 25.11 },
      { type: "emoji", emoji: "🦀", x: 31, y: 49, size: 33, anim: "breathe", dur: 3.49 },
      { type: "emoji", emoji: "🍃", x: 86, y: 63, size: 19, anim: "pop", delay: 0.818, dur: 1.63 },
      { type: "emoji", emoji: "🌟", x: 45, y: 86, size: 18, anim: "pop", delay: 1.353, dur: 2.23 },
      { type: "emoji", emoji: "🎉", x: 50, y: 62, size: 15, anim: "blink", delay: 0.603, dur: 1.97 },
      { type: "emoji", emoji: "💖", x: 57, y: 53, size: 19, anim: "blink", delay: 0.747, dur: 1.63 },
      { type: "emoji", emoji: "✨", x: 19, y: 28, size: 17, anim: "blink", delay: 0.625, dur: 1.98 }
    ],
  },
  crab_pets_37_905: {
    v: 1,
    loop: 2.89,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ff8a65", opacity: 0.68, anim: "pulse", dur: 1.82, w: 103.74, h: 26.67 },
      { type: "emoji", emoji: "🦀", x: 49, y: 52, size: 33, anim: "pulse", dur: 1.94 },
      { type: "emoji", emoji: "🕶️", x: 49, y: 27, size: 30, anim: "bounce", delay: 0.409, dur: 1.84 },
      { type: "emoji", emoji: "🌹", x: 69, y: 43, size: 26, anim: "rise", delay: 0.881, dur: 1.86 },
      { type: "emoji", emoji: "🌿", x: 68, y: 21, size: 13, anim: "blink", delay: 1.271, dur: 2.08 },
      { type: "emoji", emoji: "❤️", x: 30, y: 74, size: 18, anim: "rise", delay: 0.703, dur: 2.15 },
      { type: "emoji", emoji: "❄️", x: 78, y: 26, size: 15, anim: "pop", delay: 0.24, dur: 2.18 },
      { type: "emoji", emoji: "🌟", x: 48, y: 76, size: 14, anim: "blink", delay: 1.488, dur: 1.66 },
      { type: "emoji", emoji: "⭐", x: 17, y: 41, size: 18, anim: "blink", delay: 0.874, dur: 1.61 }
    ],
  },
  crab_magic_37_906: {
    v: 1,
    loop: 2.4,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#c2185b", opacity: 0.5, anim: "pulse", dur: 2.25, w: 98.95, h: 26 },
      { type: "emoji", emoji: "🦀", x: 63, y: 55, size: 34, anim: "pulse", dur: 2.22 },
      { type: "emoji", emoji: "👒", x: 49, y: 14, size: 32, anim: "bounce", delay: 0.582, dur: 1.96 },
      { type: "emoji", emoji: "🍬", x: 70, y: 42, size: 23, anim: "float", delay: 0.66, dur: 1.52 },
      { type: "emoji", emoji: "🌿", x: 36, y: 60, size: 16, anim: "float", delay: 0.043, dur: 1.93 },
      { type: "emoji", emoji: "💫", x: 69, y: 55, size: 17, anim: "rise", delay: 0.507, dur: 1.66 },
      { type: "emoji", emoji: "❤️", x: 22, y: 49, size: 13, anim: "float", delay: 0.705, dur: 1.43 },
      { type: "emoji", emoji: "⭐", x: 82, y: 73, size: 15, anim: "blink", delay: 1.293, dur: 1.73 },
      { type: "emoji", emoji: "⭐", x: 33, y: 76, size: 12, anim: "blink", delay: 1.772, dur: 1.47 }
    ],
  },
  crab_retro_37_907: {
    v: 1,
    loop: 3.1,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 58, y: 49, size: 37, anim: "float", dur: 2.79 },
      { type: "emoji", emoji: "🧢", x: 50, y: 17, size: 28, anim: "bounce", delay: 0.46, dur: 1.82 },
      { type: "emoji", emoji: "🔥", x: 37, y: 88, size: 12, anim: "blink", delay: 1.246, dur: 1.4 },
      { type: "emoji", emoji: "✨", x: 32, y: 47, size: 21, anim: "pop", delay: 0.78, dur: 1.63 },
      { type: "emoji", emoji: "🌿", x: 75, y: 58, size: 25, anim: "pop", delay: 1.423, dur: 2.16 },
      { type: "emoji", emoji: "❄️", x: 71, y: 28, size: 13, anim: "rise", delay: 0.428, dur: 2.24 },
      { type: "emoji", emoji: "✨", x: 79, y: 75, size: 13, anim: "blink", delay: 1.32, dur: 1.43 },
      { type: "emoji", emoji: "🌟", x: 75, y: 31, size: 12, anim: "blink", delay: 1.753, dur: 1.39 }
    ],
  },
  crab_cyber_37_908: {
    v: 1,
    loop: 3.29,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fff176", opacity: 0.63, anim: "settle", dur: 2.76, r: 40.66 },
      { type: "emoji", emoji: "🦀", x: 31, y: 45, size: 37, anim: "settle", dur: 3.04 },
      { type: "emoji", emoji: "🍳", x: 52, y: 14, size: 29, anim: "bounce", delay: 0.529, dur: 1.65 },
      { type: "emoji", emoji: "💖", x: 28, y: 80, size: 24, anim: "blink", delay: 1.422, dur: 2.19 },
      { type: "emoji", emoji: "💖", x: 27, y: 23, size: 11, anim: "blink", delay: 0.694, dur: 1.34 },
      { type: "emoji", emoji: "⭐", x: 60, y: 49, size: 16, anim: "blink", delay: 1.73, dur: 1.5 }
    ],
  },
  crab_nature_37_909: {
    v: 1,
    loop: 1.98,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#5c6bc0", opacity: 0.44, anim: "bounce", dur: 1.19, r: 48.21 },
      { type: "emoji", emoji: "🦀", x: 52, y: 47, size: 44, anim: "bounce", dur: 1.41 },
      { type: "emoji", emoji: "🧙", x: 50, y: 10, size: 33, anim: "bounce", delay: 0.613, dur: 2 },
      { type: "emoji", emoji: "🍬", x: 71, y: 46, size: 22, anim: "rise", delay: 0.982, dur: 1.72 },
      { type: "emoji", emoji: "✨", x: 42, y: 67, size: 16, anim: "pop", delay: 0.621, dur: 1.44 },
      { type: "emoji", emoji: "🍃", x: 76, y: 57, size: 14, anim: "rise", delay: 1.428, dur: 1.87 },
      { type: "emoji", emoji: "🎊", x: 55, y: 19, size: 12, anim: "wiggle", delay: 1.224, dur: 1.9 },
      { type: "emoji", emoji: "❄️", x: 69, y: 29, size: 12, anim: "rise", delay: 0.043, dur: 2.13 },
      { type: "emoji", emoji: "💫", x: 71, y: 61, size: 21, anim: "pop", delay: 1.233, dur: 1.4 },
      { type: "emoji", emoji: "⭐", x: 27, y: 27, size: 14, anim: "blink", delay: 1.367, dur: 1.99 },
      { type: "emoji", emoji: "⭐", x: 49, y: 35, size: 18, anim: "blink", delay: 1.82, dur: 1.47 }
    ],
  },
  crab_underwater_37_910: {
    v: 1,
    loop: 3,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 67, y: 53, size: 41, anim: "twinkle", dur: 2.45 },
      { type: "emoji", emoji: "👒", x: 52, y: 13, size: 32, anim: "bounce", delay: 0.671, dur: 1.63 },
      { type: "emoji", emoji: "🌊", x: 24, y: 45, size: 12, anim: "blink", delay: 1.117, dur: 2.34 },
      { type: "emoji", emoji: "❤️", x: 76, y: 16, size: 24, anim: "wiggle", delay: 1.205, dur: 1.39 },
      { type: "emoji", emoji: "🍂", x: 60, y: 47, size: 13, anim: "float", delay: 0.926, dur: 1.52 },
      { type: "emoji", emoji: "💫", x: 34, y: 41, size: 19, anim: "blink", delay: 1.103, dur: 1.93 },
      { type: "emoji", emoji: "⭐", x: 21, y: 27, size: 12, anim: "blink", delay: 1.178, dur: 1.24 }
    ],
  },
  crab_sky_37_911: {
    v: 1,
    loop: 3.12,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#29b6f6", opacity: 0.51, anim: "float", dur: 2.94, w: 108.67, h: 26.34 },
      { type: "emoji", emoji: "🦀", x: 69, y: 53, size: 41, anim: "float", dur: 2.98 },
      { type: "emoji", emoji: "🕶️", x: 52, y: 29, size: 30, anim: "bounce", delay: 0.538, dur: 1.82 },
      { type: "emoji", emoji: "🍰", x: 69, y: 43, size: 28, anim: "float", delay: 0.734, dur: 1.77 },
      { type: "emoji", emoji: "⭐", x: 15, y: 55, size: 13, anim: "pop", delay: 1.273, dur: 1.96 },
      { type: "emoji", emoji: "🎈", x: 52, y: 64, size: 25, anim: "float", delay: 1.157, dur: 1.58 },
      { type: "emoji", emoji: "🌟", x: 63, y: 75, size: 13, anim: "blink", delay: 0.871, dur: 1.45 },
      { type: "emoji", emoji: "✨", x: 33, y: 77, size: 11, anim: "blink", delay: 1.845, dur: 1.55 }
    ],
  },
  crab_party_38_912: {
    v: 1,
    loop: 2.44,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fb8c00", opacity: 0.65, anim: "pop", dur: 1.56, r: 41.87 },
      { type: "emoji", emoji: "🦀", x: 37, y: 51, size: 37, anim: "pop", dur: 1.53 },
      { type: "emoji", emoji: "🌊", x: 57, y: 52, size: 23, anim: "float", delay: 1.356, dur: 1.79 },
      { type: "emoji", emoji: "🎊", x: 88, y: 62, size: 14, anim: "blink", delay: 0.356, dur: 2.35 },
      { type: "emoji", emoji: "💖", x: 15, y: 24, size: 12, anim: "blink", delay: 1.249, dur: 2 },
      { type: "emoji", emoji: "🌟", x: 24, y: 72, size: 18, anim: "blink", delay: 0.799, dur: 1.34 },
      { type: "emoji", emoji: "💖", x: 36, y: 17, size: 15, anim: "blink", delay: 0.734, dur: 1.66 },
      { type: "emoji", emoji: "💖", x: 59, y: 61, size: 17, anim: "blink", delay: 0.992, dur: 2 }
    ],
  },
  crab_beach_38_913: {
    v: 1,
    loop: 2.76,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 42, y: 50, size: 42, anim: "heartbeat", dur: 2.62 },
      { type: "emoji", emoji: "👑", x: 51, y: 13, size: 28, anim: "bounce", delay: 0.632, dur: 1.57 },
      { type: "emoji", emoji: "🌿", x: 84, y: 41, size: 16, anim: "pop", delay: 0.786, dur: 2.18 },
      { type: "emoji", emoji: "🎊", x: 55, y: 18, size: 20, anim: "blink", delay: 0.1, dur: 2.31 },
      { type: "emoji", emoji: "🎉", x: 46, y: 58, size: 21, anim: "rise", delay: 1.275, dur: 1.44 },
      { type: "emoji", emoji: "❤️", x: 25, y: 55, size: 19, anim: "float", delay: 1.405, dur: 2.32 },
      { type: "emoji", emoji: "✨", x: 89, y: 49, size: 22, anim: "wiggle", delay: 0.461, dur: 1.71 },
      { type: "emoji", emoji: "⭐", x: 43, y: 80, size: 19, anim: "blink", delay: 1.51, dur: 1.99 },
      { type: "emoji", emoji: "🌟", x: 55, y: 40, size: 17, anim: "blink", delay: 1.162, dur: 1.84 }
    ],
  },
  crab_winter_38_914: {
    v: 1,
    loop: 3.98,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ede7f6", opacity: 0.67, anim: "float", dur: 3.38, w: 90.02, h: 20.37 },
      { type: "emoji", emoji: "🦀", x: 63, y: 50, size: 34, anim: "float", dur: 3.54 },
      { type: "emoji", emoji: "🌻", x: 72, y: 42, size: 28, anim: "pop", delay: 0.942, dur: 1.55 },
      { type: "emoji", emoji: "🍃", x: 20, y: 14, size: 15, anim: "pop", delay: 0.923, dur: 1.77 },
      { type: "emoji", emoji: "🍂", x: 49, y: 54, size: 17, anim: "blink", delay: 0.533, dur: 1.23 },
      { type: "emoji", emoji: "🔥", x: 80, y: 47, size: 19, anim: "blink", delay: 1.377, dur: 1.68 },
      { type: "emoji", emoji: "💫", x: 88, y: 27, size: 19, anim: "float", delay: 1.107, dur: 2.22 },
      { type: "emoji", emoji: "⭐", x: 30, y: 47, size: 15, anim: "blink", delay: 1.762, dur: 1.43 },
      { type: "emoji", emoji: "💖", x: 75, y: 40, size: 13, anim: "blink", delay: 1.344, dur: 1.19 }
    ],
  },
  crab_spring_38_915: {
    v: 1,
    loop: 2.91,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ffab91", opacity: 0.54, anim: "float", dur: 2.76, r: 46.08 },
      { type: "emoji", emoji: "🦀", x: 59, y: 55, size: 37, anim: "float", dur: 2.89 },
      { type: "emoji", emoji: "🍀", x: 70, y: 43, size: 23, anim: "float", delay: 0.434, dur: 1.52 },
      { type: "emoji", emoji: "💫", x: 10, y: 35, size: 22, anim: "rise", delay: 0.993, dur: 1.39 },
      { type: "emoji", emoji: "🌿", x: 10, y: 87, size: 18, anim: "float", delay: 0.718, dur: 1.29 },
      { type: "emoji", emoji: "🎊", x: 88, y: 17, size: 21, anim: "wiggle", delay: 1.5, dur: 1.91 },
      { type: "emoji", emoji: "🍃", x: 84, y: 84, size: 13, anim: "blink", delay: 0.694, dur: 1.44 },
      { type: "emoji", emoji: "⭐", x: 52, y: 68, size: 13, anim: "blink", delay: 0.88, dur: 1.55 },
      { type: "emoji", emoji: "⭐", x: 36, y: 84, size: 16, anim: "blink", delay: 1.365, dur: 1.23 }
    ],
  },
  crab_halloween_38_916: {
    v: 1,
    loop: 2.46,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f8bbd0", opacity: 0.6, anim: "wave", dur: 1.76, r: 45.29 },
      { type: "emoji", emoji: "🦀", x: 37, y: 46, size: 42, anim: "wave", dur: 1.75 },
      { type: "emoji", emoji: "💌", x: 70, y: 41, size: 27, anim: "float", delay: 0.89, dur: 1.66 },
      { type: "emoji", emoji: "🎈", x: 60, y: 50, size: 12, anim: "pop", delay: 1.321, dur: 1.3 },
      { type: "emoji", emoji: "🍂", x: 16, y: 65, size: 16, anim: "rise", delay: 0.212, dur: 1.99 },
      { type: "emoji", emoji: "🎊", x: 52, y: 54, size: 22, anim: "rise", delay: 0.793, dur: 1.92 },
      { type: "emoji", emoji: "🌟", x: 18, y: 84, size: 12, anim: "blink", delay: 1.039, dur: 1.52 },
      { type: "emoji", emoji: "💫", x: 26, y: 67, size: 18, anim: "blink", delay: 1.36, dur: 1.59 }
    ],
  },
  crab_christmas_38_917: {
    v: 1,
    loop: 2.02,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#f3e5f5", opacity: 0.46, anim: "bounce", dur: 1.58, w: 96.93, h: 18.86 },
      { type: "emoji", emoji: "🦀", x: 70, y: 47, size: 43, anim: "bounce", dur: 1.65 },
      { type: "emoji", emoji: "🍩", x: 72, y: 41, size: 26, anim: "float", delay: 0.635, dur: 1.6 },
      { type: "emoji", emoji: "🔥", x: 87, y: 79, size: 14, anim: "pop", delay: 0.887, dur: 1.81 },
      { type: "emoji", emoji: "💖", x: 60, y: 75, size: 13, anim: "pop", delay: 0.942, dur: 2.22 },
      { type: "emoji", emoji: "❄️", x: 35, y: 83, size: 13, anim: "wiggle", delay: 0.505, dur: 2.28 },
      { type: "emoji", emoji: "💖", x: 82, y: 75, size: 15, anim: "wiggle", delay: 1.207, dur: 1.64 },
      { type: "emoji", emoji: "✨", x: 79, y: 61, size: 12, anim: "blink", delay: 0.659, dur: 1.43 },
      { type: "emoji", emoji: "🌟", x: 73, y: 39, size: 17, anim: "blink", delay: 0.555, dur: 1.62 }
    ],
  },
  crab_coding_38_918: {
    v: 1,
    loop: 2.01,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fffde7", opacity: 0.64, anim: "wiggle", dur: 1.17, r: 48.88 },
      { type: "emoji", emoji: "🦀", x: 58, y: 54, size: 33, anim: "wiggle", dur: 1.54 },
      { type: "emoji", emoji: "👑", x: 52, y: 15, size: 31, anim: "bounce", delay: 0.403, dur: 1.77 },
      { type: "emoji", emoji: "💌", x: 72, y: 39, size: 25, anim: "pop", delay: 0.571, dur: 1.99 },
      { type: "emoji", emoji: "🌊", x: 86, y: 41, size: 19, anim: "blink", delay: 0.16, dur: 1.65 },
      { type: "emoji", emoji: "🎈", x: 60, y: 67, size: 23, anim: "blink", delay: 0.314, dur: 2.17 },
      { type: "emoji", emoji: "🌸", x: 42, y: 66, size: 21, anim: "wiggle", delay: 0.766, dur: 2.18 },
      { type: "emoji", emoji: "🍂", x: 74, y: 49, size: 15, anim: "wiggle", delay: 1.314, dur: 1.6 },
      { type: "emoji", emoji: "⭐", x: 34, y: 28, size: 14, anim: "blink", delay: 1.646, dur: 1.93 },
      { type: "emoji", emoji: "✨", x: 68, y: 83, size: 19, anim: "blink", delay: 1.014, dur: 1.65 }
    ],
  },
  crab_music_38_919: {
    v: 1,
    loop: 3.94,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#9fa8da", opacity: 0.69, anim: "breathe", dur: 3.47, r: 46.71 },
      { type: "emoji", emoji: "🦀", x: 59, y: 45, size: 35, anim: "breathe", dur: 3.54 },
      { type: "emoji", emoji: "✨", x: 24, y: 43, size: 20, anim: "pop", delay: 0.98, dur: 1.28 },
      { type: "emoji", emoji: "❤️", x: 42, y: 33, size: 24, anim: "float", delay: 0.078, dur: 2.22 },
      { type: "emoji", emoji: "🌿", x: 39, y: 34, size: 15, anim: "wiggle", delay: 0.559, dur: 1.25 },
      { type: "emoji", emoji: "🔥", x: 51, y: 50, size: 19, anim: "wiggle", delay: 1.384, dur: 1.56 },
      { type: "emoji", emoji: "🌟", x: 52, y: 50, size: 13, anim: "blink", delay: 1.143, dur: 1.53 },
      { type: "emoji", emoji: "✨", x: 77, y: 77, size: 19, anim: "blink", delay: 0.689, dur: 1.97 }
    ],
  },
  crab_sports_38_920: {
    v: 1,
    loop: 2.8,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 39, y: 54, size: 33, anim: "pulse", dur: 2.02 },
      { type: "emoji", emoji: "✨", x: 46, y: 34, size: 25, anim: "wiggle", delay: 0.892, dur: 1.23 },
      { type: "emoji", emoji: "🍃", x: 54, y: 79, size: 23, anim: "wiggle", delay: 1.281, dur: 1.87 },
      { type: "emoji", emoji: "🌟", x: 81, y: 61, size: 16, anim: "blink", delay: 1.001, dur: 1.22 },
      { type: "emoji", emoji: "💫", x: 58, y: 38, size: 12, anim: "blink", delay: 1.299, dur: 1.02 }
    ],
  },
  crab_food_38_921: {
    v: 1,
    loop: 2.64,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#81d4fa", opacity: 0.47, anim: "pulse", dur: 2.23, r: 42.29 },
      { type: "emoji", emoji: "🦀", x: 31, y: 49, size: 37, anim: "pulse", dur: 2.18 },
      { type: "emoji", emoji: "🧙", x: 52, y: 12, size: 35, anim: "bounce", delay: 0.616, dur: 1.63 },
      { type: "emoji", emoji: "🍬", x: 75, y: 41, size: 23, anim: "blink", delay: 0.698, dur: 1.81 },
      { type: "emoji", emoji: "🌊", x: 43, y: 43, size: 22, anim: "float", delay: 0.747, dur: 1.51 },
      { type: "emoji", emoji: "🍂", x: 69, y: 23, size: 15, anim: "rise", delay: 1.424, dur: 2.09 },
      { type: "emoji", emoji: "💫", x: 18, y: 29, size: 22, anim: "pop", delay: 1.36, dur: 1.67 },
      { type: "emoji", emoji: "❄️", x: 60, y: 84, size: 19, anim: "wiggle", delay: 1.11, dur: 2.18 },
      { type: "emoji", emoji: "⭐", x: 59, y: 30, size: 10, anim: "blink", delay: 1.235, dur: 1.57 },
      { type: "emoji", emoji: "⭐", x: 45, y: 67, size: 14, anim: "blink", delay: 0.798, dur: 1.12 }
    ],
  },
  crab_space_38_922: {
    v: 1,
    loop: 3.09,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 42, y: 48, size: 34, anim: "float", dur: 2.85 },
      { type: "emoji", emoji: "🍫", x: 70, y: 42, size: 27, anim: "pop", delay: 0.676, dur: 1.86 },
      { type: "emoji", emoji: "❄️", x: 82, y: 89, size: 20, anim: "pop", delay: 0.815, dur: 2.39 },
      { type: "emoji", emoji: "🎊", x: 28, y: 57, size: 24, anim: "float", delay: 0.82, dur: 1.3 },
      { type: "emoji", emoji: "🎈", x: 41, y: 55, size: 19, anim: "pop", delay: 1.053, dur: 1.43 },
      { type: "emoji", emoji: "🍂", x: 74, y: 52, size: 21, anim: "float", delay: 0.605, dur: 1.53 },
      { type: "emoji", emoji: "✨", x: 26, y: 34, size: 14, anim: "blink", delay: 0.636, dur: 1.46 },
      { type: "emoji", emoji: "🌟", x: 61, y: 64, size: 11, anim: "blink", delay: 0.561, dur: 1.01 }
    ],
  },
  crab_fantasy_38_923: {
    v: 1,
    loop: 3.66,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#a5d6a7", opacity: 0.56, anim: "settle", dur: 3.13, r: 47.28 },
      { type: "emoji", emoji: "🦀", x: 60, y: 50, size: 33, anim: "settle", dur: 3.07 },
      { type: "emoji", emoji: "🍰", x: 67, y: 38, size: 26, anim: "pop", delay: 0.551, dur: 1.93 },
      { type: "emoji", emoji: "🌸", x: 50, y: 33, size: 19, anim: "blink", delay: 0.707, dur: 1.45 },
      { type: "emoji", emoji: "🍂", x: 66, y: 23, size: 25, anim: "wiggle", delay: 1.012, dur: 1.83 },
      { type: "emoji", emoji: "🌟", x: 41, y: 27, size: 17, anim: "blink", delay: 1.012, dur: 1.42 },
      { type: "emoji", emoji: "⭐", x: 32, y: 55, size: 14, anim: "blink", delay: 1.194, dur: 1 }
    ],
  },
  crab_office_38_924: {
    v: 1,
    loop: 2.15,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#7e57c2", opacity: 0.61, anim: "bounce", dur: 1.2, w: 108.47, h: 27.6 },
      { type: "emoji", emoji: "🦀", x: 58, y: 47, size: 43, anim: "bounce", dur: 1.39 },
      { type: "emoji", emoji: "👑", x: 48, y: 12, size: 31, anim: "bounce", delay: 0.528, dur: 1.65 },
      { type: "emoji", emoji: "🌹", x: 73, y: 42, size: 27, anim: "float", delay: 0.939, dur: 1.57 },
      { type: "emoji", emoji: "🎉", x: 82, y: 86, size: 20, anim: "float", delay: 1.137, dur: 1.25 },
      { type: "emoji", emoji: "✨", x: 79, y: 69, size: 17, anim: "wiggle", delay: 0.421, dur: 2.39 },
      { type: "emoji", emoji: "💫", x: 25, y: 77, size: 21, anim: "pop", delay: 0.603, dur: 1.37 },
      { type: "emoji", emoji: "🎉", x: 49, y: 28, size: 18, anim: "wiggle", delay: 1.329, dur: 2.01 },
      { type: "emoji", emoji: "🌿", x: 26, y: 77, size: 24, anim: "pop", delay: 0.707, dur: 1.36 },
      { type: "emoji", emoji: "✨", x: 20, y: 63, size: 10, anim: "blink", delay: 1.292, dur: 1.26 },
      { type: "emoji", emoji: "💫", x: 74, y: 29, size: 17, anim: "blink", delay: 1.408, dur: 1.94 }
    ],
  },
  crab_fitness_38_925: {
    v: 1,
    loop: 2.87,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e64a19", opacity: 0.33, anim: "twinkle", dur: 2.6, r: 47.07 },
      { type: "emoji", emoji: "🦀", x: 35, y: 46, size: 41, anim: "twinkle", dur: 2.39 },
      { type: "emoji", emoji: "👮", x: 51, y: 17, size: 28, anim: "bounce", delay: 0.61, dur: 1.67 },
      { type: "emoji", emoji: "💎", x: 69, y: 40, size: 25, anim: "float", delay: 0.633, dur: 1.98 },
      { type: "emoji", emoji: "💫", x: 28, y: 36, size: 14, anim: "float", delay: 0.784, dur: 2.37 },
      { type: "emoji", emoji: "🌟", x: 39, y: 62, size: 16, anim: "float", delay: 1.061, dur: 1.9 },
      { type: "emoji", emoji: "🎈", x: 38, y: 82, size: 22, anim: "float", delay: 0.507, dur: 1.93 },
      { type: "emoji", emoji: "🌊", x: 70, y: 55, size: 20, anim: "float", delay: 1.423, dur: 1.59 },
      { type: "emoji", emoji: "🎉", x: 85, y: 19, size: 20, anim: "float", delay: 0.583, dur: 1.21 },
      { type: "emoji", emoji: "💖", x: 20, y: 19, size: 12, anim: "blink", delay: 1.273, dur: 1.34 },
      { type: "emoji", emoji: "🌟", x: 51, y: 70, size: 16, anim: "blink", delay: 1.37, dur: 1.7 }
    ],
  },
  crab_travel_38_926: {
    v: 1,
    loop: 3.2,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 66, y: 48, size: 32, anim: "float", dur: 3 },
      { type: "emoji", emoji: "👒", x: 49, y: 15, size: 35, anim: "bounce", delay: 0.576, dur: 1.61 },
      { type: "emoji", emoji: "💝", x: 72, y: 42, size: 26, anim: "rise", delay: 0.783, dur: 1.87 },
      { type: "emoji", emoji: "💫", x: 32, y: 42, size: 17, anim: "wiggle", delay: 0.513, dur: 1.59 },
      { type: "emoji", emoji: "💖", x: 18, y: 75, size: 19, anim: "wiggle", delay: 1.466, dur: 1.52 },
      { type: "emoji", emoji: "⭐", x: 67, y: 55, size: 24, anim: "blink", delay: 0.759, dur: 2.39 },
      { type: "emoji", emoji: "💖", x: 84, y: 30, size: 17, anim: "blink", delay: 1.134, dur: 1.38 },
      { type: "emoji", emoji: "💫", x: 73, y: 15, size: 16, anim: "blink", delay: 1.647, dur: 1.37 }
    ],
  },
  crab_art_38_927: {
    v: 1,
    loop: 2.44,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ba68c8", opacity: 0.48, anim: "pop", dur: 1.8, w: 102.88, h: 27.91 },
      { type: "emoji", emoji: "🦀", x: 67, y: 47, size: 32, anim: "pop", dur: 1.48 },
      { type: "emoji", emoji: "🧢", x: 50, y: 14, size: 30, anim: "bounce", delay: 0.376, dur: 1.6 },
      { type: "emoji", emoji: "🍭", x: 68, y: 38, size: 24, anim: "blink", delay: 0.818, dur: 1.66 },
      { type: "emoji", emoji: "🍂", x: 24, y: 71, size: 20, anim: "rise", delay: 0.721, dur: 1.83 },
      { type: "emoji", emoji: "🍃", x: 60, y: 50, size: 13, anim: "float", delay: 1.312, dur: 1.93 },
      { type: "emoji", emoji: "🎉", x: 70, y: 26, size: 22, anim: "float", delay: 0.594, dur: 1.57 },
      { type: "emoji", emoji: "🌟", x: 24, y: 17, size: 12, anim: "blink", delay: 1.132, dur: 1.55 },
      { type: "emoji", emoji: "✨", x: 41, y: 39, size: 13, anim: "blink", delay: 1.028, dur: 1.04 }
    ],
  },
  crab_science_38_928: {
    v: 1,
    loop: 3.24,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ffee58", opacity: 0.44, anim: "heartbeat", dur: 2.4, w: 97.92, h: 27.73 },
      { type: "emoji", emoji: "🦀", x: 61, y: 46, size: 43, anim: "heartbeat", dur: 2.65 },
      { type: "emoji", emoji: "🧣", x: 50, y: 59, size: 26, anim: "bounce", delay: 0.48, dur: 1.51 },
      { type: "emoji", emoji: "🌸", x: 68, y: 42, size: 25, anim: "pop", delay: 0.452, dur: 1.71 },
      { type: "emoji", emoji: "🍃", x: 48, y: 87, size: 21, anim: "rise", delay: 0.331, dur: 1.21 },
      { type: "emoji", emoji: "🎉", x: 72, y: 59, size: 18, anim: "rise", delay: 1.009, dur: 1.61 },
      { type: "emoji", emoji: "✨", x: 16, y: 74, size: 11, anim: "blink", delay: 1.552, dur: 1.54 },
      { type: "emoji", emoji: "✨", x: 65, y: 61, size: 11, anim: "blink", delay: 1.876, dur: 1.33 }
    ],
  },
  crab_pets_38_929: {
    v: 1,
    loop: 4.03,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#c5cae9", opacity: 0.48, anim: "float", dur: 3.26, w: 94.07, h: 19.03 },
      { type: "emoji", emoji: "🦀", x: 49, y: 51, size: 41, anim: "float", dur: 3.56 },
      { type: "emoji", emoji: "🧣", x: 48, y: 59, size: 26, anim: "bounce", delay: 0.472, dur: 1.99 },
      { type: "emoji", emoji: "🍬", x: 73, y: 44, size: 21, anim: "blink", delay: 0.971, dur: 1.95 },
      { type: "emoji", emoji: "🎊", x: 67, y: 56, size: 23, anim: "wiggle", delay: 1.299, dur: 1.65 },
      { type: "emoji", emoji: "💫", x: 30, y: 39, size: 16, anim: "float", delay: 1.29, dur: 1.79 },
      { type: "emoji", emoji: "🌿", x: 66, y: 72, size: 17, anim: "blink", delay: 0.696, dur: 1.81 },
      { type: "emoji", emoji: "💫", x: 36, y: 52, size: 23, anim: "blink", delay: 1.158, dur: 1.95 },
      { type: "emoji", emoji: "✨", x: 81, y: 32, size: 14, anim: "blink", delay: 1.065, dur: 1.87 },
      { type: "emoji", emoji: "💖", x: 84, y: 17, size: 15, anim: "blink", delay: 0.719, dur: 1.16 }
    ],
  },
  crab_magic_38_930: {
    v: 1,
    loop: 2.92,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#f3e5f5", opacity: 0.53, anim: "float", dur: 2.84, r: 47.67 },
      { type: "emoji", emoji: "🦀", x: 69, y: 55, size: 39, anim: "float", dur: 3.03 },
      { type: "emoji", emoji: "🍄", x: 73, y: 44, size: 25, anim: "pop", delay: 0.585, dur: 1.75 },
      { type: "emoji", emoji: "🍃", x: 64, y: 82, size: 24, anim: "rise", delay: 0.999, dur: 1.24 },
      { type: "emoji", emoji: "❄️", x: 68, y: 10, size: 19, anim: "float", delay: 0.957, dur: 1.78 },
      { type: "emoji", emoji: "🎉", x: 80, y: 49, size: 13, anim: "wiggle", delay: 1.202, dur: 1.45 },
      { type: "emoji", emoji: "✨", x: 67, y: 51, size: 14, anim: "blink", delay: 1.114, dur: 1.09 },
      { type: "emoji", emoji: "✨", x: 82, y: 84, size: 14, anim: "blink", delay: 0.836, dur: 1.5 }
    ],
  },
  crab_retro_38_931: {
    v: 1,
    loop: 2.64,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 50, y: 55, size: 39, anim: "wave", dur: 1.95 },
      { type: "emoji", emoji: "🧣", x: 48, y: 57, size: 27, anim: "bounce", delay: 0.337, dur: 1.89 },
      { type: "emoji", emoji: "🍃", x: 62, y: 61, size: 18, anim: "wiggle", delay: 0.402, dur: 1.89 },
      { type: "emoji", emoji: "🌸", x: 85, y: 65, size: 17, anim: "wiggle", delay: 1.139, dur: 2.08 },
      { type: "emoji", emoji: "🎊", x: 14, y: 27, size: 14, anim: "float", delay: 1.29, dur: 1.92 },
      { type: "emoji", emoji: "🍂", x: 48, y: 23, size: 16, anim: "float", delay: 0.595, dur: 1.25 },
      { type: "emoji", emoji: "🍂", x: 22, y: 46, size: 14, anim: "rise", delay: 0.226, dur: 1.32 },
      { type: "emoji", emoji: "✨", x: 65, y: 22, size: 12, anim: "blink", delay: 1.883, dur: 1.32 },
      { type: "emoji", emoji: "💫", x: 80, y: 60, size: 12, anim: "blink", delay: 1.855, dur: 1.88 }
    ],
  },
  crab_cyber_38_932: {
    v: 1,
    loop: 2.19,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ff9800", opacity: 0.34, anim: "bounce", dur: 1.66, w: 100.52, h: 21.16 },
      { type: "emoji", emoji: "🦀", x: 57, y: 55, size: 35, anim: "bounce", dur: 1.48 },
      { type: "emoji", emoji: "🎓", x: 49, y: 17, size: 28, anim: "bounce", delay: 0.662, dur: 1.77 },
      { type: "emoji", emoji: "🌿", x: 77, y: 29, size: 14, anim: "wiggle", delay: 1.375, dur: 1.92 },
      { type: "emoji", emoji: "🔥", x: 42, y: 17, size: 12, anim: "blink", delay: 1.328, dur: 1.27 },
      { type: "emoji", emoji: "🎈", x: 78, y: 58, size: 18, anim: "pop", delay: 0.647, dur: 2.2 },
      { type: "emoji", emoji: "💖", x: 84, y: 51, size: 17, anim: "blink", delay: 1.172, dur: 1.16 },
      { type: "emoji", emoji: "🌟", x: 71, y: 17, size: 12, anim: "blink", delay: 0.769, dur: 1.93 }
    ],
  },
  crab_nature_38_933: {
    v: 1,
    loop: 2.39,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#43a047", opacity: 0.63, anim: "wiggle", dur: 1.43, w: 95.4, h: 25.06 },
      { type: "emoji", emoji: "🦀", x: 54, y: 50, size: 39, anim: "wiggle", dur: 1.4 },
      { type: "emoji", emoji: "🧣", x: 51, y: 59, size: 25, anim: "bounce", delay: 0.531, dur: 1.6 },
      { type: "emoji", emoji: "🌹", x: 68, y: 39, size: 28, anim: "pop", delay: 0.584, dur: 1.85 },
      { type: "emoji", emoji: "💫", x: 69, y: 30, size: 24, anim: "wiggle", delay: 1.436, dur: 2.35 },
      { type: "emoji", emoji: "⭐", x: 73, y: 79, size: 22, anim: "rise", delay: 0.619, dur: 2.18 },
      { type: "emoji", emoji: "💖", x: 30, y: 66, size: 10, anim: "blink", delay: 0.889, dur: 1.96 },
      { type: "emoji", emoji: "💖", x: 65, y: 46, size: 12, anim: "blink", delay: 0.731, dur: 1.69 }
    ],
  },
  crab_underwater_38_934: {
    v: 1,
    loop: 4.13,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#673ab7", opacity: 0.36, anim: "breathe", dur: 3.67, w: 106.67, h: 26.88 },
      { type: "emoji", emoji: "🦀", x: 52, y: 50, size: 41, anim: "breathe", dur: 3.58 },
      { type: "emoji", emoji: "👒", x: 51, y: 13, size: 34, anim: "bounce", delay: 0.466, dur: 1.85 },
      { type: "emoji", emoji: "💖", x: 51, y: 31, size: 14, anim: "float", delay: 0.231, dur: 1.7 },
      { type: "emoji", emoji: "🔥", x: 73, y: 37, size: 22, anim: "wiggle", delay: 0.935, dur: 1.56 },
      { type: "emoji", emoji: "❤️", x: 64, y: 64, size: 24, anim: "wiggle", delay: 1.478, dur: 1.37 },
      { type: "emoji", emoji: "🍂", x: 50, y: 15, size: 16, anim: "wiggle", delay: 0.311, dur: 1.22 },
      { type: "emoji", emoji: "⭐", x: 22, y: 71, size: 19, anim: "blink", delay: 1.728, dur: 1.96 },
      { type: "emoji", emoji: "💖", x: 80, y: 51, size: 14, anim: "blink", delay: 1.465, dur: 1.61 }
    ],
  },
  crab_sky_38_935: {
    v: 1,
    loop: 3.04,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f4511e", opacity: 0.47, anim: "pulse", dur: 2.02, r: 42.54 },
      { type: "emoji", emoji: "🦀", x: 41, y: 53, size: 37, anim: "pulse", dur: 1.91 },
      { type: "emoji", emoji: "🍭", x: 73, y: 42, size: 24, anim: "blink", delay: 0.418, dur: 1.85 },
      { type: "emoji", emoji: "💫", x: 41, y: 81, size: 19, anim: "wiggle", delay: 1.449, dur: 1.45 },
      { type: "emoji", emoji: "✨", x: 23, y: 38, size: 25, anim: "float", delay: 0.724, dur: 1.85 },
      { type: "emoji", emoji: "✨", x: 77, y: 49, size: 14, anim: "blink", delay: 0.852, dur: 1.75 },
      { type: "emoji", emoji: "🌟", x: 23, y: 82, size: 16, anim: "blink", delay: 1.148, dur: 1.91 }
    ],
  },
  crab_party_39_936: {
    v: 1,
    loop: 2.71,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e91e63", opacity: 0.54, anim: "pulse", dur: 2.05, r: 45.15 },
      { type: "emoji", emoji: "🦀", x: 54, y: 51, size: 33, anim: "pulse", dur: 2.13 },
      { type: "emoji", emoji: "🍀", x: 70, y: 47, size: 25, anim: "pop", delay: 0.422, dur: 1.8 },
      { type: "emoji", emoji: "🍂", x: 17, y: 12, size: 15, anim: "rise", delay: 0.972, dur: 1.78 },
      { type: "emoji", emoji: "🍂", x: 31, y: 66, size: 21, anim: "blink", delay: 0.507, dur: 2.18 },
      { type: "emoji", emoji: "💖", x: 88, y: 48, size: 24, anim: "wiggle", delay: 0.555, dur: 2.09 },
      { type: "emoji", emoji: "🎈", x: 73, y: 76, size: 20, anim: "float", delay: 0.743, dur: 1.93 },
      { type: "emoji", emoji: "🌟", x: 53, y: 53, size: 15, anim: "blink", delay: 0.618, dur: 1.86 },
      { type: "emoji", emoji: "💖", x: 19, y: 54, size: 18, anim: "blink", delay: 1.958, dur: 1.12 }
    ],
  },
  crab_beach_39_937: {
    v: 1,
    loop: 2.95,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#7b1fa2", opacity: 0.52, anim: "float", dur: 2.75, r: 45.72 },
      { type: "emoji", emoji: "🦀", x: 70, y: 45, size: 33, anim: "float", dur: 2.94 },
      { type: "emoji", emoji: "🎈", x: 74, y: 26, size: 26, anim: "pop", delay: 0.943, dur: 1.62 },
      { type: "emoji", emoji: "🌿", x: 19, y: 62, size: 25, anim: "rise", delay: 0.871, dur: 1.79 },
      { type: "emoji", emoji: "🌿", x: 48, y: 25, size: 25, anim: "pop", delay: 1.116, dur: 2.05 },
      { type: "emoji", emoji: "💖", x: 73, y: 30, size: 14, anim: "blink", delay: 0.976, dur: 1.77 },
      { type: "emoji", emoji: "💫", x: 34, y: 84, size: 12, anim: "blink", delay: 1.895, dur: 1.75 }
    ],
  },
  crab_winter_39_938: {
    v: 1,
    loop: 3.71,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff59d", opacity: 0.42, anim: "settle", dur: 2.95, w: 105.5, h: 22.43 },
      { type: "emoji", emoji: "🦀", x: 40, y: 45, size: 35, anim: "settle", dur: 2.88 },
      { type: "emoji", emoji: "🪖", x: 51, y: 15, size: 29, anim: "bounce", delay: 0.321, dur: 1.55 },
      { type: "emoji", emoji: "⭐", x: 68, y: 31, size: 22, anim: "float", delay: 0.42, dur: 1.83 },
      { type: "emoji", emoji: "🎈", x: 43, y: 25, size: 17, anim: "wiggle", delay: 0.418, dur: 1.63 },
      { type: "emoji", emoji: "🌟", x: 54, y: 38, size: 20, anim: "pop", delay: 0.891, dur: 1.78 },
      { type: "emoji", emoji: "🎉", x: 76, y: 65, size: 14, anim: "pop", delay: 1.223, dur: 1.87 },
      { type: "emoji", emoji: "🌿", x: 87, y: 11, size: 18, anim: "pop", delay: 0.9, dur: 1.47 },
      { type: "emoji", emoji: "💫", x: 30, y: 17, size: 23, anim: "rise", delay: 1.464, dur: 1.69 },
      { type: "emoji", emoji: "💫", x: 40, y: 61, size: 12, anim: "blink", delay: 0.524, dur: 1.91 },
      { type: "emoji", emoji: "✨", x: 24, y: 29, size: 15, anim: "blink", delay: 1.793, dur: 1.05 }
    ],
  },
  crab_spring_39_939: {
    v: 1,
    loop: 2.21,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#3f51b5", opacity: 0.52, anim: "bounce", dur: 1.42, w: 102.87, h: 27.52 },
      { type: "emoji", emoji: "🦀", x: 68, y: 46, size: 41, anim: "bounce", dur: 1.16 },
      { type: "emoji", emoji: "🍪", x: 71, y: 45, size: 23, anim: "blink", delay: 0.879, dur: 1.64 },
      { type: "emoji", emoji: "💖", x: 53, y: 39, size: 20, anim: "blink", delay: 0.493, dur: 1.8 },
      { type: "emoji", emoji: "❤️", x: 88, y: 22, size: 18, anim: "rise", delay: 0.8, dur: 1.38 },
      { type: "emoji", emoji: "❤️", x: 50, y: 51, size: 16, anim: "blink", delay: 0.103, dur: 1.88 },
      { type: "emoji", emoji: "🌊", x: 39, y: 81, size: 12, anim: "float", delay: 0.201, dur: 2.35 },
      { type: "emoji", emoji: "⭐", x: 81, y: 70, size: 14, anim: "blink", delay: 1.716, dur: 1.35 },
      { type: "emoji", emoji: "🌟", x: 49, y: 28, size: 10, anim: "blink", delay: 0.898, dur: 1.4 }
    ],
  },
  crab_halloween_39_940: {
    v: 1,
    loop: 3.01,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e1f5fe", opacity: 0.62, anim: "twinkle", dur: 2.56, r: 43.93 },
      { type: "emoji", emoji: "🦀", x: 46, y: 48, size: 41, anim: "twinkle", dur: 2.52 },
      { type: "emoji", emoji: "🍫", x: 73, y: 42, size: 24, anim: "blink", delay: 0.673, dur: 1.44 },
      { type: "emoji", emoji: "🔥", x: 70, y: 83, size: 21, anim: "rise", delay: 0.319, dur: 1.35 },
      { type: "emoji", emoji: "🔥", x: 15, y: 13, size: 25, anim: "wiggle", delay: 0.087, dur: 1.81 },
      { type: "emoji", emoji: "🎊", x: 74, y: 78, size: 13, anim: "rise", delay: 0.86, dur: 2.1 },
      { type: "emoji", emoji: "✨", x: 45, y: 47, size: 17, anim: "blink", delay: 0.946, dur: 1.13 },
      { type: "emoji", emoji: "💫", x: 84, y: 70, size: 16, anim: "blink", delay: 1.368, dur: 1.22 }
    ],
  },
  crab_christmas_39_941: {
    v: 1,
    loop: 3.19,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#29b6f6", opacity: 0.45, anim: "float", dur: 2.97, w: 101.34, h: 23.76 },
      { type: "emoji", emoji: "🦀", x: 59, y: 48, size: 37, anim: "float", dur: 2.96 },
      { type: "emoji", emoji: "⭐", x: 73, y: 33, size: 23, anim: "float", delay: 0.691, dur: 1.89 },
      { type: "emoji", emoji: "🔥", x: 14, y: 37, size: 15, anim: "wiggle", delay: 1.311, dur: 1.23 },
      { type: "emoji", emoji: "🎈", x: 50, y: 69, size: 24, anim: "blink", delay: 0.625, dur: 1.21 },
      { type: "emoji", emoji: "🌟", x: 51, y: 30, size: 11, anim: "blink", delay: 0.616, dur: 1.18 },
      { type: "emoji", emoji: "⭐", x: 22, y: 80, size: 18, anim: "blink", delay: 1.272, dur: 1.85 }
    ],
  },
  crab_coding_39_942: {
    v: 1,
    loop: 2.36,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ff9800", opacity: 0.58, anim: "pop", dur: 1.7, w: 102.95, h: 19.9 },
      { type: "emoji", emoji: "🦀", x: 32, y: 56, size: 32, anim: "pop", dur: 1.51 },
      { type: "emoji", emoji: "🍳", x: 51, y: 15, size: 27, anim: "bounce", delay: 0.667, dur: 1.97 },
      { type: "emoji", emoji: "🎀", x: 66, y: 28, size: 16, anim: "float", delay: 0.944, dur: 1.81 },
      { type: "emoji", emoji: "🍂", x: 10, y: 53, size: 20, anim: "wiggle", delay: 0.732, dur: 1.58 },
      { type: "emoji", emoji: "🍂", x: 29, y: 77, size: 19, anim: "pop", delay: 1.085, dur: 1.49 },
      { type: "emoji", emoji: "💫", x: 18, y: 53, size: 21, anim: "blink", delay: 0.435, dur: 2.2 },
      { type: "emoji", emoji: "💫", x: 69, y: 29, size: 17, anim: "blink", delay: 0.626, dur: 1.34 },
      { type: "emoji", emoji: "💖", x: 55, y: 26, size: 17, anim: "blink", delay: 1.598, dur: 1.12 }
    ],
  },
  crab_music_39_943: {
    v: 1,
    loop: 3.22,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#81c784", opacity: 0.62, anim: "heartbeat", dur: 2.66, r: 48.52 },
      { type: "emoji", emoji: "🦀", x: 34, y: 54, size: 32, anim: "heartbeat", dur: 2.43 },
      { type: "emoji", emoji: "🎈", x: 28, y: 48, size: 21, anim: "blink", delay: 0.443, dur: 2.38 },
      { type: "emoji", emoji: "🍂", x: 56, y: 18, size: 14, anim: "blink", delay: 0.489, dur: 1.31 },
      { type: "emoji", emoji: "🍃", x: 32, y: 30, size: 21, anim: "rise", delay: 0.316, dur: 1.8 },
      { type: "emoji", emoji: "💖", x: 28, y: 70, size: 15, anim: "blink", delay: 1.293, dur: 1.06 },
      { type: "emoji", emoji: "✨", x: 64, y: 84, size: 18, anim: "blink", delay: 1.83, dur: 1.08 }
    ],
  },
  crab_sports_39_944: {
    v: 1,
    loop: 4.07,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 34, y: 46, size: 34, anim: "float", dur: 3.63 },
      { type: "emoji", emoji: "💝", x: 71, y: 42, size: 24, anim: "rise", delay: 0.462, dur: 1.6 },
      { type: "emoji", emoji: "🌸", x: 52, y: 10, size: 18, anim: "wiggle", delay: 1.238, dur: 1.51 },
      { type: "emoji", emoji: "🌿", x: 52, y: 26, size: 24, anim: "blink", delay: 0.035, dur: 1.4 },
      { type: "emoji", emoji: "🌟", x: 73, y: 32, size: 22, anim: "rise", delay: 0.306, dur: 2.17 },
      { type: "emoji", emoji: "💫", x: 39, y: 42, size: 12, anim: "blink", delay: 1.909, dur: 1.18 },
      { type: "emoji", emoji: "✨", x: 77, y: 18, size: 16, anim: "blink", delay: 1.63, dur: 1.67 }
    ],
  },
  crab_food_39_945: {
    v: 1,
    loop: 3.04,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ff7043", opacity: 0.62, anim: "float", dur: 2.85, r: 41.81 },
      { type: "emoji", emoji: "🦀", x: 60, y: 51, size: 40, anim: "float", dur: 2.86 },
      { type: "emoji", emoji: "🎈", x: 47, y: 89, size: 25, anim: "pop", delay: 0.974, dur: 1.63 },
      { type: "emoji", emoji: "❄️", x: 19, y: 15, size: 23, anim: "float", delay: 0.359, dur: 1.22 },
      { type: "emoji", emoji: "⭐", x: 33, y: 80, size: 15, anim: "blink", delay: 1.587, dur: 1.6 },
      { type: "emoji", emoji: "🌟", x: 46, y: 80, size: 13, anim: "blink", delay: 1.615, dur: 1.41 }
    ],
  },
  crab_space_39_946: {
    v: 1,
    loop: 2.42,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 63, y: 53, size: 35, anim: "wave", dur: 1.89 },
      { type: "emoji", emoji: "🎭", x: 52, y: 27, size: 29, anim: "bounce", delay: 0.551, dur: 1.6 },
      { type: "emoji", emoji: "🍦", x: 70, y: 42, size: 28, anim: "pop", delay: 0.659, dur: 1.54 },
      { type: "emoji", emoji: "🌿", x: 14, y: 84, size: 21, anim: "float", delay: 0.55, dur: 2.11 },
      { type: "emoji", emoji: "⭐", x: 40, y: 39, size: 13, anim: "blink", delay: 0.622, dur: 1.8 },
      { type: "emoji", emoji: "💖", x: 67, y: 55, size: 19, anim: "blink", delay: 1.53, dur: 1.93 }
    ],
  },
  crab_fantasy_39_947: {
    v: 1,
    loop: 2.05,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 30, y: 54, size: 36, anim: "bounce", dur: 1.44 },
      { type: "emoji", emoji: "🍪", x: 72, y: 46, size: 24, anim: "float", delay: 0.945, dur: 1.81 },
      { type: "emoji", emoji: "🎊", x: 18, y: 35, size: 19, anim: "blink", delay: 1.049, dur: 2.32 },
      { type: "emoji", emoji: "🌸", x: 23, y: 22, size: 21, anim: "blink", delay: 0.094, dur: 1.25 },
      { type: "emoji", emoji: "⭐", x: 45, y: 79, size: 18, anim: "pop", delay: 0.163, dur: 1.62 },
      { type: "emoji", emoji: "⭐", x: 41, y: 52, size: 16, anim: "blink", delay: 1.581, dur: 1.31 },
      { type: "emoji", emoji: "⭐", x: 66, y: 16, size: 12, anim: "blink", delay: 1.334, dur: 1.52 }
    ],
  },
  crab_office_39_948: {
    v: 1,
    loop: 2.44,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fbc02d", opacity: 0.64, anim: "wiggle", dur: 1.24, r: 43.82 },
      { type: "emoji", emoji: "🦀", x: 44, y: 52, size: 44, anim: "wiggle", dur: 1.28 },
      { type: "emoji", emoji: "👑", x: 51, y: 15, size: 32, anim: "bounce", delay: 0.591, dur: 1.89 },
      { type: "emoji", emoji: "🍂", x: 44, y: 41, size: 16, anim: "rise", delay: 0.224, dur: 1.38 },
      { type: "emoji", emoji: "🌸", x: 11, y: 59, size: 19, anim: "pop", delay: 1.491, dur: 1.8 },
      { type: "emoji", emoji: "🍂", x: 49, y: 47, size: 20, anim: "rise", delay: 1.398, dur: 2.2 },
      { type: "emoji", emoji: "✨", x: 29, y: 26, size: 16, anim: "blink", delay: 0.884, dur: 1.26 },
      { type: "emoji", emoji: "✨", x: 22, y: 72, size: 11, anim: "blink", delay: 0.99, dur: 1.15 }
    ],
  },
  crab_fitness_39_949: {
    v: 1,
    loop: 3.93,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#e8eaf6", opacity: 0.48, anim: "breathe", dur: 3.54, w: 95.15, h: 27.03 },
      { type: "emoji", emoji: "🦀", x: 65, y: 52, size: 38, anim: "breathe", dur: 3.38 },
      { type: "emoji", emoji: "🎓", x: 49, y: 15, size: 27, anim: "bounce", delay: 0.626, dur: 1.71 },
      { type: "emoji", emoji: "🌟", x: 51, y: 80, size: 20, anim: "rise", delay: 1.077, dur: 1.99 },
      { type: "emoji", emoji: "🎈", x: 28, y: 35, size: 12, anim: "pop", delay: 0.955, dur: 1.5 },
      { type: "emoji", emoji: "✨", x: 54, y: 73, size: 18, anim: "blink", delay: 1.53, dur: 1.78 },
      { type: "emoji", emoji: "💖", x: 52, y: 16, size: 14, anim: "blink", delay: 0.715, dur: 1.67 }
    ],
  },
  crab_travel_39_950: {
    v: 1,
    loop: 2.94,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e1f5fe", opacity: 0.46, anim: "pulse", dur: 1.87, r: 48.83 },
      { type: "emoji", emoji: "🦀", x: 50, y: 49, size: 38, anim: "pulse", dur: 2.08 },
      { type: "emoji", emoji: "🍰", x: 65, y: 39, size: 28, anim: "float", delay: 0.583, dur: 1.89 },
      { type: "emoji", emoji: "🎉", x: 41, y: 75, size: 14, anim: "float", delay: 1.287, dur: 2.28 },
      { type: "emoji", emoji: "❤️", x: 23, y: 37, size: 23, anim: "wiggle", delay: 0.74, dur: 1.84 },
      { type: "emoji", emoji: "⭐", x: 60, y: 60, size: 16, anim: "blink", delay: 1.363, dur: 1.02 },
      { type: "emoji", emoji: "🌟", x: 54, y: 62, size: 10, anim: "blink", delay: 1.15, dur: 1.6 }
    ],
  },
  crab_art_39_951: {
    v: 1,
    loop: 2.73,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#0277bd", opacity: 0.43, anim: "pulse", dur: 2.04, w: 107.76, h: 22.54 },
      { type: "emoji", emoji: "🦀", x: 67, y: 48, size: 38, anim: "pulse", dur: 2.32 },
      { type: "emoji", emoji: "✨", x: 26, y: 85, size: 23, anim: "blink", delay: 1.383, dur: 2.24 },
      { type: "emoji", emoji: "🌸", x: 66, y: 55, size: 19, anim: "blink", delay: 1.011, dur: 1.58 },
      { type: "emoji", emoji: "🌟", x: 54, y: 21, size: 11, anim: "blink", delay: 1.913, dur: 1.39 },
      { type: "emoji", emoji: "💫", x: 31, y: 49, size: 12, anim: "blink", delay: 1.209, dur: 1.43 }
    ],
  },
  crab_science_39_952: {
    v: 1,
    loop: 2.87,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f57c00", opacity: 0.51, anim: "float", dur: 2.94, r: 41.07 },
      { type: "emoji", emoji: "🦀", x: 52, y: 51, size: 40, anim: "float", dur: 2.85 },
      { type: "emoji", emoji: "👮", x: 49, y: 17, size: 31, anim: "bounce", delay: 0.62, dur: 1.65 },
      { type: "emoji", emoji: "💖", x: 68, y: 33, size: 21, anim: "pop", delay: 0.37, dur: 1.46 },
      { type: "emoji", emoji: "🎉", x: 40, y: 63, size: 15, anim: "rise", delay: 0.063, dur: 1.87 },
      { type: "emoji", emoji: "🌸", x: 75, y: 40, size: 17, anim: "blink", delay: 0.906, dur: 1.42 },
      { type: "emoji", emoji: "🌿", x: 68, y: 17, size: 20, anim: "wiggle", delay: 1.173, dur: 1.93 },
      { type: "emoji", emoji: "✨", x: 35, y: 41, size: 21, anim: "wiggle", delay: 1.264, dur: 2.13 },
      { type: "emoji", emoji: "✨", x: 17, y: 55, size: 18, anim: "blink", delay: 1.038, dur: 1.91 },
      { type: "emoji", emoji: "⭐", x: 51, y: 52, size: 13, anim: "blink", delay: 1.609, dur: 1.41 }
    ],
  },
  crab_pets_39_953: {
    v: 1,
    loop: 3.54,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 69, y: 55, size: 34, anim: "settle", dur: 3.11 },
      { type: "emoji", emoji: "👷", x: 50, y: 15, size: 29, anim: "bounce", delay: 0.694, dur: 1.72 },
      { type: "emoji", emoji: "💎", x: 67, y: 38, size: 23, anim: "float", delay: 0.664, dur: 1.83 },
      { type: "emoji", emoji: "❤️", x: 65, y: 52, size: 16, anim: "pop", delay: 0.85, dur: 1.46 },
      { type: "emoji", emoji: "❄️", x: 89, y: 56, size: 20, anim: "float", delay: 1.391, dur: 1.77 },
      { type: "emoji", emoji: "🌟", x: 51, y: 77, size: 18, anim: "float", delay: 0.121, dur: 1.61 },
      { type: "emoji", emoji: "✨", x: 73, y: 63, size: 17, anim: "blink", delay: 1.126, dur: 1.37 },
      { type: "emoji", emoji: "✨", x: 56, y: 70, size: 14, anim: "blink", delay: 1.669, dur: 1.82 }
    ],
  },
  crab_magic_39_954: {
    v: 1,
    loop: 1.92,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ede7f6", opacity: 0.35, anim: "bounce", dur: 1.52, r: 42.55 },
      { type: "emoji", emoji: "🦀", x: 41, y: 52, size: 38, anim: "bounce", dur: 1.3 },
      { type: "emoji", emoji: "🎩", x: 51, y: 12, size: 32, anim: "bounce", delay: 0.395, dur: 1.57 },
      { type: "emoji", emoji: "⭐", x: 68, y: 32, size: 25, anim: "blink", delay: 0.613, dur: 1.84 },
      { type: "emoji", emoji: "🌊", x: 83, y: 50, size: 14, anim: "rise", delay: 0.636, dur: 2.24 },
      { type: "emoji", emoji: "💫", x: 44, y: 43, size: 24, anim: "rise", delay: 0.157, dur: 1.94 },
      { type: "emoji", emoji: "❤️", x: 65, y: 26, size: 12, anim: "pop", delay: 1.478, dur: 2.32 },
      { type: "emoji", emoji: "✨", x: 80, y: 28, size: 12, anim: "pop", delay: 0.922, dur: 2.26 },
      { type: "emoji", emoji: "🌟", x: 68, y: 37, size: 12, anim: "blink", delay: 1.495, dur: 1.86 },
      { type: "emoji", emoji: "🌟", x: 73, y: 69, size: 13, anim: "blink", delay: 0.567, dur: 1.77 }
    ],
  },
  crab_retro_39_955: {
    v: 1,
    loop: 3.17,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ffccbc", opacity: 0.65, anim: "twinkle", dur: 2.72, r: 43.77 },
      { type: "emoji", emoji: "🦀", x: 43, y: 48, size: 43, anim: "twinkle", dur: 2.6 },
      { type: "emoji", emoji: "🤠", x: 48, y: 12, size: 30, anim: "bounce", delay: 0.36, dur: 1.55 },
      { type: "emoji", emoji: "🎉", x: 59, y: 44, size: 16, anim: "rise", delay: 1.015, dur: 2.11 },
      { type: "emoji", emoji: "✨", x: 45, y: 59, size: 16, anim: "blink", delay: 0.696, dur: 1.27 },
      { type: "emoji", emoji: "💫", x: 32, y: 42, size: 17, anim: "blink", delay: 1.634, dur: 1.08 },
      { type: "emoji", emoji: "💖", x: 61, y: 15, size: 12, anim: "blink", delay: 0.944, dur: 1.8 }
    ],
  },
  crab_cyber_39_956: {
    v: 1,
    loop: 3.06,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#ec407a", opacity: 0.33, anim: "float", dur: 3.24, w: 94.37, h: 24.52 },
      { type: "emoji", emoji: "🦀", x: 59, y: 53, size: 36, anim: "float", dur: 3.06 },
      { type: "emoji", emoji: "🎈", x: 69, y: 29, size: 27, anim: "pop", delay: 0.879, dur: 2 },
      { type: "emoji", emoji: "🍃", x: 28, y: 17, size: 21, anim: "wiggle", delay: 0.955, dur: 1.46 },
      { type: "emoji", emoji: "🎊", x: 23, y: 49, size: 15, anim: "blink", delay: 1.497, dur: 1.69 },
      { type: "emoji", emoji: "💖", x: 61, y: 65, size: 12, anim: "blink", delay: 0.625, dur: 1.54 },
      { type: "emoji", emoji: "🌟", x: 68, y: 29, size: 13, anim: "blink", delay: 1.733, dur: 1.33 }
    ],
  },
  crab_nature_39_957: {
    v: 1,
    loop: 2.22,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e1bee7", opacity: 0.34, anim: "pop", dur: 1.62, r: 42.4 },
      { type: "emoji", emoji: "🦀", x: 33, y: 56, size: 43, anim: "pop", dur: 1.51 },
      { type: "emoji", emoji: "🪖", x: 49, y: 18, size: 31, anim: "bounce", delay: 0.329, dur: 1.56 },
      { type: "emoji", emoji: "❄️", x: 39, y: 21, size: 22, anim: "pop", delay: 0.156, dur: 2.37 },
      { type: "emoji", emoji: "🎈", x: 24, y: 81, size: 12, anim: "rise", delay: 1.054, dur: 1.23 },
      { type: "emoji", emoji: "❄️", x: 81, y: 70, size: 13, anim: "rise", delay: 0.467, dur: 1.32 },
      { type: "emoji", emoji: "🌊", x: 68, y: 67, size: 15, anim: "pop", delay: 0.946, dur: 1.93 },
      { type: "emoji", emoji: "🔥", x: 68, y: 52, size: 19, anim: "rise", delay: 1.356, dur: 1.32 },
      { type: "emoji", emoji: "💫", x: 15, y: 54, size: 14, anim: "blink", delay: 1.451, dur: 1.33 },
      { type: "emoji", emoji: "✨", x: 17, y: 32, size: 13, anim: "blink", delay: 0.824, dur: 1.93 }
    ],
  },
  crab_underwater_39_958: {
    v: 1,
    loop: 3.02,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#fff59d", opacity: 0.49, anim: "heartbeat", dur: 2.75, r: 46.24 },
      { type: "emoji", emoji: "🦀", x: 64, y: 55, size: 37, anim: "heartbeat", dur: 2.47 },
      { type: "emoji", emoji: "🧢", x: 50, y: 16, size: 31, anim: "bounce", delay: 0.347, dur: 1.86 },
      { type: "emoji", emoji: "🎊", x: 15, y: 62, size: 19, anim: "float", delay: 1.084, dur: 2.1 },
      { type: "emoji", emoji: "🔥", x: 50, y: 14, size: 12, anim: "wiggle", delay: 0.751, dur: 1.7 },
      { type: "emoji", emoji: "🌟", x: 24, y: 75, size: 15, anim: "blink", delay: 1.96, dur: 1.98 },
      { type: "emoji", emoji: "🌟", x: 62, y: 58, size: 18, anim: "blink", delay: 1.231, dur: 1.94 }
    ],
  },
  crab_sky_39_959: {
    v: 1,
    loop: 4.07,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#7986cb", opacity: 0.69, anim: "float", dur: 3.47, r: 43.13 },
      { type: "emoji", emoji: "🦀", x: 65, y: 53, size: 37, anim: "float", dur: 3.49 },
      { type: "emoji", emoji: "🎭", x: 49, y: 29, size: 26, anim: "bounce", delay: 0.542, dur: 1.66 },
      { type: "emoji", emoji: "💖", x: 24, y: 50, size: 13, anim: "pop", delay: 1.441, dur: 2.38 },
      { type: "emoji", emoji: "🌟", x: 35, y: 62, size: 18, anim: "rise", delay: 0.955, dur: 1.6 },
      { type: "emoji", emoji: "🌿", x: 68, y: 41, size: 25, anim: "wiggle", delay: 0.811, dur: 1.29 },
      { type: "emoji", emoji: "💖", x: 67, y: 65, size: 11, anim: "blink", delay: 1.911, dur: 1.05 },
      { type: "emoji", emoji: "⭐", x: 33, y: 58, size: 17, anim: "blink", delay: 0.613, dur: 1.52 }
    ],
  },
  crab_party_40_960: {
    v: 1,
    loop: 2.92,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#e1f5fe", opacity: 0.67, anim: "float", dur: 2.99, r: 41.74 },
      { type: "emoji", emoji: "🦀", x: 46, y: 50, size: 43, anim: "float", dur: 2.9 },
      { type: "emoji", emoji: "💌", x: 71, y: 41, size: 27, anim: "pop", delay: 0.58, dur: 1.89 },
      { type: "emoji", emoji: "💖", x: 55, y: 75, size: 12, anim: "float", delay: 0.327, dur: 2.33 },
      { type: "emoji", emoji: "🍂", x: 28, y: 61, size: 16, anim: "blink", delay: 1.219, dur: 2.28 },
      { type: "emoji", emoji: "✨", x: 51, y: 77, size: 17, anim: "float", delay: 0.715, dur: 1.73 },
      { type: "emoji", emoji: "🌟", x: 60, y: 71, size: 12, anim: "blink", delay: 0.804, dur: 1.47 },
      { type: "emoji", emoji: "🌟", x: 44, y: 24, size: 19, anim: "blink", delay: 1.523, dur: 1.37 }
    ],
  },
  crab_beach_40_961: {
    v: 1,
    loop: 2.35,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#039be5", opacity: 0.68, anim: "wave", dur: 1.88, r: 47.6 },
      { type: "emoji", emoji: "🦀", x: 60, y: 45, size: 40, anim: "wave", dur: 1.68 },
      { type: "emoji", emoji: "👮", x: 51, y: 14, size: 31, anim: "bounce", delay: 0.355, dur: 1.88 },
      { type: "emoji", emoji: "🌟", x: 12, y: 11, size: 25, anim: "blink", delay: 1.116, dur: 2.04 },
      { type: "emoji", emoji: "🌊", x: 10, y: 10, size: 21, anim: "blink", delay: 0.644, dur: 1.95 },
      { type: "emoji", emoji: "💖", x: 58, y: 52, size: 17, anim: "blink", delay: 1.156, dur: 1.71 },
      { type: "emoji", emoji: "🌟", x: 20, y: 29, size: 11, anim: "blink", delay: 0.987, dur: 1.64 }
    ],
  },
  crab_winter_40_962: {
    v: 1,
    loop: 2.22,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 67, y: 50, size: 44, anim: "bounce", dur: 1.61 },
      { type: "emoji", emoji: "🤠", x: 50, y: 16, size: 33, anim: "bounce", delay: 0.526, dur: 1.52 },
      { type: "emoji", emoji: "🎀", x: 66, y: 33, size: 18, anim: "pop", delay: 0.592, dur: 1.85 },
      { type: "emoji", emoji: "🎉", x: 20, y: 54, size: 25, anim: "pop", delay: 0.887, dur: 2.22 },
      { type: "emoji", emoji: "🎊", x: 20, y: 65, size: 19, anim: "wiggle", delay: 0.624, dur: 2.22 },
      { type: "emoji", emoji: "💖", x: 20, y: 29, size: 13, anim: "blink", delay: 1.067, dur: 1.79 },
      { type: "emoji", emoji: "💖", x: 48, y: 82, size: 14, anim: "blink", delay: 0.691, dur: 1.46 }
    ],
  },
  crab_spring_40_963: {
    v: 1,
    loop: 1.99,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 33, y: 55, size: 35, anim: "wiggle", dur: 1.35 },
      { type: "emoji", emoji: "🌹", x: 70, y: 41, size: 27, anim: "float", delay: 0.997, dur: 1.7 },
      { type: "emoji", emoji: "🍃", x: 67, y: 44, size: 17, anim: "pop", delay: 0.909, dur: 1.27 },
      { type: "emoji", emoji: "💫", x: 82, y: 25, size: 17, anim: "pop", delay: 0.363, dur: 1.85 },
      { type: "emoji", emoji: "💫", x: 71, y: 22, size: 14, anim: "blink", delay: 1.827, dur: 1.25 },
      { type: "emoji", emoji: "✨", x: 78, y: 43, size: 13, anim: "blink", delay: 0.609, dur: 1.68 }
    ],
  },
  crab_halloween_40_964: {
    v: 1,
    loop: 3.8,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#673ab7", opacity: 0.48, anim: "breathe", dur: 3.26, w: 96.99, h: 23.21 },
      { type: "emoji", emoji: "🦀", x: 56, y: 52, size: 32, anim: "breathe", dur: 3.51 },
      { type: "emoji", emoji: "🍀", x: 70, y: 42, size: 23, anim: "pop", delay: 0.908, dur: 1.49 },
      { type: "emoji", emoji: "❤️", x: 60, y: 20, size: 15, anim: "float", delay: 1.126, dur: 1.96 },
      { type: "emoji", emoji: "💖", x: 73, y: 65, size: 14, anim: "wiggle", delay: 0.524, dur: 2.2 },
      { type: "emoji", emoji: "🎊", x: 10, y: 27, size: 18, anim: "float", delay: 1.009, dur: 2.05 },
      { type: "emoji", emoji: "💖", x: 83, y: 64, size: 18, anim: "blink", delay: 1.423, dur: 1.76 },
      { type: "emoji", emoji: "💖", x: 37, y: 16, size: 11, anim: "blink", delay: 0.632, dur: 1.56 },
      { type: "emoji", emoji: "🌟", x: 40, y: 29, size: 12, anim: "blink", delay: 1.397, dur: 1.18 }
    ],
  },
  crab_christmas_40_965: {
    v: 1,
    loop: 2.87,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 32, y: 52, size: 34, anim: "pulse", dur: 2.07 },
      { type: "emoji", emoji: "👑", x: 48, y: 15, size: 30, anim: "bounce", delay: 0.317, dur: 1.78 },
      { type: "emoji", emoji: "❄️", x: 40, y: 89, size: 17, anim: "pop", delay: 0.946, dur: 1.68 },
      { type: "emoji", emoji: "🎈", x: 53, y: 48, size: 25, anim: "blink", delay: 0.475, dur: 2.33 },
      { type: "emoji", emoji: "🍂", x: 62, y: 74, size: 17, anim: "rise", delay: 0.298, dur: 1.85 },
      { type: "emoji", emoji: "🔥", x: 28, y: 78, size: 23, anim: "wiggle", delay: 1.185, dur: 2.14 },
      { type: "emoji", emoji: "🍂", x: 49, y: 27, size: 20, anim: "rise", delay: 1.011, dur: 1.32 },
      { type: "emoji", emoji: "✨", x: 16, y: 83, size: 12, anim: "blink", delay: 0.61, dur: 1.17 },
      { type: "emoji", emoji: "💖", x: 24, y: 63, size: 14, anim: "blink", delay: 0.979, dur: 1.05 }
    ],
  },
  crab_coding_40_966: {
    v: 1,
    loop: 2.64,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e91e63", opacity: 0.57, anim: "pulse", dur: 2.39, r: 46.85 },
      { type: "emoji", emoji: "🦀", x: 68, y: 55, size: 40, anim: "pulse", dur: 2.12 },
      { type: "emoji", emoji: "🔥", x: 13, y: 15, size: 16, anim: "wiggle", delay: 1.34, dur: 1.3 },
      { type: "emoji", emoji: "🍂", x: 42, y: 33, size: 13, anim: "blink", delay: 1.103, dur: 2.18 },
      { type: "emoji", emoji: "✨", x: 83, y: 15, size: 12, anim: "blink", delay: 1.671, dur: 1.92 },
      { type: "emoji", emoji: "⭐", x: 23, y: 43, size: 11, anim: "blink", delay: 1.859, dur: 1.23 }
    ],
  },
  crab_music_40_967: {
    v: 1,
    loop: 2.97,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 49, y: 47, size: 44, anim: "float", dur: 2.68 },
      { type: "emoji", emoji: "👒", x: 51, y: 16, size: 32, anim: "bounce", delay: 0.581, dur: 1.59 },
      { type: "emoji", emoji: "🌸", x: 69, y: 43, size: 27, anim: "blink", delay: 0.841, dur: 1.76 },
      { type: "emoji", emoji: "🍃", x: 42, y: 21, size: 18, anim: "blink", delay: 0.419, dur: 2.29 },
      { type: "emoji", emoji: "🍂", x: 84, y: 69, size: 25, anim: "pop", delay: 1.393, dur: 1.26 },
      { type: "emoji", emoji: "💫", x: 79, y: 75, size: 13, anim: "blink", delay: 1.13, dur: 1.13 },
      { type: "emoji", emoji: "💫", x: 37, y: 26, size: 10, anim: "blink", delay: 1.146, dur: 1.38 }
    ],
  },
  crab_sports_40_968: {
    v: 1,
    loop: 3.68,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fff59d", opacity: 0.41, anim: "settle", dur: 3.19, r: 47.7 },
      { type: "emoji", emoji: "🦀", x: 63, y: 54, size: 44, anim: "settle", dur: 3.05 },
      { type: "emoji", emoji: "🎓", x: 49, y: 17, size: 28, anim: "bounce", delay: 0.547, dur: 2 },
      { type: "emoji", emoji: "💌", x: 67, y: 43, size: 27, anim: "pop", delay: 0.852, dur: 1.53 },
      { type: "emoji", emoji: "⭐", x: 83, y: 70, size: 21, anim: "float", delay: 0.545, dur: 1.72 },
      { type: "emoji", emoji: "🎉", x: 67, y: 32, size: 24, anim: "blink", delay: 0.339, dur: 1.51 },
      { type: "emoji", emoji: "💖", x: 62, y: 56, size: 20, anim: "wiggle", delay: 1.432, dur: 2.28 },
      { type: "emoji", emoji: "🍃", x: 65, y: 45, size: 14, anim: "rise", delay: 0.147, dur: 1.9 },
      { type: "emoji", emoji: "💖", x: 42, y: 64, size: 16, anim: "blink", delay: 0.75, dur: 1.87 },
      { type: "emoji", emoji: "💖", x: 17, y: 45, size: 12, anim: "blink", delay: 0.661, dur: 1.13 }
    ],
  },
  crab_food_40_969: {
    v: 1,
    loop: 1.85,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#303f9f", opacity: 0.37, anim: "bounce", dur: 1.24, w: 108.9, h: 24.32 },
      { type: "emoji", emoji: "🦀", x: 55, y: 46, size: 37, anim: "bounce", dur: 1.16 },
      { type: "emoji", emoji: "🍰", x: 69, y: 40, size: 29, anim: "pop", delay: 0.675, dur: 1.56 },
      { type: "emoji", emoji: "🔥", x: 43, y: 20, size: 15, anim: "wiggle", delay: 0.954, dur: 2.09 },
      { type: "emoji", emoji: "🎉", x: 38, y: 70, size: 22, anim: "rise", delay: 0.838, dur: 1.35 },
      { type: "emoji", emoji: "💫", x: 31, y: 68, size: 13, anim: "blink", delay: 0.29, dur: 2.31 },
      { type: "emoji", emoji: "🎈", x: 72, y: 74, size: 14, anim: "pop", delay: 0.979, dur: 2.28 },
      { type: "emoji", emoji: "💖", x: 51, y: 42, size: 13, anim: "blink", delay: 1.41, dur: 1.44 },
      { type: "emoji", emoji: "💖", x: 61, y: 37, size: 16, anim: "blink", delay: 1.876, dur: 1.16 }
    ],
  },
  crab_space_40_970: {
    v: 1,
    loop: 3.17,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 33, y: 46, size: 36, anim: "twinkle", dur: 2.41 },
      { type: "emoji", emoji: "⭐", x: 69, y: 30, size: 22, anim: "blink", delay: 0.778, dur: 1.75 },
      { type: "emoji", emoji: "🍃", x: 52, y: 17, size: 15, anim: "float", delay: 0.219, dur: 1.87 },
      { type: "emoji", emoji: "🌟", x: 35, y: 36, size: 25, anim: "rise", delay: 0.67, dur: 1.48 },
      { type: "emoji", emoji: "🌊", x: 80, y: 20, size: 14, anim: "float", delay: 0.512, dur: 2.26 },
      { type: "emoji", emoji: "💫", x: 48, y: 60, size: 10, anim: "blink", delay: 1.859, dur: 1.15 },
      { type: "emoji", emoji: "✨", x: 65, y: 29, size: 15, anim: "blink", delay: 1.537, dur: 1.9 }
    ],
  },
  crab_fantasy_40_971: {
    v: 1,
    loop: 3.1,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 46, y: 51, size: 41, anim: "float", dur: 2.92 },
      { type: "emoji", emoji: "👷", x: 48, y: 16, size: 31, anim: "bounce", delay: 0.629, dur: 1.93 },
      { type: "emoji", emoji: "🌊", x: 86, y: 50, size: 21, anim: "wiggle", delay: 0.907, dur: 2.06 },
      { type: "emoji", emoji: "🌸", x: 89, y: 41, size: 13, anim: "float", delay: 0.563, dur: 1.89 },
      { type: "emoji", emoji: "⭐", x: 19, y: 80, size: 17, anim: "blink", delay: 1.651, dur: 1.34 },
      { type: "emoji", emoji: "💫", x: 21, y: 33, size: 13, anim: "blink", delay: 1.601, dur: 1.5 }
    ],
  },
  crab_office_40_972: {
    v: 1,
    loop: 2.43,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f57c00", opacity: 0.3, anim: "pop", dur: 1.82, r: 47.67 },
      { type: "emoji", emoji: "🦀", x: 48, y: 54, size: 34, anim: "pop", dur: 1.72 },
      { type: "emoji", emoji: "🍦", x: 67, y: 43, size: 27, anim: "pop", delay: 0.672, dur: 1.68 },
      { type: "emoji", emoji: "🌊", x: 70, y: 62, size: 13, anim: "float", delay: 1.443, dur: 1.55 },
      { type: "emoji", emoji: "❄️", x: 13, y: 78, size: 20, anim: "blink", delay: 0.454, dur: 2.14 },
      { type: "emoji", emoji: "❄️", x: 81, y: 55, size: 15, anim: "pop", delay: 0.07, dur: 2.08 },
      { type: "emoji", emoji: "🌸", x: 10, y: 60, size: 14, anim: "blink", delay: 0.758, dur: 1.23 },
      { type: "emoji", emoji: "✨", x: 87, y: 49, size: 13, anim: "blink", delay: 0.287, dur: 1.27 },
      { type: "emoji", emoji: "💖", x: 63, y: 41, size: 12, anim: "blink", delay: 1.494, dur: 1.24 },
      { type: "emoji", emoji: "✨", x: 24, y: 71, size: 11, anim: "blink", delay: 0.849, dur: 1.91 }
    ],
  },
  crab_fitness_40_973: {
    v: 1,
    loop: 3.1,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#4caf50", opacity: 0.4, anim: "heartbeat", dur: 2.31, w: 94.51, h: 27.42 },
      { type: "emoji", emoji: "🦀", x: 45, y: 47, size: 32, anim: "heartbeat", dur: 2.54 },
      { type: "emoji", emoji: "🤠", x: 52, y: 15, size: 32, anim: "bounce", delay: 0.619, dur: 1.52 },
      { type: "emoji", emoji: "🍩", x: 71, y: 43, size: 24, anim: "blink", delay: 0.555, dur: 1.99 },
      { type: "emoji", emoji: "🍂", x: 72, y: 86, size: 25, anim: "wiggle", delay: 1.488, dur: 2.27 },
      { type: "emoji", emoji: "💫", x: 15, y: 30, size: 13, anim: "float", delay: 1.337, dur: 1.92 },
      { type: "emoji", emoji: "🎈", x: 21, y: 72, size: 24, anim: "pop", delay: 0.685, dur: 1.94 },
      { type: "emoji", emoji: "🎊", x: 55, y: 51, size: 16, anim: "blink", delay: 1.437, dur: 2.34 },
      { type: "emoji", emoji: "💖", x: 35, y: 81, size: 12, anim: "blink", delay: 0.878, dur: 1.09 },
      { type: "emoji", emoji: "🌟", x: 29, y: 68, size: 16, anim: "blink", delay: 1.347, dur: 1.57 }
    ],
  },
  crab_travel_40_974: {
    v: 1,
    loop: 4.06,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#5e35b1", opacity: 0.4, anim: "float", dur: 3.72, r: 44.06 },
      { type: "emoji", emoji: "🦀", x: 55, y: 47, size: 36, anim: "float", dur: 3.51 },
      { type: "emoji", emoji: "✨", x: 82, y: 33, size: 14, anim: "blink", delay: 1.883, dur: 1.59 },
      { type: "emoji", emoji: "🌟", x: 30, y: 71, size: 17, anim: "blink", delay: 1.9, dur: 1.62 }
    ],
  },
  crab_art_40_975: {
    v: 1,
    loop: 2.84,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#f4511e", opacity: 0.7, anim: "float", dur: 2.93, r: 40.06 },
      { type: "emoji", emoji: "🦀", x: 59, y: 47, size: 41, anim: "float", dur: 3.02 },
      { type: "emoji", emoji: "💖", x: 78, y: 13, size: 25, anim: "rise", delay: 0.162, dur: 1.71 },
      { type: "emoji", emoji: "✨", x: 63, y: 71, size: 14, anim: "float", delay: 0.629, dur: 2.12 },
      { type: "emoji", emoji: "🍃", x: 76, y: 54, size: 18, anim: "blink", delay: 0.73, dur: 1.54 },
      { type: "emoji", emoji: "🌊", x: 13, y: 11, size: 18, anim: "float", delay: 0.319, dur: 1.33 },
      { type: "emoji", emoji: "⭐", x: 20, y: 67, size: 12, anim: "blink", delay: 0.702, dur: 1.86 },
      { type: "emoji", emoji: "✨", x: 78, y: 49, size: 19, anim: "blink", delay: 1.468, dur: 1.39 }
    ],
  },
  crab_science_40_976: {
    v: 1,
    loop: 2.39,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#c2185b", opacity: 0.7, anim: "wave", dur: 1.66, r: 49.42 },
      { type: "emoji", emoji: "🦀", x: 38, y: 54, size: 35, anim: "wave", dur: 1.82 },
      { type: "emoji", emoji: "🎭", x: 50, y: 29, size: 26, anim: "bounce", delay: 0.532, dur: 1.83 },
      { type: "emoji", emoji: "🎀", x: 69, y: 32, size: 17, anim: "blink", delay: 0.971, dur: 1.51 },
      { type: "emoji", emoji: "✨", x: 80, y: 76, size: 21, anim: "float", delay: 0.49, dur: 1.66 },
      { type: "emoji", emoji: "🌸", x: 49, y: 68, size: 24, anim: "rise", delay: 0.051, dur: 1.73 },
      { type: "emoji", emoji: "💫", x: 22, y: 62, size: 18, anim: "blink", delay: 0.645, dur: 1.76 },
      { type: "emoji", emoji: "✨", x: 25, y: 41, size: 18, anim: "blink", delay: 0.95, dur: 1.33 }
    ],
  },
  crab_pets_40_977: {
    v: 1,
    loop: 2.23,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 54, y: 45, size: 39, anim: "bounce", dur: 1.39 },
      { type: "emoji", emoji: "🎩", x: 49, y: 12, size: 33, anim: "bounce", delay: 0.31, dur: 1.67 },
      { type: "emoji", emoji: "🍂", x: 70, y: 37, size: 20, anim: "wiggle", delay: 0.474, dur: 1.27 },
      { type: "emoji", emoji: "🎉", x: 15, y: 67, size: 20, anim: "blink", delay: 0.468, dur: 1.46 },
      { type: "emoji", emoji: "🎊", x: 63, y: 32, size: 16, anim: "pop", delay: 0.682, dur: 2.1 },
      { type: "emoji", emoji: "🎈", x: 50, y: 60, size: 12, anim: "pop", delay: 0.658, dur: 1.58 },
      { type: "emoji", emoji: "⭐", x: 71, y: 27, size: 19, anim: "blink", delay: 1.544, dur: 1.45 },
      { type: "emoji", emoji: "⭐", x: 65, y: 49, size: 14, anim: "blink", delay: 0.558, dur: 1.74 }
    ],
  },
  crab_magic_40_978: {
    v: 1,
    loop: 2.33,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fff59d", opacity: 0.38, anim: "wiggle", dur: 1.62, w: 103.74, h: 23.52 },
      { type: "emoji", emoji: "🦀", x: 67, y: 45, size: 40, anim: "wiggle", dur: 1.51 },
      { type: "emoji", emoji: "👑", x: 48, y: 12, size: 31, anim: "bounce", delay: 0.398, dur: 1.81 },
      { type: "emoji", emoji: "🌟", x: 72, y: 29, size: 25, anim: "blink", delay: 0.847, dur: 1.88 },
      { type: "emoji", emoji: "🎉", x: 67, y: 81, size: 19, anim: "pop", delay: 1.382, dur: 1.36 },
      { type: "emoji", emoji: "❤️", x: 73, y: 39, size: 22, anim: "float", delay: 1.499, dur: 1.92 },
      { type: "emoji", emoji: "🌟", x: 62, y: 39, size: 12, anim: "blink", delay: 1.29, dur: 1.53 },
      { type: "emoji", emoji: "✨", x: 78, y: 17, size: 11, anim: "blink", delay: 1.815, dur: 1.67 }
    ],
  },
  crab_retro_40_979: {
    v: 1,
    loop: 4.15,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#3f51b5", opacity: 0.37, anim: "breathe", dur: 3.6, r: 42.64 },
      { type: "emoji", emoji: "🦀", x: 69, y: 55, size: 39, anim: "breathe", dur: 3.43 },
      { type: "emoji", emoji: "🪖", x: 49, y: 16, size: 28, anim: "bounce", delay: 0.663, dur: 1.88 },
      { type: "emoji", emoji: "❄️", x: 22, y: 19, size: 21, anim: "rise", delay: 0.323, dur: 1.81 },
      { type: "emoji", emoji: "🎈", x: 80, y: 64, size: 21, anim: "pop", delay: 1.08, dur: 2.33 },
      { type: "emoji", emoji: "🌸", x: 76, y: 87, size: 25, anim: "pop", delay: 1.232, dur: 1.64 },
      { type: "emoji", emoji: "⭐", x: 38, y: 37, size: 12, anim: "blink", delay: 1.219, dur: 1.3 },
      { type: "emoji", emoji: "💫", x: 28, y: 61, size: 11, anim: "blink", delay: 1.272, dur: 1.03 }
    ],
  },
  crab_cyber_40_980: {
    v: 1,
    loop: 2.74,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#e1f5fe", opacity: 0.35, anim: "pulse", dur: 1.77, w: 103.4, h: 18.27 },
      { type: "emoji", emoji: "🦀", x: 47, y: 49, size: 38, anim: "pulse", dur: 2.02 },
      { type: "emoji", emoji: "🎀", x: 70, y: 30, size: 16, anim: "pop", delay: 0.749, dur: 1.67 },
      { type: "emoji", emoji: "🔥", x: 64, y: 84, size: 16, anim: "rise", delay: 0.024, dur: 1.82 },
      { type: "emoji", emoji: "🍂", x: 79, y: 33, size: 12, anim: "blink", delay: 1.325, dur: 2.33 },
      { type: "emoji", emoji: "🍂", x: 60, y: 43, size: 23, anim: "float", delay: 1.213, dur: 1.6 },
      { type: "emoji", emoji: "💖", x: 83, y: 19, size: 24, anim: "blink", delay: 1.089, dur: 1.61 },
      { type: "emoji", emoji: "🌊", x: 59, y: 73, size: 22, anim: "pop", delay: 0.106, dur: 1.93 },
      { type: "emoji", emoji: "✨", x: 65, y: 48, size: 17, anim: "blink", delay: 1.825, dur: 1.83 },
      { type: "emoji", emoji: "💫", x: 41, y: 18, size: 17, anim: "blink", delay: 1.297, dur: 1.43 }
    ],
  },
  crab_nature_40_981: {
    v: 1,
    loop: 2.72,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#81d4fa", opacity: 0.66, anim: "pulse", dur: 2.29, r: 49.1 },
      { type: "emoji", emoji: "🦀", x: 33, y: 48, size: 36, anim: "pulse", dur: 2.31 },
      { type: "emoji", emoji: "🎁", x: 74, y: 43, size: 26, anim: "pop", delay: 0.524, dur: 1.55 },
      { type: "emoji", emoji: "🍂", x: 13, y: 24, size: 17, anim: "wiggle", delay: 0.503, dur: 1.91 },
      { type: "emoji", emoji: "❄️", x: 22, y: 14, size: 13, anim: "pop", delay: 0.787, dur: 1.5 },
      { type: "emoji", emoji: "⭐", x: 46, y: 37, size: 14, anim: "pop", delay: 0.877, dur: 1.35 },
      { type: "emoji", emoji: "✨", x: 20, y: 16, size: 10, anim: "blink", delay: 1.003, dur: 1.02 },
      { type: "emoji", emoji: "✨", x: 19, y: 18, size: 12, anim: "blink", delay: 1.963, dur: 1.09 }
    ],
  },
  crab_underwater_40_982: {
    v: 1,
    loop: 2.86,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 70, y: 55, size: 34, anim: "float", dur: 2.71 },
      { type: "emoji", emoji: "👑", x: 50, y: 16, size: 30, anim: "bounce", delay: 0.382, dur: 1.57 },
      { type: "emoji", emoji: "🍀", x: 69, y: 41, size: 23, anim: "blink", delay: 0.733, dur: 1.7 },
      { type: "emoji", emoji: "🌿", x: 43, y: 30, size: 24, anim: "blink", delay: 0.096, dur: 1.4 },
      { type: "emoji", emoji: "✨", x: 67, y: 34, size: 24, anim: "rise", delay: 0.708, dur: 1.96 },
      { type: "emoji", emoji: "💫", x: 22, y: 35, size: 14, anim: "blink", delay: 1.759, dur: 1.3 },
      { type: "emoji", emoji: "✨", x: 37, y: 50, size: 18, anim: "blink", delay: 0.732, dur: 1.41 }
    ],
  },
  crab_sky_40_983: {
    v: 1,
    loop: 3.44,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#a5d6a7", opacity: 0.37, anim: "settle", dur: 3.21, w: 101.84, h: 26.94 },
      { type: "emoji", emoji: "🦀", x: 59, y: 47, size: 33, anim: "settle", dur: 2.95 },
      { type: "emoji", emoji: "💫", x: 11, y: 73, size: 14, anim: "rise", delay: 1.318, dur: 2.25 },
      { type: "emoji", emoji: "🌿", x: 67, y: 37, size: 24, anim: "blink", delay: 0.948, dur: 1.62 },
      { type: "emoji", emoji: "🌟", x: 83, y: 56, size: 11, anim: "blink", delay: 0.765, dur: 1.23 },
      { type: "emoji", emoji: "💖", x: 71, y: 33, size: 12, anim: "blink", delay: 1.11, dur: 1.2 }
    ],
  },
  crab_party_41_984: {
    v: 1,
    loop: 1.83,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#9575cd", opacity: 0.35, anim: "bounce", dur: 1.25, w: 105.74, h: 22.34 },
      { type: "emoji", emoji: "🦀", x: 43, y: 53, size: 44, anim: "bounce", dur: 1.27 },
      { type: "emoji", emoji: "🍭", x: 70, y: 40, size: 25, anim: "pop", delay: 0.536, dur: 1.63 },
      { type: "emoji", emoji: "✨", x: 10, y: 12, size: 20, anim: "rise", delay: 0.384, dur: 1.6 },
      { type: "emoji", emoji: "💖", x: 41, y: 89, size: 20, anim: "float", delay: 0.08, dur: 2.27 },
      { type: "emoji", emoji: "🍂", x: 21, y: 65, size: 25, anim: "float", delay: 1.156, dur: 2.27 },
      { type: "emoji", emoji: "🌟", x: 25, y: 71, size: 17, anim: "blink", delay: 1.008, dur: 1.08 },
      { type: "emoji", emoji: "💫", x: 44, y: 29, size: 17, anim: "blink", delay: 1.575, dur: 1.46 }
    ],
  },
  crab_beach_41_985: {
    v: 1,
    loop: 3.2,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#ff8a65", opacity: 0.65, anim: "twinkle", dur: 2.43, w: 103.48, h: 21.39 },
      { type: "emoji", emoji: "🦀", x: 64, y: 51, size: 34, anim: "twinkle", dur: 2.38 },
      { type: "emoji", emoji: "💎", x: 70, y: 36, size: 23, anim: "float", delay: 0.77, dur: 1.42 },
      { type: "emoji", emoji: "🌸", x: 42, y: 71, size: 22, anim: "pop", delay: 0.693, dur: 2.06 },
      { type: "emoji", emoji: "🎊", x: 17, y: 63, size: 19, anim: "wiggle", delay: 1.014, dur: 2.3 },
      { type: "emoji", emoji: "🌟", x: 47, y: 68, size: 17, anim: "blink", delay: 0.698, dur: 1.64 },
      { type: "emoji", emoji: "💖", x: 30, y: 84, size: 18, anim: "blink", delay: 1.472, dur: 1.33 }
    ],
  },
  crab_winter_41_986: {
    v: 1,
    loop: 3.06,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#f06292", opacity: 0.41, anim: "float", dur: 3.16, w: 109.85, h: 23.12 },
      { type: "emoji", emoji: "🦀", x: 54, y: 51, size: 37, anim: "float", dur: 3.12 },
      { type: "emoji", emoji: "💌", x: 71, y: 41, size: 24, anim: "blink", delay: 0.778, dur: 1.43 },
      { type: "emoji", emoji: "🍂", x: 68, y: 75, size: 15, anim: "blink", delay: 0.624, dur: 2.32 },
      { type: "emoji", emoji: "🌿", x: 73, y: 15, size: 13, anim: "blink", delay: 1.029, dur: 1.8 },
      { type: "emoji", emoji: "💫", x: 58, y: 21, size: 14, anim: "wiggle", delay: 0.998, dur: 1.66 },
      { type: "emoji", emoji: "🌟", x: 62, y: 56, size: 16, anim: "blink", delay: 0.729, dur: 1.7 },
      { type: "emoji", emoji: "✨", x: 17, y: 63, size: 18, anim: "blink", delay: 1.462, dur: 1.22 }
    ],
  },
  crab_spring_41_987: {
    v: 1,
    loop: 2.43,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#e1bee7", opacity: 0.43, anim: "pop", dur: 1.79, r: 49.75 },
      { type: "emoji", emoji: "🦀", x: 33, y: 50, size: 35, anim: "pop", dur: 1.46 },
      { type: "emoji", emoji: "🤠", x: 50, y: 13, size: 32, anim: "bounce", delay: 0.461, dur: 1.97 },
      { type: "emoji", emoji: "⭐", x: 73, y: 32, size: 25, anim: "rise", delay: 0.924, dur: 1.83 },
      { type: "emoji", emoji: "🌟", x: 79, y: 87, size: 14, anim: "pop", delay: 0.066, dur: 2.36 },
      { type: "emoji", emoji: "🍃", x: 50, y: 56, size: 18, anim: "blink", delay: 0.152, dur: 1.87 },
      { type: "emoji", emoji: "❤️", x: 47, y: 81, size: 25, anim: "pop", delay: 0.284, dur: 1.31 },
      { type: "emoji", emoji: "💖", x: 78, y: 89, size: 21, anim: "blink", delay: 1.465, dur: 1.28 },
      { type: "emoji", emoji: "🌟", x: 77, y: 49, size: 12, anim: "blink", delay: 1.843, dur: 1.08 },
      { type: "emoji", emoji: "💫", x: 82, y: 27, size: 13, anim: "blink", delay: 0.981, dur: 1.47 }
    ],
  },
  crab_halloween_41_988: {
    v: 1,
    loop: 3.16,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 70, fill: "#fdd835", opacity: 0.35, anim: "heartbeat", dur: 2.29, w: 108.1, h: 23.89 },
      { type: "emoji", emoji: "🦀", x: 56, y: 45, size: 34, anim: "heartbeat", dur: 2.58 },
      { type: "emoji", emoji: "👷", x: 51, y: 18, size: 30, anim: "bounce", delay: 0.345, dur: 1.85 },
      { type: "emoji", emoji: "🌹", x: 69, y: 44, size: 26, anim: "pop", delay: 0.651, dur: 1.65 },
      { type: "emoji", emoji: "🌿", x: 71, y: 10, size: 18, anim: "blink", delay: 0.377, dur: 1.43 },
      { type: "emoji", emoji: "❄️", x: 35, y: 56, size: 14, anim: "wiggle", delay: 0.964, dur: 1.62 },
      { type: "emoji", emoji: "⭐", x: 16, y: 44, size: 18, anim: "blink", delay: 1.559, dur: 1.65 },
      { type: "emoji", emoji: "💫", x: 20, y: 69, size: 17, anim: "blink", delay: 1.903, dur: 1.86 }
    ],
  },
  crab_christmas_41_989: {
    v: 1,
    loop: 4.2,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 52, y: 56, size: 38, anim: "float", dur: 3.58 },
      { type: "emoji", emoji: "🎉", x: 27, y: 64, size: 22, anim: "wiggle", delay: 0.512, dur: 1.99 },
      { type: "emoji", emoji: "🌊", x: 22, y: 60, size: 24, anim: "blink", delay: 0.418, dur: 2.06 },
      { type: "emoji", emoji: "💫", x: 64, y: 17, size: 12, anim: "rise", delay: 0.465, dur: 1.45 },
      { type: "emoji", emoji: "💫", x: 29, y: 43, size: 19, anim: "blink", delay: 1.972, dur: 1.95 },
      { type: "emoji", emoji: "✨", x: 35, y: 36, size: 15, anim: "blink", delay: 1.768, dur: 1.75 }
    ],
  },
  crab_coding_41_990: {
    v: 1,
    loop: 2.86,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#fff0f6", opacity: 0.39, anim: "float", dur: 3.02, r: 42.05 },
      { type: "emoji", emoji: "🦀", x: 38, y: 45, size: 33, anim: "float", dur: 3.07 },
      { type: "emoji", emoji: "🎊", x: 81, y: 40, size: 21, anim: "rise", delay: 1.139, dur: 1.3 },
      { type: "emoji", emoji: "🎊", x: 20, y: 67, size: 17, anim: "blink", delay: 0.341, dur: 1.23 },
      { type: "emoji", emoji: "🌿", x: 77, y: 31, size: 12, anim: "float", delay: 1.421, dur: 2.06 },
      { type: "emoji", emoji: "🌿", x: 69, y: 33, size: 21, anim: "pop", delay: 0.159, dur: 2.05 },
      { type: "emoji", emoji: "🌟", x: 23, y: 11, size: 18, anim: "wiggle", delay: 0.149, dur: 1.41 },
      { type: "emoji", emoji: "💖", x: 36, y: 45, size: 11, anim: "blink", delay: 1.34, dur: 1.94 },
      { type: "emoji", emoji: "💫", x: 39, y: 41, size: 11, anim: "blink", delay: 0.984, dur: 1.07 }
    ],
  },
  crab_music_41_991: {
    v: 1,
    loop: 2.32,
    bg: null,
    layers: [
      { type: "ellipse", x: 50, y: 50, fill: "#4fc3f7", opacity: 0.58, anim: "wave", dur: 1.59, w: 101.78, h: 26.82 },
      { type: "emoji", emoji: "🦀", x: 40, y: 56, size: 38, anim: "wave", dur: 1.7 },
      { type: "emoji", emoji: "🌸", x: 67, y: 41, size: 27, anim: "float", delay: 0.588, dur: 1.77 },
      { type: "emoji", emoji: "🍃", x: 41, y: 84, size: 18, anim: "rise", delay: 0.516, dur: 1.96 },
      { type: "emoji", emoji: "❄️", x: 66, y: 11, size: 24, anim: "pop", delay: 1.487, dur: 1.5 },
      { type: "emoji", emoji: "🎉", x: 34, y: 33, size: 15, anim: "blink", delay: 0.627, dur: 1.69 },
      { type: "emoji", emoji: "🍂", x: 34, y: 41, size: 22, anim: "rise", delay: 1.317, dur: 1.37 },
      { type: "emoji", emoji: "⭐", x: 68, y: 41, size: 24, anim: "wiggle", delay: 0.754, dur: 1.63 },
      { type: "emoji", emoji: "🌟", x: 49, y: 21, size: 18, anim: "blink", delay: 1.603, dur: 1.65 },
      { type: "emoji", emoji: "⭐", x: 75, y: 83, size: 17, anim: "blink", delay: 1.945, dur: 1.88 }
    ],
  },
  crab_sports_41_992: {
    v: 1,
    loop: 2.08,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ffe0b2", opacity: 0.36, anim: "bounce", dur: 1.55, r: 44.89 },
      { type: "emoji", emoji: "🦀", x: 38, y: 50, size: 34, anim: "bounce", dur: 1.41 },
      { type: "emoji", emoji: "🍫", x: 72, y: 46, size: 25, anim: "rise", delay: 0.707, dur: 1.8 },
      { type: "emoji", emoji: "🌟", x: 12, y: 54, size: 20, anim: "pop", delay: 0.081, dur: 2 },
      { type: "emoji", emoji: "🎊", x: 87, y: 68, size: 24, anim: "blink", delay: 0.568, dur: 1.86 },
      { type: "emoji", emoji: "✨", x: 56, y: 79, size: 16, anim: "wiggle", delay: 1.281, dur: 2.26 },
      { type: "emoji", emoji: "🔥", x: 52, y: 33, size: 18, anim: "rise", delay: 0.872, dur: 1.28 },
      { type: "emoji", emoji: "💫", x: 27, y: 84, size: 15, anim: "blink", delay: 1.148, dur: 1.62 },
      { type: "emoji", emoji: "💖", x: 31, y: 70, size: 13, anim: "blink", delay: 1.466, dur: 1.03 }
    ],
  },
  crab_food_41_993: {
    v: 1,
    loop: 2.25,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#a5d6a7", opacity: 0.33, anim: "wiggle", dur: 1.21, r: 44.41 },
      { type: "emoji", emoji: "🦀", x: 57, y: 50, size: 39, anim: "wiggle", dur: 1.43 },
      { type: "emoji", emoji: "⭐", x: 85, y: 19, size: 20, anim: "pop", delay: 0.898, dur: 1.71 },
      { type: "emoji", emoji: "🎈", x: 74, y: 87, size: 13, anim: "pop", delay: 0.236, dur: 1.71 },
      { type: "emoji", emoji: "✨", x: 19, y: 43, size: 11, anim: "blink", delay: 1.154, dur: 1.14 },
      { type: "emoji", emoji: "✨", x: 82, y: 64, size: 18, anim: "blink", delay: 1.197, dur: 1.37 }
    ],
  },
  crab_space_41_994: {
    v: 1,
    loop: 4.21,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#512da8", opacity: 0.33, anim: "breathe", dur: 3.3, r: 44.13 },
      { type: "emoji", emoji: "🦀", x: 63, y: 45, size: 39, anim: "breathe", dur: 3.6 },
      { type: "emoji", emoji: "🌿", x: 38, y: 65, size: 19, anim: "wiggle", delay: 0.258, dur: 1.4 },
      { type: "emoji", emoji: "🎊", x: 13, y: 72, size: 17, anim: "pop", delay: 0.369, dur: 2.39 },
      { type: "emoji", emoji: "🌟", x: 22, y: 62, size: 12, anim: "blink", delay: 1.449, dur: 1.93 },
      { type: "emoji", emoji: "⭐", x: 62, y: 69, size: 12, anim: "blink", delay: 1.164, dur: 1.72 }
    ],
  },
  crab_fantasy_41_995: {
    v: 1,
    loop: 2.84,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#ff5722", opacity: 0.31, anim: "pulse", dur: 2, r: 46.06 },
      { type: "emoji", emoji: "🦀", x: 34, y: 48, size: 33, anim: "pulse", dur: 2.14 },
      { type: "emoji", emoji: "🤠", x: 50, y: 16, size: 32, anim: "bounce", delay: 0.35, dur: 1.79 },
      { type: "emoji", emoji: "🍂", x: 32, y: 71, size: 19, anim: "rise", delay: 0.596, dur: 1.65 },
      { type: "emoji", emoji: "❤️", x: 22, y: 24, size: 12, anim: "rise", delay: 1.289, dur: 2.08 },
      { type: "emoji", emoji: "❄️", x: 52, y: 86, size: 16, anim: "blink", delay: 0.743, dur: 2.08 },
      { type: "emoji", emoji: "🌟", x: 74, y: 84, size: 14, anim: "blink", delay: 1.533, dur: 1.97 },
      { type: "emoji", emoji: "⭐", x: 56, y: 15, size: 15, anim: "blink", delay: 1.964, dur: 1.51 }
    ],
  },
  crab_office_41_996: {
    v: 1,
    loop: 2.33,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 70, fill: "#f06292", opacity: 0.37, anim: "pulse", dur: 1.98, r: 47.44 },
      { type: "emoji", emoji: "🦀", x: 57, y: 54, size: 32, anim: "pulse", dur: 2.18 },
      { type: "emoji", emoji: "🧢", x: 52, y: 16, size: 30, anim: "bounce", delay: 0.654, dur: 1.9 },
      { type: "emoji", emoji: "🌟", x: 69, y: 28, size: 27, anim: "pop", delay: 0.987, dur: 1.92 },
      { type: "emoji", emoji: "🌸", x: 13, y: 75, size: 16, anim: "rise", delay: 0.638, dur: 1.97 },
      { type: "emoji", emoji: "🎈", x: 52, y: 46, size: 15, anim: "pop", delay: 0.776, dur: 1.74 },
      { type: "emoji", emoji: "🍂", x: 59, y: 36, size: 15, anim: "pop", delay: 0.65, dur: 1.79 },
      { type: "emoji", emoji: "💖", x: 64, y: 73, size: 13, anim: "blink", delay: 1.716, dur: 1.36 },
      { type: "emoji", emoji: "🌟", x: 69, y: 72, size: 11, anim: "blink", delay: 0.646, dur: 1.25 }
    ],
  },
  crab_fitness_41_997: {
    v: 1,
    loop: 3.13,
    bg: null,
    layers: [
      { type: "circle", x: 50, y: 50, fill: "#ba68c8", opacity: 0.52, anim: "float", dur: 3.02, r: 46.53 },
      { type: "emoji", emoji: "🦀", x: 40, y: 50, size: 43, anim: "float", dur: 2.85 },
      { type: "emoji", emoji: "👑", x: 50, y: 14, size: 29, anim: "bounce", delay: 0.678, dur: 1.87 },
      { type: "emoji", emoji: "🎀", x: 67, y: 29, size: 18, anim: "float", delay: 0.762, dur: 1.72 },
      { type: "emoji", emoji: "🔥", x: 88, y: 32, size: 20, anim: "blink", delay: 0.07, dur: 1.29 },
      { type: "emoji", emoji: "✨", x: 70, y: 54, size: 15, anim: "blink", delay: 1.506, dur: 1.98 },
      { type: "emoji", emoji: "💫", x: 84, y: 71, size: 13, anim: "blink", delay: 1.959, dur: 1.67 }
    ],
  },
  crab_travel_41_998: {
    v: 1,
    loop: 3.3,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 38, y: 49, size: 33, anim: "settle", dur: 2.89 },
      { type: "emoji", emoji: "👮", x: 50, y: 14, size: 31, anim: "bounce", delay: 0.473, dur: 1.62 },
      { type: "emoji", emoji: "🌹", x: 67, y: 44, size: 27, anim: "rise", delay: 0.936, dur: 1.8 },
      { type: "emoji", emoji: "⭐", x: 36, y: 83, size: 13, anim: "rise", delay: 0.072, dur: 1.31 },
      { type: "emoji", emoji: "🎈", x: 69, y: 66, size: 19, anim: "blink", delay: 0.137, dur: 1.84 },
      { type: "emoji", emoji: "⭐", x: 11, y: 29, size: 25, anim: "pop", delay: 0.474, dur: 1.34 },
      { type: "emoji", emoji: "⭐", x: 34, y: 33, size: 13, anim: "blink", delay: 1.204, dur: 1.65 },
      { type: "emoji", emoji: "⭐", x: 45, y: 16, size: 15, anim: "blink", delay: 1.822, dur: 1.31 }
    ],
  },
  crab_art_41_999: {
    v: 1,
    loop: 1.9,
    bg: null,
    layers: [
      { type: "emoji", emoji: "🦀", x: 53, y: 48, size: 40, anim: "bounce", dur: 1.18 },
      { type: "emoji", emoji: "🌿", x: 57, y: 54, size: 13, anim: "blink", delay: 1.147, dur: 1.31 },
      { type: "emoji", emoji: "❄️", x: 41, y: 60, size: 14, anim: "float", delay: 1.089, dur: 2.3 },
      { type: "emoji", emoji: "⭐", x: 67, y: 50, size: 17, anim: "pop", delay: 0.939, dur: 1.72 },
      { type: "emoji", emoji: "✨", x: 15, y: 67, size: 12, anim: "blink", delay: 0.651, dur: 1.8 },
      { type: "emoji", emoji: "💖", x: 38, y: 21, size: 16, anim: "blink", delay: 0.593, dur: 1.41 }
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
