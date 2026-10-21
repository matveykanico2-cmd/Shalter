// Подарки: витрина и каталог (server/data/gifts.js listGifts/rowToGift + withStars),
// полка полученных (deliverGift → addReceivedGift, withGiftSenders) и вложение
// gift в сообщении о подарке (lib/deliverGift.js). Ответы — server/routes/gifts.js.
import { z } from "zod";
import { isoDate, okBody } from "./common";
import { publicUser } from "./user";

const hexColor = z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/);

/** Ключевой кадр слоя (sanitizeScene: keys). */
const sceneKey = z.strictObject({
  t: z.number(),
  dx: z.number(),
  dy: z.number(),
  rot: z.number(),
  scale: z.number(),
  opacity: z.number(),
  fill: hexColor.optional(),
});

const sceneStroke = z.strictObject({ color: hexColor, width: z.number(), pts: z.array(z.tuple([z.number(), z.number()])) });

/** Слой сцены (lib/sanitizeScene.js sanitizeLayer): общие поля + поля своего типа. */
export const sceneLayer = z.strictObject({
  type: z.enum(["draw", "emoji", "circle", "ellipse", "rect", "star", "heart", "text"]),
  x: z.number(),
  y: z.number(),
  fill: hexColor,
  opacity: z.number(),
  rot: z.number(),
  anim: z.enum(["none", "bounce", "float", "spin", "pulse", "heartbeat", "wave", "swing", "shake", "pop", "blink", "rise", "wiggle"]),
  delay: z.number(),
  dur: z.number(),
  emoji: z.string().optional(),
  size: z.number().optional(),
  text: z.string().optional(),
  r: z.number().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
  rx: z.number().optional(),
  strokes: z.array(sceneStroke).optional(),
  keys: z.array(sceneKey).optional(),
});

export const giftScene = z.strictObject({
  v: z.literal(1),
  loop: z.number(),
  bg: hexColor.nullable(),
  layers: z.array(sceneLayer),
});

/** Фон подарка (lib/giftBackground.js). */
export const giftBackground = z.strictObject({
  from: hexColor,
  to: hexColor,
  pattern: hexColor.optional(),
  symbol: z.string().optional(),
});

/**
 * Подарок витрины/каталога. Встроенный — запись из GIFTS (+ edited/hidden/supply/scene,
 * если админ его правил); созданный админом или пользователем — rowToGift (custom: true).
 * remaining — у тиражных в GET /, issued — у тиражных в GET /catalog.
 */
export const catalogGift = z.strictObject({
  id: z.string(),
  emoji: z.string(),
  name: z.string(),
  priceRub: z.number(),
  priceStars: z.number(),
  premiumDays: z.number().nullable(),
  supply: z.number().optional(),
  exclusive: z.literal(true).optional(),
  edited: z.literal(true).optional(),
  hidden: z.literal(true).optional(),
  scene: giftScene.optional(),
  mediaUrl: z.string().optional(),
  ownerId: z.string().optional(),
  custom: z.literal(true).optional(),
  remaining: z.number().optional(),
  issued: z.number().optional(),
});

/** Запись на полке полученных подарков (user.giftsReceived). */
export const receivedGift = z.strictObject({
  id: z.string().regex(/^rg_[a-z0-9]+_[0-9a-f]{8}$/),
  giftId: z.string(),
  priceRub: z.number(),
  priceStars: z.number(),
  emoji: z.string(),
  name: z.string(),
  mediaUrl: z.string().optional(),
  scene: giftScene.optional(),
  custom: z.literal(true).optional(),
  background: giftBackground.optional(),
  anon: z.literal(true).optional(),
  note: z.string().optional(),
  fromId: z.string().nullable(),
  fromName: z.string().nullable(),
  // У анонимного подарка аватара отправителя нет совсем; у обычного — цвет/картинка или null.
  fromAvatarColor: z.string().nullable().optional(),
  fromAvatarImage: z.string().nullable().optional(),
  at: isoDate,
  serial: z.number().optional(),
  supply: z.number().optional(),
  pinned: z.literal(true).optional(),
});

/** message.gift у сообщения type: "gift". */
export const messageGift = z.strictObject({
  giftId: z.string(),
  emoji: z.string(),
  name: z.string(),
  priceRub: z.number(),
  premiumDays: z.number().nullable(),
  durationLabel: z.string().nullable(),
  priceStars: z.number(),
  mediaUrl: z.string().optional(),
  scene: giftScene.optional(),
  custom: z.literal(true).optional(),
  background: giftBackground.optional(),
  anon: z.literal(true).optional(),
  note: z.string().optional(),
  fromId: z.string().nullable(),
  fromName: z.string().nullable(),
  fromAvatarColor: z.string().nullable().optional(),
  fromAvatarImage: z.string().nullable().optional(),
  recipientId: z.string(),
  serial: z.number().optional(),
  supply: z.number().optional(),
  exclusive: z.literal(true).optional(),
});

/** Пользователь с полкой подарков, где giftsReceived проверяется строго. */
export const userWithGifts = publicUser.extend({ giftsReceived: z.array(receivedGift) });

export const shopBody = z.strictObject({ gifts: z.array(catalogGift), balance: z.number() });
export const catalogBody = z.strictObject({ gifts: z.array(catalogGift), supplyMin: z.number(), supplyMax: z.number() });
export const giftBody = z.strictObject({ gift: catalogGift });
export const giftListBody = z.strictObject({ gifts: z.array(catalogGift) });

/** POST /buy. */
export const buyBody = z.strictObject({ chatId: z.string(), serial: z.number().nullable(), delivered: z.literal(true), balance: z.number() });
/** POST /buy при нехватке звёзд — 402. */
export const buyNotEnough = z.strictObject({ error: z.string(), needStars: z.number(), balance: z.number() });
/** POST /request от главного админа — подарок выдаётся сразу. */
export const requestDeliveredBody = z.strictObject({ chatId: z.string(), adminPhone: z.string(), delivered: z.literal(true), serial: z.number().nullable() });
/** POST /deliver. */
export const deliverBody = z.strictObject({ user: userWithGifts, serial: z.number().nullable() });
/** POST /received/:id/convert. */
export const convertBody = z.strictObject({ balance: z.number(), gained: z.number(), user: userWithGifts });
/** DELETE /received/:id, POST /received/:id/pin. */
export const shelfBody = z.strictObject({ user: userWithGifts });
/** DELETE /catalog/:id. */
export const catalogRemovedBody = z.strictObject({ ok: z.literal(true), removed: z.literal(true) });
export const catalogHiddenBody = z.strictObject({ ok: z.literal(true), hidden: z.literal(true) });
export const catalogRestoredBody = z.strictObject({ ok: z.literal(true), gift: catalogGift });
/** POST /custom/send. */
export const customSendBody = z.strictObject({ chatId: z.string(), delivered: z.literal(true) });
export const customDeletedBody = okBody;

/** WS self:updated после подарка/Premium — publicUser получателя. */
export const wsSelfUpdated = z.strictObject({ type: z.literal("self:updated"), user: publicUser });
