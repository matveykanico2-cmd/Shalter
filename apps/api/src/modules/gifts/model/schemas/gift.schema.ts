import { z } from "zod";
import { raw, requestBody, text } from "../../../../common/lib/zod.js";
import { sanitizeGiftBackground } from "../../lib/gift-background.js";
import { parseSupply } from "../../lib/gift-catalog.js";

// Поля приводятся так же, как в server/routes/gifts.js. Проверки там почти всегда идут после
// прав, поиска подарка или сверки получателя с отправителем, поэтому их тексты отвечает
// сервис; в схеме — только название своего подарка, которое маршрут проверяет первым.
// Сцены остаются как пришли: их чистит sanitizeScene из server/ (мост), уже в сервисе.

const MAX_GIFT_NAME = 60;
const NO_NAME = "Назовите подарок";

export const sendGiftSchema = requestBody({
  giftId: raw(),
  /** Не строка — получатель не найден (404 в сервисе). */
  recipientId: raw().transform((v) => (typeof v === "string" ? v : undefined)),
  background: raw().transform(sanitizeGiftBackground),
  anonymous: raw().transform((v) => !!v),
  /** Подпись читают только покупка и свой подарок (giftNote). */
  note: raw(),
});
export type SendGiftDto = z.infer<typeof sendGiftSchema>;

export const pinGiftSchema = requestBody({ pinned: raw().transform((v) => v !== false) });
export type PinGiftDto = z.infer<typeof pinGiftSchema>;

export const createUserGiftSchema = requestBody({
  name: text()
    .transform((v) => v.trim().slice(0, MAX_GIFT_NAME))
    .refine((v) => !!v, { error: NO_NAME }),
  scene: raw(),
});
export type CreateUserGiftDto = z.infer<typeof createUserGiftSchema>;

/** Правка: нет поля — не меняется; пустое название — 400 раньше проверки сцены и поиска подарка. */
export const patchUserGiftSchema = requestBody({
  name: raw()
    .transform((v) => (v === undefined ? undefined : String(v).trim().slice(0, MAX_GIFT_NAME)))
    .refine((v) => v !== "", { error: NO_NAME }),
  scene: raw(),
});
export type PatchUserGiftDto = z.infer<typeof patchUserGiftSchema>;

/** Тираж: число или текст ошибки (400 в сервисе после поиска подарка). */
export const supplySchema = requestBody({ supply: raw().transform(parseSupply) });
export type SupplyDto = z.infer<typeof supplySchema>;

export const sceneSchema = requestBody({ scene: raw() });
export type SceneDto = z.infer<typeof sceneSchema>;

export const catalogGiftSchema = requestBody({
  emoji: text().transform((v) => v.trim()),
  name: text().transform((v) => v.trim()),
  priceStars: raw().transform(Number),
  premiumDays: raw().transform((v) => (v === null ? null : Number.isInteger(Number(v)) ? Number(v) : 0)),
  /** Тираж разбирается, только если подарок эксклюзивный. */
  supply: raw(),
  exclusive: raw().transform((v) => !!v),
  gifUrl: raw(),
  scene: raw(),
});
export type CatalogGiftDto = z.infer<typeof catalogGiftSchema>;
