import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";
import { normalizeUsername } from "../../../users/lib/username.js";

// Права, аукцион и ник сервисы проверяют раньше чисел, поэтому схема только приводит поля,
// как server/routes/usernames.js; проверки с текстами — в сервисах.

const username = () => z.unknown().optional().transform(normalizeUsername);

export const createAuctionSchema = requestBody({
  username: username(),
  startPriceStars: z
    .unknown()
    .optional()
    .transform((v) => Math.max(0, Math.trunc(Number(v) || 0))),
  hours: z
    .unknown()
    .optional()
    .transform((v) => Math.max(1, Math.min(24 * 30, Math.trunc(Number(v) || 24)))),
});
export type CreateAuctionDto = z.infer<typeof createAuctionSchema>;

export const bidSchema = requestBody({
  stars: z
    .unknown()
    .optional()
    .transform((v) => Math.trunc(Number(v))),
});
export type BidDto = z.infer<typeof bidSchema>;

// phone и userId — как пришли: телефон не строкой падает в normalizePhone, а id ищется как
// есть, и всё это — только после проверки прав.
export const grantSchema = requestBody({ phone: raw(), userId: raw(), username: username() });
export type GrantDto = z.infer<typeof grantSchema>;

export const listingSchema = requestBody({
  priceStars: z
    .unknown()
    .optional()
    .transform((v) => Math.round(Number(v))),
});
export type ListingDto = z.infer<typeof listingSchema>;
