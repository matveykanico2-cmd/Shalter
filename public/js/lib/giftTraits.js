// Признаки подарка и его картинка. Встроенные сцены лежат по файлу на подарок
// в /gift-scenes/<id>.json (scripts/gift-scenes.js) и грузятся только для тех
// подарков, что показываются; какие сцены есть — в /gift-scenes/index.json.

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

let sceneIds = null;
let sceneIdsPromise = null;
const scenes = new Map();

// Список сцен не загрузился (нет сети, сбой сервера) — этот подарок рисуется запасной
// картинкой, а следующий показ спросит список снова.
function loadSceneIds() {
  sceneIdsPromise ??= fetch("/gift-scenes/index.json")
    .then((res) => {
      if (!res.ok) throw new Error(`gift scenes index: ${res.status}`);
      return res.json();
    })
    .then((ids) => (sceneIds = new Set(Array.isArray(ids) ? ids : [])))
    .catch(() => {
      sceneIdsPromise = null;
      return null;
    });
  return sceneIdsPromise;
}

function builtinSceneId(gift) {
  if (gift?.mediaUrl) return null;
  for (const id of [gift?.giftId, gift?.id]) if (typeof id === "string" && sceneIds.has(id)) return id;
  return null;
}

// Сцены нет (404) — запоминаем null: подарок рисуется запасной картинкой. Сбой сети или
// сервера не запоминается — следующий показ попробует снова.
function loadScene(id) {
  if (!scenes.has(id)) {
    scenes.set(
      id,
      fetch(`/gift-scenes/${encodeURIComponent(id)}.json`)
        .then((res) => {
          if (res.status === 404) return null;
          if (!res.ok) throw new Error(`gift scene ${id}: ${res.status}`);
          return res.json();
        })
        .then((scene) => {
          scenes.set(id, scene);
          return scene;
        })
        .catch(() => {
          scenes.delete(id);
          return null;
        })
    );
  }
  return scenes.get(id);
}

// Возвращает узел сразу: вызывающие кладут его прямо в el(). Пока список сцен или
// сама сцена не загружены, отдаётся обёртка (display: contents), в которую картинка
// дорисовывается после загрузки.
export function renderGiftArt(gift, opts = {}) {
  if (gift?.scene) return renderCustomScene(gift.scene, { size: opts.size ?? 84, replay: opts.replay ?? true });
  if (sceneIds) {
    const id = builtinSceneId(gift);
    const scene = id ? scenes.get(id) : null;
    if (!id || (scenes.has(id) && !(scene instanceof Promise))) return renderWithScene(scene, gift, opts);
  }
  const slot = document.createElement("span");
  slot.className = "gift-art-slot";
  slot.style.display = "contents";
  loadSceneIds()
    .then(() => {
      const id = sceneIds ? builtinSceneId(gift) : null;
      return id ? loadScene(id) : null;
    })
    .then((scene) => slot.replaceChildren(renderWithScene(scene, gift, opts)));
  return slot;
}

function renderWithScene(builtin, gift, { size = 84, replay = true } = {}) {
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