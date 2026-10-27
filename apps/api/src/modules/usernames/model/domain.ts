import type { usernameAuctions, usernameListings } from "../../db/schema.js";

export type UsernameAuctionRow = typeof usernameAuctions.$inferSelect;
export type UsernameListingRow = typeof usernameListings.$inferSelect;

export interface AuctionBid {
  userId: string;
  stars: number;
  at: string;
}

/** Аукцион как его отдаёт server/data/usernameAuctions.js (rowToAuction). */
export interface UsernameAuction {
  id: string;
  username: string;
  startPriceStars: number;
  bids: AuctionBid[];
  topBid: number | null;
  topBidderId: string | null;
  currentPriceStars: number;
  endsAt: string;
  status: string;
  winnerId?: string;
  soldForStars?: number;
  createdAt: string;
  settledAt?: string;
  /** Открыт, но срок вышел — итоги ещё не подведены. */
  expired: boolean;
}

/** Объявление о продаже ника (server/data/usernameListings.js). */
export type UsernameListing = UsernameListingRow;
