// Признаки подарка и его картинка — перенос public/js/lib/giftTraits.js. Встроенные сцены лежат
// по файлу на подарок в /gift-scenes/<id>.json (scripts/gift-scenes.js) и грузятся только для
// подарков у экрана; какие сцены есть — в /gift-scenes/index.json (25 тыс. id, ~110 КБ gzip).
import { emojiArtName, lottieNameFor, renderCustomScene, renderEmojiArt, renderLottie, renderScene } from "@/shared/lib/anim";

import type { GiftLike } from "../model/types";

import { GIFT_SYMBOLS, hash01 } from "./gift-background";
import { TG_BACKDROPS, TG_MODELS, type TgModel } from "./tg-gift-data";

const MODELS: TgModel[] = [
  { name: "Обычная", rarity: 40 },
  { name: "Морозная", rarity: 18 },
  { name: "Закатная", rarity: 14 },
  { name: "Неоновая", rarity: 10 },
  { name: "Золотая", rarity: 8 },
  { name: "Уютный космос", rarity: 5 },
  { name: "Вирус", rarity: 3 },
  { name: "Затмение", rarity: 2 },
];

const BACKDROPS = TG_BACKDROPS.map((b) => ({ name: b.name, center: b.colors[0], edge: b.colors[1], pattern: b.pattern, rarity: b.rarity }));
const COLLECTION_MODELS: Record<string, TgModel[] | undefined> = { tg_plush_pepe: TG_MODELS.plushpepe };

function pick<T extends { rarity: number }>(list: T[], roll: number): T {
  const total = list.reduce((sum, item) => sum + item.rarity, 0);
  let point = roll * total;
  for (const item of list) {
    point -= item.rarity;
    if (point <= 0) return item;
  }
  return list[list.length - 1]!;
}

/** Модель, фон и узор подарка — детерминированно по id и номеру. */
export function giftTraits(gift: GiftLike | null | undefined) {
  const seed = `${gift?.giftId ?? gift?.id ?? gift?.emoji ?? "gift"}#${gift?.serial ?? 0}`;
  const symbol = pick(GIFT_SYMBOLS, hash01(seed, 3));
  const key = gift?.giftId ?? gift?.id ?? "";
  return {
    model: pick(COLLECTION_MODELS[key] ?? MODELS, hash01(seed, 1)),
    backdrop: { ...pick(BACKDROPS, hash01(seed, 2)), symbol },
    symbol,
  };
}

let sceneIds: Set<string> | null = null;
let sceneIdsPromise: Promise<Set<string> | null> | null = null;
const scenes = new Map<string, unknown>();

// Список сцен не загрузился (нет сети, сбой сервера) — подарок рисуется запасной картинкой,
// а следующий показ спросит список снова.
function loadSceneIds() {
  sceneIdsPromise ??= fetch("/gift-scenes/index.json")
    .then((res) => {
      if (!res.ok) throw new Error(`gift scenes index: ${res.status}`);
      return res.json() as Promise<unknown>;
    })
    .then((ids) => (sceneIds = new Set(Array.isArray(ids) ? (ids as string[]) : [])))
    .catch(() => {
      sceneIdsPromise = null;
      return null;
    });
  return sceneIdsPromise;
}

function builtinSceneId(gift: GiftLike | null | undefined) {
  if (gift?.mediaUrl || !sceneIds) return null;
  for (const id of [gift?.giftId, gift?.id]) if (typeof id === "string" && sceneIds.has(id)) return id;
  return null;
}

// Сцены нет (404) — запоминаем null: подарок рисуется запасной картинкой. Сбой сети или
// сервера не запоминается — следующий показ попробует снова.
function loadScene(id: string): Promise<unknown> {
  if (!scenes.has(id)) {
    scenes.set(
      id,
      fetch(`/gift-scenes/${encodeURIComponent(id)}.json`)
        .then((res) => {
          if (res.status === 404) return null;
          if (!res.ok) throw new Error(`gift scene ${id}: ${res.status}`);
          return res.json() as Promise<unknown>;
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
  const v = scenes.get(id);
  return v instanceof Promise ? v : Promise.resolve(v);
}

export type GiftArtOptions = { size?: number; replay?: boolean };

// Картинки подарков рисуются, только когда подарок подъезжает к экрану: в витрине их
// больше сотни, и почти у каждой своя lottie-анимация (~70 файлов, 8 МБ JSON) — разом
// они грузились, разбирались и строили SVG, и витрина открывалась секундами. Один
// наблюдатель на все подарки; без IntersectionObserver (старый браузер, тесты) — сразу.
const pending = new WeakMap<Element, () => void>();
let viewObserver: IntersectionObserver | null = null;
let observerCtor: typeof IntersectionObserver | null = null;

function whenNearView(el: Element, start: () => void) {
  const IO = typeof IntersectionObserver === "function" ? IntersectionObserver : null;
  if (!IO) return start();
  if (!viewObserver || observerCtor !== IO) {
    observerCtor = IO;
    viewObserver = new IO(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          viewObserver?.unobserve(e.target);
          const run = pending.get(e.target);
          pending.delete(e.target);
          run?.();
        }
      },
      { rootMargin: "200px" }
    );
  }
  pending.set(el, start);
  viewObserver.observe(el);
}

/**
 * Узел сразу: рамка размера картинки с эмодзи-заглушкой. Картинка (сцена, анимация,
 * эмодзи-рисунок) строится, когда подарок рядом с экраном, — и только тогда грузятся
 * список сцен и сама сцена. Картинка по ссылке (mediaUrl) списка сцен не ждёт.
 */
export function renderGiftArt(gift: GiftLike | null | undefined, opts: GiftArtOptions = {}): Node {
  const size = opts.size ?? 84;
  if (gift?.scene) return renderCustomScene(gift.scene, { size, replay: opts.replay ?? true });
  if (gift?.mediaUrl) return renderWithScene(null, gift, opts);

  const host = document.createElement("span");
  host.className = "gift-art-host";
  Object.assign(host.style, { display: "inline-flex", alignItems: "center", justifyContent: "center", width: `${size}px`, height: `${size}px` });
  host.appendChild(renderScene(gift?.emoji ?? "🎁", { size, replay: false }));
  whenNearView(host, () => {
    // Список сцен и сцена уже в памяти — картинка сразу, без лишнего кадра с заглушкой.
    if (sceneIds) {
      const id = builtinSceneId(gift);
      const scene = id ? scenes.get(id) : null;
      if (!id || (scenes.has(id) && !(scene instanceof Promise))) return void host.replaceChildren(renderWithScene(scene, gift, opts));
    }
    void loadSceneIds()
      .then(() => {
        const id = builtinSceneId(gift);
        return id ? loadScene(id) : null;
      })
      .then((scene) => host.replaceChildren(renderWithScene(scene, gift, opts)));
  });
  return host;
}

function renderWithScene(builtin: unknown, gift: GiftLike | null | undefined, { size = 84, replay = true }: GiftArtOptions = {}): Node {
  if (builtin && !gift?.mediaUrl) return renderCustomScene(builtin, { size, replay });

  const asEmoji = () => renderScene(gift?.emoji ?? "🎁", { size, replay });
  const lottie = lottieNameFor(gift ? { giftId: gift.giftId, id: gift.id, emoji: gift.emoji } : null);
  const asPicture = () => renderEmojiArt(lottie ?? emojiArtName(gift?.emoji), { size, fallback: asEmoji }) ?? asEmoji();
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
  img.style.objectFit = "contain";
  img.loading = "lazy";
  img.decoding = "async";
  img.addEventListener("error", () => img.replaceWith(art()), { once: true });
  return img;
}
