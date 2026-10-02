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

const BACKDROPS = [
  { name: "Молочный", rarity: 30, colors: ["#f6d9e7", "#e7c3f0"] },
  { name: "Мятный", rarity: 20, colors: ["#c8f0e2", "#a5d8f3"] },
  { name: "Персиковый", rarity: 16, colors: ["#ffd8b0", "#ffb3c1"] },
  { name: "Электрик", rarity: 12, colors: ["#a78bfa", "#7c3aed"] },
  { name: "Кобальт", rarity: 9, colors: ["#5b8def", "#2b3fa0"] },
  { name: "Изумруд", rarity: 7, colors: ["#34d399", "#059669"] },
  { name: "Пурпур", rarity: 4, colors: ["#f472b6", "#7e22ce"] },
  { name: "Оникс", rarity: 2, colors: ["#4b5563", "#111827"] },
];

const SYMBOLS = [
  { name: "Сердце", rarity: 26, glyph: "❤️" },
  { name: "Звезда", rarity: 20, glyph: "⭐" },
  { name: "Дельфин", rarity: 15, glyph: "🐬" },
  { name: "Молния", rarity: 12, glyph: "⚡" },
  { name: "Перо", rarity: 10, glyph: "🪶" },
  { name: "Чили", rarity: 8, glyph: "🌶️" },
  { name: "Комета", rarity: 6, glyph: "☄️" },
  { name: "Корона", rarity: 3, glyph: "👑" },
];

import { renderScene } from "./animScenes.js";
import { renderCustomScene } from "./customScene.js";

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
    model: pick(MODELS, hash(seed, 1)),
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
  return renderScene(gift?.emoji, { size, replay });
}
