import type { donationOrderBody, requestToAdminBody } from "@shalter/shared/schemas/donations";
import type { buyWithStarsBody, premiumMeBody } from "@shalter/shared/schemas/premium";
import type { promoRedeemBody } from "@shalter/shared/schemas/promotions";
import type { searchBody } from "@shalter/shared/schemas/search";
import type { messagePriceBody, starsGrantedSelfBody, transferBody } from "@shalter/shared/schemas/stars";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type PremiumInfo = z.infer<typeof premiumMeBody>;
type DonationOrder = z.infer<typeof donationOrderBody>;
type ToAdmin = z.infer<typeof requestToAdminBody>;
/** Ответ /request: начислено сразу (главный админ), заказ с кодом или заявка админу в личку. */
export type PurchaseResponse = Partial<DonationOrder> & Partial<ToAdmin> & { granted?: boolean; delivered?: boolean };

export const premiumQueries = {
  /** Premium, тарифы и баланс звёзд (GET /api/premium/me). */
  me: () =>
    queryOptions({
      queryKey: ["premium", "me"],
      queryFn: ({ signal }) => http.get<PremiumInfo>("/api/premium/me", signal),
    }),
};

export const requestStars = (packId: string) =>
  http.post<PurchaseResponse & Partial<z.infer<typeof starsGrantedSelfBody>>>("/api/stars/request", { packId });

export const transferStars = (userId: string, amount: number) => http.post<z.infer<typeof transferBody>>("/api/stars/transfer", { userId, amount });

export const setMessagePrice = (stars: number) => http.post<z.infer<typeof messagePriceBody>>("/api/stars/price", { stars });

/** Получатель перевода — люди из глобального поиска. */
export const searchPeople = async (q: string) =>
  (await http.get<z.infer<typeof searchBody>>(`/api/search?q=${encodeURIComponent(q)}`)).users;

export const requestPremium = (plan: string) => http.post<PurchaseResponse>("/api/premium/request", { plan });

export const buyPremiumWithStars = (plan: string) => http.post<z.infer<typeof buyWithStarsBody>>("/api/premium/buy-with-stars", { plan });

export const openSupportChat = () => http.post<{ chatId: string }>("/api/support/chat");

/** Активировать промокод: приз начисляется сразу, message — что сказать пользователю. */
export const redeemPromoCode = (code: string) => http.post<z.infer<typeof promoRedeemBody>>("/api/promotions/redeem", { code });
