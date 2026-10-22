// Коллекционные юзернеймы (server/routes/usernames.js): аукционы
// (data/usernameAuctions.js rowToAuction) и вторичный рынок (data/usernameListings.js).
import { z } from "zod";
import { isoDate, okBody } from "./common";
import { publicUser } from "./user";

export const auctionBid = z.strictObject({ userId: z.string(), stars: z.number(), at: isoDate });

export const auction = z.strictObject({
  id: z.string().regex(/^ua_[a-z0-9]+_[0-9a-f]{8}$/),
  username: z.string(),
  startPriceStars: z.number(),
  bids: z.array(auctionBid),
  topBid: z.number().nullable(),
  topBidderId: z.string().nullable(),
  currentPriceStars: z.number(),
  endsAt: isoDate,
  status: z.enum(["open", "sold", "unsold", "cancelled"]),
  winnerId: z.string().optional(),
  soldForStars: z.number().optional(),
  createdAt: isoDate,
  settledAt: isoDate.optional(),
  expired: z.boolean(),
});

/** Аукцион в списке: лидер и моя последняя ставка. */
export const auctionView = auction.extend({ topBidder: publicUser.nullable(), myBid: z.number().nullable() });

export const auctionsBody = z.strictObject({ auctions: z.array(auctionView), balance: z.number(), minStep: z.number(), isAdmin: z.boolean() });
export const auctionBody = z.strictObject({ auction });
export const bidBody = z.strictObject({ auction, balance: z.number() });
export const auctionDeletedBody = okBody;
export const usernameGrantBody = z.strictObject({ user: publicUser });

export const listing = z.strictObject({
  id: z.string().regex(/^ul_\d+_[a-z0-9]{0,5}$/),
  username: z.string(),
  sellerId: z.string(),
  priceStars: z.number(),
  status: z.enum(["open", "sold", "withdrawn"]),
  buyerId: z.string().nullable(),
  soldAt: isoDate.nullable(),
  createdAt: isoDate,
});
export const listingView = listing.extend({ seller: publicUser, mine: z.boolean() });

export const marketBody = z.strictObject({ listings: z.array(listingView), balance: z.number() });
export const listingBody = z.strictObject({ listing });
export const marketBuyBody = z.strictObject({ ok: z.literal(true), username: z.string(), user: publicUser, balance: z.number() });
