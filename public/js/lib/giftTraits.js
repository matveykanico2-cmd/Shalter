// Lazy-loaded gift traits - lightweight version for initial load
// Heavy BUILTIN_GIFT_SCENES loaded on demand

import { renderScene } from "./animScenes.js";
import { renderCustomScene } from "./customScene.js";
import { hash01 } from "./giftBackground.js";
import { lottieNameFor, emojiArtName, renderEmojiArt, renderLottie } from "./lottie.js";
import { TG_BACKDROPS, TG_SYMBOLS, TG_MODELS } from "./tgGiftData.js";

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

const BACKDROPS = TG_BACKDROPS.map((b) => ({
  name: b.name,
  center: b.colors[0],
  edge: b.colors[1],
  pattern: b.pattern,
  rarity: b.rarity,
  symbol: null,
}));
const SYMBOLS = TG_SYMBOLS.map((sym) => ({ ...sym, image: `/gift-symbols/${sym.id}.webp` }));
const COLLECTION_MODELS = { tg_plush_pepe: TG_MODELS.plushpepe };

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
    backdrop: { ...pick(BACKDROPS, hash01(seed, 2)), symbol },
    symbol,
  };
}

let builtinScenes = null;
let builtinScenesPromise = null;

function loadBuiltinScenes() {
  if (!builtinScenesPromise) {
    builtinScenesPromise = import("./giftTraits.scenes.js").then((m) => (builtinScenes = m.BUILTIN_GIFT_SCENES));
  }
  return builtinScenesPromise;
}

// Возвращает узел сразу: вызывающие кладут его прямо в el(). Пока тяжёлый модуль
// встроенных сцен не загружен, отдаётся обёртка (display: contents), в которую
// картинка дорисовывается после загрузки.
export function renderGiftArt(gift, opts = {}) {
  if (gift?.scene) return renderCustomScene(gift.scene, { size: opts.size ?? 84, replay: opts.replay ?? true });
  if (builtinScenes) return renderWithScenes(builtinScenes, gift, opts);
  const slot = document.createElement("span");
  slot.className = "gift-art-slot";
  slot.style.display = "contents";
  loadBuiltinScenes()
    .catch(() => ({}))
    .then((scenes) => slot.replaceChildren(renderWithScenes(scenes, gift, opts)));
  return slot;
}

function renderWithScenes(BUILTIN_GIFT_SCENES, gift, { size = 84, replay = true } = {}) {
  const builtin = BUILTIN_GIFT_SCENES[gift?.giftId] ?? BUILTIN_GIFT_SCENES[gift?.id];
  if (builtin && !gift?.mediaUrl) return renderCustomScene(builtin, { size, replay });

  const asEmoji = () => renderScene(gift?.emoji, { size, replay });
  const lottie = lottieNameFor(gift);
  
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
  img.addEventListener("error", () => img.replaceWith(art()), { once: true });
  return img;
}