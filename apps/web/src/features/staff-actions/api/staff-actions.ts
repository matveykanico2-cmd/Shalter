import type { chatVerifyBody } from "@shalter/shared/schemas/admin";
import type { premiumGrantBody, premiumMeBody } from "@shalter/shared/schemas/premium";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export const staffQueries = {
  /** Свой Premium и признак главного админа Shalter (GET /api/premium/me). */
  premium: () =>
    queryOptions({
      queryKey: ["premium", "me"],
      queryFn: ({ signal }) => http.get<z.infer<typeof premiumMeBody>>("/api/premium/me", signal),
    }),
};

export const setChatVerified = (chatId: string, verified: boolean) =>
  http.post<z.infer<typeof chatVerifyBody>>(`/api/admin/chats/${encodeURIComponent(chatId)}/verify`, { verified });

/** Выдать Premium на 30 дней или забрать. */
export const grantPremium = (userId: string, premium: boolean) => http.post<z.infer<typeof premiumGrantBody>>("/api/premium/grant", { userId, premium });
