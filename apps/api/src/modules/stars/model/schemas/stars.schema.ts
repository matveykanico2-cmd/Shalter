import { z } from "zod";
import { raw, requestBody, text } from "../../../../common/lib/zod.js";

export const MAX_MESSAGE_PRICE = 90000;

/** Число как `Math.trunc(Number(x))` старого маршрута: NaN остаётся NaN. */
const truncNumber = () => z.unknown().optional().transform((v) => Math.trunc(Number(v)));

// Набор ищется по id через ===, как getStarPack в server/data/pricing.js: id любого типа.
export const starsRequestSchema = requestBody({ packId: raw() });
export type StarsRequestDto = z.infer<typeof starsRequestSchema>;

// Права и получателя сервис проверяет раньше количества, поэтому проверка звёзд — там же.
export const starsGrantSchema = requestBody({
  userId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
  stars: truncNumber(),
});
export type StarsGrantDto = z.infer<typeof starsGrantSchema>;

export const messagePriceSchema = requestBody({
  stars: truncNumber().refine((price) => Number.isFinite(price) && price >= 0 && price <= MAX_MESSAGE_PRICE, {
    error: `Цена — от 0 до ${MAX_MESSAGE_PRICE} звёзд`,
  }),
});
export type MessagePriceDto = z.infer<typeof messagePriceSchema>;

// Сумма проверяется раньше получателя (как в server/routes/stars.js); «себе» сервис
// проверяет сам — схема не знает, кто переводит.
export const starsTransferSchema = requestBody({
  userId: text(),
  amount: z
    .unknown()
    .optional()
    .transform((v) => Math.floor(Number(v)))
    .refine((amount) => Number.isFinite(amount) && amount > 0, { error: "Укажите сумму больше нуля" })
    .refine((amount) => amount <= 1_000_000, { error: "Слишком большая сумма за один перевод" }),
  note: z.unknown().optional().transform((v) => String(v ?? "").trim().slice(0, 200)),
});
export type StarsTransferDto = z.infer<typeof starsTransferSchema>;
