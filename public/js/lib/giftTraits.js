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

let builtinScenesPromise = null;

async function loadBuiltinScenes() {
  if (!builtinScenesPromise) {
    builtinScenesPromise = import("/js/lib/giftTraits.scenes.js").then((m) => m.BUILTIN_GIFT_SCENES);
  }
  return builtinScenesPromise;
}

// Синхронная: вызывающие вставляют результат прямо в разметку (el(...)), Promise туда
// нельзя. Встроенные сцены грузятся лениво, поэтому для них отдаём контейнер и
// подменяем содержимое, когда сцены подгрузились.
export function renderGiftArt(gift, { size = 84, replay = true } = {}) {
  if (gift?.scene) {
    return renderCustomScene(gift.scene, { size, replay });
  }
  if (gift?.mediaUrl) return renderPlainGiftArt(gift, { size, replay });

  const host = document.createElement("span");
  host.className = "gift-art-host";
  host.style.display = "inline-flex";
  host.style.width = `${size}px`;
  host.style.height = `${size}px`;
  host.style.alignItems = "center";
  host.style.justifyContent = "center";
  host.appendChild(renderPlainGiftArt(gift, { size, replay }));
  loadBuiltinScenes()
    .then((scenes) => {
      const builtin = scenes[gift?.giftId] ?? scenes[gift?.id];
      if (builtin && !gift?.mediaUrl) host.replaceChildren(renderCustomScene(builtin, { size, replay }));
    })
    .catch(() => {});
  return host;
}

function renderPlainGiftArt(gift, { size, replay }) {
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