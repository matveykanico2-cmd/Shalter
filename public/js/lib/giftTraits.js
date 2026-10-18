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
