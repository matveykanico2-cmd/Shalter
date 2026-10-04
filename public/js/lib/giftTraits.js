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
// редкость — их доля среди выпущенных подарков.
const BACKDROPS = TG_BACKDROPS;
const SYMBOLS = TG_SYMBOLS.map((sym) => ({ ...sym, image: `/gift-symbols/${sym.id}.webp` }));
// У подарков-коллекций из Telegram — свои модели.
const COLLECTION_MODELS = { tg_plush_pepe: TG_MODELS.plushpepe };

import { renderScene } from "./animScenes.js";
import { renderCustomScene } from "./customScene.js";
import { lottieNameFor, renderLottie } from "./lottie.js";
import { TG_BACKDROPS, TG_SYMBOLS, TG_MODELS } from "./tgGiftData.js";

function hash(str, salt) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

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
  return {
    model: pick(COLLECTION_MODELS[gift?.giftId ?? gift?.id] ?? MODELS, hash(seed, 1)),
    backdrop: pick(BACKDROPS, hash(seed, 2)),
    symbol: pick(SYMBOLS, hash(seed, 3)),
  };
}

export function renderGiftArt(gift, { size = 84, replay = true } = {}) {
  if (gift?.scene) {
    return renderCustomScene(gift.scene, { size, replay });
  }
  if (gift?.mediaUrl) {
    const img = document.createElement("img");
    img.src = gift.mediaUrl;
    img.alt = gift.name ?? "";
    img.className = "gift-media-art";
    img.style.width = `${size}px`;
    img.style.height = `${size}px`;
    if (!replay) img.classList.add("no-entrance");
    return img;
  }
  const lottie = lottieNameFor(gift);
  // У эмодзи Noto кадр покоя — из середины (края бывают пустыми), у анимаций tweb — последний.
  if (lottie) return renderLottie(lottie, { size, replay, rest: lottie.startsWith("emoji/") ? "mid" : "last", fallback: () => renderScene(gift?.emoji, { size, replay }) });
  return renderScene(gift?.emoji, { size, replay });
}
