// Стикерпаки (/api/stickers/packs) — паки пользователя, коллекция, отправка стикера в чат.
// Кастомные эмодзи (/api/custom-emoji) — без изменений.
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

const PACK_ID_RE = /^sp_[a-z0-9]+_[a-z0-9]{1,6}$/;
const STICKER_ID_RE = /^st_[0-9a-f]{8}$/;

/** Стикер внутри пака (строка таблицы stickers): файл PNG/WebP, эмодзи, порядок. */
export const sticker = z.strictObject({
  id: z.string().regex(STICKER_ID_RE),
  packId: z.string().regex(PACK_ID_RE),
  url: z.string().regex(/^\/uploads\//),
  emoji: z.string().min(1),
  position: z.number().int().nonnegative(),
  createdAt: isoDate,
});
export type Sticker = z.infer<typeof sticker>;

/** Стикерпак: название, опциональное описание, владелец, набор стикеров, счётчик, флаг коллекции. */
export const stickerPack = z.strictObject({
  id: z.string().regex(PACK_ID_RE),
  ownerId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  stickers: z.array(sticker),
  stickerCount: z.number().int().nonnegative(),
  isAdded: z.boolean(),
  isOwner: z.boolean(),
  createdAt: isoDate,
});
export type StickerPack = z.infer<typeof stickerPack>;

export const packsListBody = z.strictObject({ packs: z.array(stickerPack), maxStickers: z.number().int().nonnegative() });
export type PacksListBody = z.infer<typeof packsListBody>;
export const packBody = z.strictObject({ pack: stickerPack });
export type PackBody = z.infer<typeof packBody>;

/** Создание пака: название (обязательное) и описание (опциональное). */
export const createPackBody = z.strictObject({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
});
export type CreatePackBody = z.infer<typeof createPackBody>;

/** Обновление пака: только переданные поля. */
export const patchPackBody = z.strictObject({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
});
export type PatchPackBody = z.infer<typeof patchPackBody>;

/** Добавление стикера в пак: файл (уже загруженный через /api/uploads, PNG/WebP) и эмодзи. */
export const addStickerBody = z.strictObject({
  file: z.string().regex(/^\/uploads\//),
  emoji: z.string().min(1),
  position: z.number().int().nonnegative().optional(),
});
export type AddStickerBody = z.infer<typeof addStickerBody>;

/** Редактирование стикера: эмодзи и/или позиция. */
export const updateStickerBody = z.strictObject({
  emoji: z.string().min(1).optional(),
  position: z.number().int().nonnegative().optional(),
});
export type UpdateStickerBody = z.infer<typeof updateStickerBody>;

// --- кастомные эмодзи (отдельная функция /api/custom-emoji) ------------------

export const customEmoji = z.strictObject({
  id: z.string().regex(/^ce_[a-z0-9]+_[a-z0-9]{1,6}$/),
  name: z.string(),
  scene,
  createdAt: isoDate,
});
export type CustomEmoji = z.infer<typeof customEmoji>;
export const emojiListBody = z.strictObject({ emoji: z.array(customEmoji), maxEmoji: z.literal(500) });
export const emojiBody = z.strictObject({ emoji: customEmoji });
