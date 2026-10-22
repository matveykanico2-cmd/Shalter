import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Поля проверяют сервисы — со своими текстами ошибок, как server/routes/usernames.js.

export const createAuctionSchema = requestBody({ username: raw(), startPriceStars: raw(), hours: raw() });
export type CreateAuctionDto = z.infer<typeof createAuctionSchema>;

export const bidSchema = requestBody({ stars: raw() });
export type BidDto = z.infer<typeof bidSchema>;

export const grantSchema = requestBody({ phone: raw(), userId: raw(), username: raw() });
export type GrantDto = z.infer<typeof grantSchema>;

export const listingSchema = requestBody({ priceStars: raw() });
export type ListingDto = z.infer<typeof listingSchema>;
