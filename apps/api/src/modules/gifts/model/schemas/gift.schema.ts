import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Поля как пришли: проверки и тексты ошибок — в сервисах, как в server/routes/gifts.js.
export const sendGiftSchema = requestBody({ giftId: raw(), recipientId: raw(), background: raw(), anonymous: raw(), note: raw() });
export type SendGiftDto = z.infer<typeof sendGiftSchema>;

export const pinGiftSchema = requestBody({ pinned: raw() });
export type PinGiftDto = z.infer<typeof pinGiftSchema>;

export const userGiftSchema = requestBody({ name: raw(), scene: raw() });
export type UserGiftDto = z.infer<typeof userGiftSchema>;

export const supplySchema = requestBody({ supply: raw() });
export type SupplyDto = z.infer<typeof supplySchema>;

export const sceneSchema = requestBody({ scene: raw() });
export type SceneDto = z.infer<typeof sceneSchema>;

export const catalogGiftSchema = requestBody({
  emoji: raw(),
  name: raw(),
  priceStars: raw(),
  premiumDays: raw(),
  supply: raw(),
  exclusive: raw(),
  gifUrl: raw(),
  scene: raw(),
});
export type CatalogGiftDto = z.infer<typeof catalogGiftSchema>;
