import type { catalogGift, messageGift, receivedGift } from "@shalter/shared/schemas/gifts";
import type { z } from "zod";

/** Подарок витрины: встроенный или нарисованный (custom). */
export type CatalogGift = z.infer<typeof catalogGift>;
/** Запись на полке полученных подарков (user.giftsReceived). */
export type ReceivedGift = z.infer<typeof receivedGift>;
/** message.gift у сообщения о подарке. */
export type MessageGift = z.infer<typeof messageGift>;

/** Что умеют рисовать картинка и карточка: любой из трёх видов подарка (или его часть). */
export type GiftLike = {
  id?: string;
  giftId?: string;
  emoji?: string;
  name?: string;
  mediaUrl?: string;
  scene?: unknown;
  serial?: number;
  supply?: number;
  priceStars?: number;
  priceRub?: number;
  background?: { from: string; to: string; pattern?: string; symbol?: string };
  anon?: true;
  note?: string;
  fromId?: string | null;
  fromName?: string | null;
  fromAvatarColor?: string | null;
  fromAvatarImage?: string | null;
  pinned?: true;
  exclusive?: true;
  custom?: true;
};

/** Получатель подарка — как GiftRecipient в entities/user. */
export type GiftRecipient = { id: string; name: string };
