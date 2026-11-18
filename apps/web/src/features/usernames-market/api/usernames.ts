import type { auctionsBody, marketBody, ownedUsernamesBody } from "@shalter/shared/schemas/usernames";
import type { patchProfileBody } from "@shalter/shared/schemas/users";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type Auctions = z.infer<typeof auctionsBody>;
export type Auction = Auctions["auctions"][number];
export type Market = z.infer<typeof marketBody>;
export type OwnedUsername = z.infer<typeof ownedUsernamesBody>['usernames'][number];

const id = encodeURIComponent;

export const usernamesQueries = {
  /** Аукционы, баланс и шаг ставки (GET /api/usernames). */
  auctions: () => queryOptions({ queryKey: ["usernames", "auctions"], queryFn: ({ signal }) => http.get<Auctions>("/api/usernames", signal) }),
  /** Рынок: объявления владельцев (GET /api/usernames/market). */
  market: () => queryOptions({ queryKey: ["usernames", "market"], queryFn: ({ signal }) => http.get<Market>("/api/usernames/market", signal) }),
  mine: () => queryOptions({ queryKey: ["usernames", "mine"], queryFn: ({ signal }) => http.get<{ usernames: OwnedUsername[] }>("/api/usernames/mine", signal) }),
};

export const sellUsername = (priceStars: number, username?: string) => http.post("/api/usernames/market", { priceStars, ...(username ? { username } : {}) });
export const withdrawListing = (listingId: string) => http.delete(`/api/usernames/market/${id(listingId)}`);
export const buyUsername = (listingId: string) => http.post(`/api/usernames/market/${id(listingId)}/buy`, {});
export const transferUsername = (listingId: string, target: string) => http.post(`/api/usernames/market/${id(listingId)}/transfer`, { target });
export const createAuction = (username: string, startPriceStars: number, hours: number) => http.post("/api/usernames", { username, startPriceStars, hours });
export const bidUsername = (auctionId: string, stars: number) => http.post(`/api/usernames/${id(auctionId)}/bid`, { stars });
export const closeAuction = (auctionId: string) => http.post(`/api/usernames/${id(auctionId)}/close`);
export const deleteAuction = (auctionId: string) => http.delete(`/api/usernames/${id(auctionId)}`);
export const grantUsername = (phone: string, username: string) => http.post("/api/usernames/grant", { phone, username });
export const activateUsername = async (userId: string, username: string) => {
  const { user } = await http.patch<z.infer<typeof patchProfileBody>>(`/api/users/${encodeURIComponent(userId)}`, { username });
  if (!user) throw new Error("Не удалось установить юзернейм");
  return user;
};
export const setPrimaryUsername = (username: string) => http.post("/api/usernames/mine/primary", { username });
export const pinUsername = (username: string, pinned = true) => http.post("/api/usernames/mine/pin", { username, pinned });
