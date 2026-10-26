// Цена подарка в звёздах; у старых подарков — из рублей (STARS_PER_RUB в messageBubble.js).
const STARS_PER_RUB = 10;

export const formatStars = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("ru-RU");

export const giftStars = (gift: { priceStars?: number | null; priceRub?: number | null }) =>
  gift.priceStars ?? Math.max(1, Math.round((gift.priceRub ?? 0) * STARS_PER_RUB));
