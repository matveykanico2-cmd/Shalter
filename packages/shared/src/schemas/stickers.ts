// Стикерпаки (server/routes/stickers.js, data/stickerPacks.js + lib/sanitizeSticker.js)
// и каталог своих эмодзи (server/routes/customEmoji.js, data/customEmoji.js).
// Сцена — результат lib/sanitizeScene.js.
import { z } from "zod";
import { isoDate } from "./common";

const sceneLayer = z.looseObject({
  type: z.enum(["draw", "emoji", "circle", "ellipse", "rect", "star", "heart", "text"]),
  x: z.number(),
  y: z.number(),
  fill: z.string(),
  opacity: z.number(),
  rot: z.number(),
  anim: z.string(),
  delay: z.number(),
  dur: z.number(),
});

export const scene = z.strictObject({
  v: z.literal(1),
  loop: z.number(),
  bg: z.string().nullable(),
  layers: z.array(sceneLayer).min(1),
});

/** Стикер из эмодзи: scene — только имя встроенной сцены; anim при сохранении отбрасывается. */
const emojiSticker = z.strictObject({ emoji: z.string().min(1), name: z.string(), scene: z.string().optional(), uid: z.string().optional() });
const imageSticker = z.strictObject({
  kind: z.literal("image"),
  url: z.string().regex(/^\/uploads\//),
  emoji: z.string(),
  name: z.string(),
  animated: z.literal(true).optional(),
  uid: z.string().optional(),
});
const customSticker = z.strictObject({ kind: z.literal("custom"), scene, emoji: z.string(), name: z.string(), uid: z.string().optional() });

export const sticker = z.union([imageSticker, customSticker, emojiSticker]);

export const stickerPack = z.strictObject({
  id: z.string().regex(/^sp_[a-z0-9]+_[a-z0-9]{1,6}$/),
  ownerId: z.string(),
  name: z.string(),
  stickers: z.array(sticker),
  createdAt: isoDate,
});

export const packsListBody = z.strictObject({ packs: z.array(stickerPack), maxStickers: z.literal(60) });
export const packBody = z.strictObject({ pack: stickerPack });

export const customEmoji = z.strictObject({
  id: z.string().regex(/^ce_[a-z0-9]+_[a-z0-9]{1,6}$/),
  name: z.string(),
  scene,
  createdAt: isoDate,
});
export const emojiListBody = z.strictObject({ emoji: z.array(customEmoji), maxEmoji: z.literal(500) });
export const emojiBody = z.strictObject({ emoji: customEmoji });
