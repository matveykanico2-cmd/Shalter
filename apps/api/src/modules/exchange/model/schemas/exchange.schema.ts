import { z } from "zod";
import { requestBody } from "../../../../common/lib/zod.js";

export const createCoinSchema = requestBody({
  symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/, "Тикер: 2–10 латинских букв или цифр"),
  name: z.string().trim().min(2, "Введите название").max(48, "Название слишком длинное"),
  description: z.string().trim().max(240, "Описание слишком длинное").default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Некорректный цвет"),
  rate: z.coerce.number().positive("Курс должен быть больше нуля").max(1_000_000_000, "Слишком большой курс"),
});
export const rateSchema = requestBody({ rate: z.coerce.number().positive("Курс должен быть больше нуля").max(1_000_000_000, "Слишком большой курс") });
export const creatorSchema = requestBody({ userId: z.string().trim().min(1), enabled: z.boolean() });
const amount = z.coerce.number().positive("Количество должно быть больше нуля").max(1_000_000_000, "Слишком большое количество");
export const mintSchema = requestBody({ userId: z.string().trim().min(1), amount });
export const transferSchema = requestBody({ chatId: z.string().trim().min(1), userId: z.string().trim().min(1), coinId: z.string().trim().min(1), amount });
export const convertSchema = requestBody({ fromCoinId: z.string().trim().min(1), toCoinId: z.string().trim().min(1), amount });
export type CreateCoinDto = z.infer<typeof createCoinSchema>;
export type RateDto = z.infer<typeof rateSchema>;
export type CreatorDto = z.infer<typeof creatorSchema>;
export type MintDto = z.infer<typeof mintSchema>;
export type TransferDto = z.infer<typeof transferSchema>;
export type ConvertDto = z.infer<typeof convertSchema>;
