import type { buyBody, convertBody, customSendBody, deliverBody, giftBody, giftListBody, shelfBody, shopBody } from "@shalter/shared/schemas/gifts";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

import type { GiftBackground } from "../lib/gift-background";

const baseKey = ["gifts"] as const;

export type GiftShop = z.infer<typeof shopBody>;

export const giftQueries = {
  baseKey,
  /** Витрина и баланс (GET /api/gifts). */
  shop: () =>
    queryOptions({
      queryKey: [...baseKey, "shop"],
      queryFn: ({ signal }) => http.get<GiftShop>("/api/gifts", signal),
    }),
  /** Свои нарисованные подарки (GET /api/gifts/custom); ошибка — пустой список, как в магазине. */
  custom: () =>
    queryOptions({
      queryKey: [...baseKey, "custom"],
      queryFn: async ({ signal }) => {
        try {
          return (await http.get<z.infer<typeof giftListBody>>("/api/gifts/custom", signal)).gifts;
        } catch {
          return [];
        }
      },
    }),
};

type SendArgs = { giftId: string; recipientId: string; background: GiftBackground | null; anonymous: boolean; note: string | null };

export const giftApi = {
  buy: (a: SendArgs) => http.post<z.infer<typeof buyBody>>("/api/gifts/buy", a),
  sendCustom: (a: SendArgs) => http.post<z.infer<typeof customSendBody> & { balance?: number; serial?: number | null }>("/api/gifts/custom/send", a),
  convert: (entryId: string) => http.post<z.infer<typeof convertBody>>(`/api/gifts/received/${encodeURIComponent(entryId)}/convert`),
  remove: (entryId: string) => http.delete<z.infer<typeof shelfBody>>(`/api/gifts/received/${encodeURIComponent(entryId)}`),
  setPinned: (entryId: string, pinned: boolean) => http.post<z.infer<typeof shelfBody>>(`/api/gifts/received/${encodeURIComponent(entryId)}/pin`, { pinned }),
  /** Выдать подарок без оплаты — главный админ. */
  deliver: (giftId: string, recipientId: string) => http.post<z.infer<typeof deliverBody>>("/api/gifts/deliver", { giftId, recipientId }),
  createCustom: (name: string, scene: unknown) => http.post<z.infer<typeof giftBody>>("/api/gifts/custom", { name, scene }),
  updateCustom: (id: string, patch: { scene?: unknown; name?: string }) => http.patch<z.infer<typeof giftBody>>(`/api/gifts/custom/${encodeURIComponent(id)}`, patch),
  deleteCustom: (id: string) => http.delete<{ ok: true }>(`/api/gifts/custom/${encodeURIComponent(id)}`),
};
