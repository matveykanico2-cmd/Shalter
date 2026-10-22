import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Поля проверяет сервис — со своими текстами ошибок, как server/routes/stars.js.
export const starsRequestSchema = requestBody({ packId: raw() });
export type StarsRequestDto = z.infer<typeof starsRequestSchema>;

export const starsGrantSchema = requestBody({ userId: raw(), stars: raw() });
export type StarsGrantDto = z.infer<typeof starsGrantSchema>;

export const messagePriceSchema = requestBody({ stars: raw() });
export type MessagePriceDto = z.infer<typeof messagePriceSchema>;

export const starsTransferSchema = requestBody({ userId: raw(), amount: raw(), note: raw() });
export type StarsTransferDto = z.infer<typeof starsTransferSchema>;
