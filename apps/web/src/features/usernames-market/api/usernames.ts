import type { auctionsBody, marketBody } from "@shalter/shared/schemas/usernames";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type Auctions = z.infer<typeof auctionsBody>;
export type Auction = Auctions["auctions"][number];
export type Market = z.infer<typeof marketBody>;

const id = encodeURIComponent;

export const usernamesQueries = {
  /** Аукционы, баланс и шаг ставки (GET /api/usernames). */
  auctions: () => queryOptions({ queryKey: ["usernames", "auctions"], queryFn: ({ signal }) => http.get<Auctions>("/api/usernames", signal) }),
  /** Рынок: объявления владельцев (GET /api/usernames/market). */
  market: () => queryOptions({ queryKey: ["usernames", "market"], queryFn: ({ signal }) => http.get<Market>("/api/usernames/market", signal) }),
};

export const sellUsername = (priceStars: number) => http.post("/api/usernames/market", { priceStars });
export const withdrawListing = (listingId: string) => http.delete(`/api/usernames/market/${id(listingId)}`);
export const buyUsername = (listingId: string) => http.post(`/api/usernames/market/${id(listingId)}/buy`, {});
export const createAuction = (username: string, startPriceStars: number, hours: number) => http.post("/api/usernames", { username, startPriceStars, hours });
export const bidUsername = (auctionId: string, stars: number) => http.post(`/api/usernames/${id(auctionId)}/bid`, { stars });
export const closeAuction = (auctionId: string) => http.post(`/api/usernames/${id(auctionId)}/close`);
export const deleteAuction = (auctionId: string) => http.delete(`/api/usernames/${id(auctionId)}`);
export const grantUsername = (phone: string, username: string) => http.post("/api/usernames/grant", { phone, username });
